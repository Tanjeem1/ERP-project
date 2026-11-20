import uuid
from dataclasses import dataclass
from decimal import Decimal

from django.db import models, transaction
from django.db.models import F, Value
from django.db.models.functions import Coalesce, Greatest
from django.utils import timezone

from core.models import ActivityType, ApprovalEntityType, ApprovalReviewStatus, ApprovalRule, ApprovalStatus, ApprovalRequest, Currency, DocumentKind, JournalSourceType, PaymentMethod
from core.services.actors import Permission, actor_kwargs, assert_permission, record_activity, record_audit
from core.services.documents import next_document_number
from core.services.ledger import LedgerLine, post_journal
from core.services.money import ServiceError, allocate_money, base_value, datetime_value, four_decimals, line_total, minor_units, money, non_negative, positive, sum_money, whole_quantity
from inventory.models import InventoryLayer, StockBalance, WarehouseStatus
from inventory.services import lock_stock_positions
from procurement.models import GoodsReceiptItem, GoodsReceiptNote, LandedCostAllocation, LandedCostAllocationMethod, PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, Vendor, VendorPayment, VendorStatus


@dataclass(frozen=True)
class LandedCostPreviewLine:
    purchase_order_item_id: object
    sku_id: object
    sku: str
    product_name: str
    quantity: Decimal
    source_unit_cost: Decimal
    base_unit_cost: Decimal
    base_goods_cost: Decimal
    basis_quantity: Decimal
    basis_share: Decimal
    allocations: dict
    allocated_landed_cost: Decimal
    true_unit_cost: Decimal
    true_total_cost: Decimal


@dataclass(frozen=True)
class LandedCostPreview:
    purchase_order_id: object
    warehouse_id: object
    allocation_method: str
    costs: dict
    lines: list[LandedCostPreviewLine]
    total_goods_base: Decimal
    total_allocated_cost: Decimal
    total_inventory_base: Decimal
    total_debit: Decimal
    total_credit: Decimal


def create_vendor(organization, actor, *, code, name, contact_name, email="", currency=Currency.USD, payment_terms_days=30, country_code="US", status=VendorStatus.ACTIVE):
    assert_permission(actor, organization, Permission.MANAGE_PROCUREMENT)
    if currency not in Currency.values or status not in VendorStatus.values:
        raise ServiceError("Invalid vendor currency or status.")
    vendor = Vendor.objects.create(
        organization=organization,
        code=code.strip().upper(),
        name=name.strip(),
        contact_name=contact_name.strip(),
        email=email.strip().lower(),
        currency=currency,
        payment_terms_days=payment_terms_days,
        country_code=country_code.upper(),
        status=status,
    )
    record_audit(organization, actor, "Vendor created", "Vendor", vendor.id, new_value={"code": vendor.code, "name": vendor.name})
    return vendor


def update_vendor(organization, actor, vendor_id, **changes):
    assert_permission(actor, organization, Permission.MANAGE_PROCUREMENT)
    vendor = Vendor.objects.get(organization=organization, pk=vendor_id)
    old_value = {"code": vendor.code, "name": vendor.name, "status": vendor.status, "currency": vendor.currency}
    allowed = {"code", "name", "contact_name", "email", "currency", "payment_terms_days", "country_code", "status"}
    for key, value in changes.items():
        if key not in allowed:
            raise ServiceError(f"Unsupported vendor field: {key}")
        if key == "code":
            value = value.strip().upper()
        elif key == "email":
            value = value.strip().lower()
        elif key == "country_code":
            value = value.upper()
        setattr(vendor, key, value)
    vendor.full_clean()
    vendor.save()
    record_audit(organization, actor, "Vendor updated", "Vendor", vendor.id, old_value=old_value, new_value={"code": vendor.code, "name": vendor.name, "status": vendor.status, "currency": vendor.currency})
    return vendor


def _approval_rule(organization, entity_type):
    rule, _ = ApprovalRule.objects.get_or_create(
        organization=organization,
        entity_type=entity_type,
        defaults={
            "threshold_amount": Decimal("5000.00") if entity_type == ApprovalEntityType.PURCHASE_ORDER else Decimal("0.00"),
            "enforce_credit_limit": entity_type == ApprovalEntityType.SALES_ORDER,
            "approver_roles": ["SUPER_ADMIN", "ACCOUNTANT"],
            "is_active": True,
        },
    )
    return rule


@transaction.atomic
def create_purchase_order(organization, actor, *, vendor_id, destination_warehouse_id, currency, exchange_rate, expected_at, reference, lines):
    assert_permission(actor, organization, Permission.MANAGE_PROCUREMENT)
    if currency not in Currency.values:
        raise ServiceError("Unsupported purchase order currency.")
    if not lines:
        raise ServiceError("A purchase order requires at least one line.")
    if len({line["sku_id"] for line in lines}) != len(lines):
        raise ServiceError("Each SKU can appear only once in a purchase order.")
    vendor = Vendor.objects.get(organization=organization, pk=vendor_id, status=VendorStatus.ACTIVE)
    from inventory.models import Warehouse

    Warehouse.objects.get(organization=organization, pk=destination_warehouse_id, status=WarehouseStatus.ACTIVE)
    exchange_rate = positive(exchange_rate)
    prepared = []
    for line in lines:
        quantity = whole_quantity(line["quantity"])
        unit_cost = non_negative(line["unit_cost"])
        prepared.append((line["sku_id"], quantity, unit_cost))
    total = sum_money(quantity * unit_cost for _, quantity, unit_cost in prepared)
    total_base = sum_money(quantity * unit_cost * exchange_rate for _, quantity, unit_cost in prepared)
    rule = _approval_rule(organization, ApprovalEntityType.PURCHASE_ORDER)
    requires_approval = total_base > rule.threshold_amount
    order = PurchaseOrder.objects.create(
        organization=organization,
        number=next_document_number(organization, DocumentKind.PURCHASE_ORDER),
        vendor=vendor,
        destination_warehouse_id=destination_warehouse_id,
        status=PurchaseOrderStatus.PENDING_APPROVAL if requires_approval else PurchaseOrderStatus.DRAFT,
        approval_status=ApprovalStatus.PENDING if requires_approval else ApprovalStatus.NOT_REQUIRED,
        approval_reason=f"Purchase order value {total_base} {organization.base_currency} exceeds the approval threshold." if requires_approval else "",
        currency=currency,
        exchange_rate=exchange_rate,
        reference=reference.strip(),
        expected_at=expected_at,
        total_amount=total,
        total_base_amount=total_base,
        **actor_kwargs(actor),
    )
    for sku_id, quantity, unit_cost in prepared:
        PurchaseOrderItem.objects.create(organization=organization, purchase_order=order, sku_id=sku_id, ordered_quantity=quantity, unit_cost=unit_cost)
    if requires_approval:
        ApprovalRequest.objects.create(
            organization=organization,
            rule=rule,
            purchase_order=order,
            requested_by=actor,
            requested_by_role=actor.role,
            reason=order.approval_reason,
        )
    record_audit(organization, actor, "Purchase order created", "PurchaseOrder", order.id, new_value={"number": order.number, "status": order.status, "total_base": str(total_base)})
    return order


@transaction.atomic
def approve_purchase_order(organization, actor, purchase_order_id):
    assert_permission(actor, organization, Permission.APPROVE_TRANSACTIONS)
    order = PurchaseOrder.objects.select_for_update().get(organization=organization, pk=purchase_order_id)
    if order.status not in {PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL}:
        raise ServiceError("Only draft or pending purchase orders can be approved.")
    if order.approval_status == ApprovalStatus.REJECTED:
        raise ServiceError("A rejected purchase order cannot be approved.")
    now = timezone.now()
    order.status = PurchaseOrderStatus.APPROVED
    order.approval_status = ApprovalStatus.APPROVED
    order.approved_by = actor
    order.approved_by_role = actor.role
    order.approved_at = now
    order.save(update_fields=["status", "approval_status", "approved_by", "approved_by_role", "approved_at", "updated_at"])
    ApprovalRequest.objects.filter(organization=organization, purchase_order=order, status=ApprovalReviewStatus.PENDING).update(
        status=ApprovalReviewStatus.APPROVED,
        reviewed_by=actor,
        reviewed_at=now,
    )
    record_audit(organization, actor, "Purchase order approved", "PurchaseOrder", order.id, old_value={"status": "PENDING_APPROVAL"}, new_value={"status": order.status, "approved_by_role": actor.role})
    return order


@transaction.atomic
def mark_purchase_order_in_transit(organization, actor, purchase_order_id):
    assert_permission(actor, organization, Permission.MANAGE_PROCUREMENT)
    order = PurchaseOrder.objects.select_for_update().get(organization=organization, pk=purchase_order_id)
    if order.status != PurchaseOrderStatus.APPROVED:
        raise ServiceError("Only an approved purchase order can move into transit.")
    order.status = PurchaseOrderStatus.IN_TRANSIT
    order.save(update_fields=["status", "updated_at"])
    items = list(order.items.all())
    lock_stock_positions(organization, [(item.sku_id, order.destination_warehouse_id) for item in items])
    for item in items:
        outstanding = item.ordered_quantity - item.received_quantity
        StockBalance.objects.filter(organization=organization, sku_id=item.sku_id, warehouse_id=order.destination_warehouse_id).update(
            in_transit=F("in_transit") + outstanding,
            updated_at=timezone.now(),
        )
    record_audit(organization, actor, "Purchase order marked in transit", "PurchaseOrder", order.id, new_value={"status": order.status})
    return order


def preview_landed_costs(organization, *, purchase_order_id, warehouse_id, allocation_method, costs, lines):
    try:
        order = PurchaseOrder.objects.select_related("vendor", "destination_warehouse").get(organization=organization, pk=purchase_order_id)
    except PurchaseOrder.DoesNotExist as error:
        raise ServiceError("Purchase order not found.") from error
    if order.status in {PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL, PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.RECEIVED}:
        raise ServiceError("This purchase order cannot be received in its current state.")
    if warehouse_id != order.destination_warehouse_id:
        raise ServiceError("Receipt warehouse must match the purchase order destination.")
    method = allocation_method.upper()
    if method not in LandedCostAllocationMethod.values:
        raise ServiceError("Allocation method must be weight, volume, or value.")
    if not lines:
        raise ServiceError("Add at least one receipt line.")
    if len({line["purchase_order_item_id"] for line in lines}) != len(lines):
        raise ServiceError("Each purchase order line can appear only once.")
    cost_currency = costs.get("currency", organization.base_currency)
    if cost_currency not in Currency.values:
        raise ServiceError("Unsupported landed-cost currency.")
    exchange_rate = Decimal("1.0000") if cost_currency == organization.base_currency else positive(costs["exchange_rate"])
    source_fees = {key: non_negative(costs.get(key, Decimal("0"))) for key in ("freight", "customs", "port_handling", "insurance")}
    base_fees = {key: base_value(value, exchange_rate) for key, value in source_fees.items()}
    prepared = []
    for line in lines:
        quantity = whole_quantity(line["quantity"])
        try:
            item = order.items.select_related("sku").get(pk=line["purchase_order_item_id"])
        except PurchaseOrderItem.DoesNotExist as error:
            raise ServiceError("A receipt line does not belong to this purchase order.") from error
        outstanding = item.ordered_quantity - item.received_quantity
        if quantity > outstanding:
            raise ServiceError(f"Receipt quantity exceeds the {outstanding} units outstanding.")
        base_goods_cost = money(item.unit_cost * quantity * order.exchange_rate)
        if method == LandedCostAllocationMethod.WEIGHT:
            basis = item.sku.weight_kg * quantity
        elif method == LandedCostAllocationMethod.VOLUME:
            basis = item.sku.volume_cbm * quantity
        else:
            basis = base_goods_cost
        prepared.append((item, quantity, base_goods_cost, basis))
    basis_total = sum((item[3] for item in prepared), Decimal("0"))
    if basis_total <= 0 and sum(base_fees.values(), Decimal("0")) > 0:
        raise ServiceError("The selected allocation basis has a zero total. Choose another method.")
    bases = [item[3] for item in prepared]
    allocations = {key: allocate_money(value, bases) for key, value in base_fees.items()}
    result_lines = []
    for index, (item, quantity, base_goods_cost, basis) in enumerate(prepared):
        allocated = {key: values[index] for key, values in allocations.items()}
        allocated_total = sum_money(allocated.values())
        true_total = money(base_goods_cost + allocated_total)
        result_lines.append(LandedCostPreviewLine(
            purchase_order_item_id=item.id,
            sku_id=item.sku_id,
            sku=item.sku.sku,
            product_name=item.sku.name,
            quantity=quantity,
            source_unit_cost=item.unit_cost,
            base_unit_cost=base_goods_cost / quantity,
            base_goods_cost=base_goods_cost,
            basis_quantity=basis,
            basis_share=basis / basis_total if basis_total else Decimal("0"),
            allocations=allocated,
            allocated_landed_cost=allocated_total,
            true_unit_cost=four_decimals(true_total / quantity),
            true_total_cost=true_total,
        ))
    total_goods = sum_money(line.base_goods_cost for line in result_lines)
    total_allocated = sum_money(line.allocated_landed_cost for line in result_lines)
    total_inventory = money(total_goods + total_allocated)
    return LandedCostPreview(
        purchase_order_id=order.id,
        warehouse_id=warehouse_id,
        allocation_method=method,
        costs={**source_fees, "currency": cost_currency, "exchange_rate": exchange_rate, "base": base_fees},
        lines=result_lines,
        total_goods_base=total_goods,
        total_allocated_cost=total_allocated,
        total_inventory_base=total_inventory,
        total_debit=total_inventory,
        total_credit=total_inventory,
    )


@transaction.atomic
def post_goods_receipt(organization, actor, *, purchase_order_id, warehouse_id, allocation_method, costs, lines, received_at=None):
    assert_permission(actor, organization, Permission.MANAGE_PROCUREMENT)
    order = PurchaseOrder.objects.select_for_update().get(organization=organization, pk=purchase_order_id)
    if order.status not in {PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.IN_TRANSIT}:
        raise ServiceError("Only an approved or in-transit purchase order can be received.")
    preview = preview_landed_costs(
        organization,
        purchase_order_id=purchase_order_id,
        warehouse_id=warehouse_id,
        allocation_method=allocation_method,
        costs=costs,
        lines=lines,
    )
    lock_stock_positions(organization, [(line.sku_id, warehouse_id) for line in preview.lines])
    timestamp = datetime_value(received_at)
    receipt_id = uuid.uuid4()
    receipt_number = next_document_number(organization, DocumentKind.GOODS_RECEIPT)
    journal = post_journal(
        organization,
        actor,
        JournalSourceType.GOODS_RECEIPT,
        receipt_id,
        receipt_number,
        f"/app/procurement?grn={receipt_id}",
        f"Goods receipt {receipt_number} with landed-cost capitalization",
        [
            LedgerLine("103000", "Inventory Asset including landed costs", debit=preview.total_inventory_base),
            LedgerLine("201000", "Accrued Accounts Payable for goods", credit=preview.total_goods_base),
            LedgerLine("202000", "Freight and duty clearing", credit=preview.total_allocated_cost),
        ],
        timestamp=timestamp,
    )
    receipt = GoodsReceiptNote.objects.create(
        id=receipt_id,
        organization=organization,
        number=receipt_number,
        purchase_order=order,
        purchase_order_number=order.number,
        warehouse_id=warehouse_id,
        received_at=timestamp,
        allocation_method=preview.allocation_method,
        freight_source=preview.costs["freight"],
        customs_source=preview.costs["customs"],
        port_handling_source=preview.costs["port_handling"],
        insurance_source=preview.costs["insurance"],
        cost_currency=preview.costs["currency"],
        cost_exchange_rate=preview.costs["exchange_rate"],
        total_goods_base=preview.total_goods_base,
        total_landed_cost_base=preview.total_allocated_cost,
        total_inventory_base=preview.total_inventory_base,
        journal_entry=journal,
        **actor_kwargs(actor),
    )
    was_in_transit = order.status == PurchaseOrderStatus.IN_TRANSIT
    for preview_line in preview.lines:
        item = PurchaseOrderItem.objects.get(pk=preview_line.purchase_order_item_id)
        updated = PurchaseOrderItem.objects.filter(pk=item.pk, ordered_quantity__gte=F("received_quantity") + preview_line.quantity).update(
            received_quantity=F("received_quantity") + preview_line.quantity,
            updated_at=timestamp,
        )
        if updated != 1:
            raise ServiceError("Another receipt changed the outstanding quantity. Refresh and retry.")
        layer = InventoryLayer.objects.create(
            organization=organization,
            sku_id=preview_line.sku_id,
            warehouse_id=warehouse_id,
            purchase_order=order,
            goods_receipt=receipt,
            batch_code=f"{receipt_number}-{preview_line.sku}",
            received_at=timestamp,
            initial_quantity=preview_line.quantity,
            remaining_quantity=preview_line.quantity,
            source_unit_cost=preview_line.source_unit_cost,
            source_currency=order.currency,
            unit_cost=money(preview_line.true_total_cost / preview_line.quantity),
            allocated_landed_unit_cost=money(preview_line.true_total_cost / preview_line.quantity - preview_line.base_unit_cost),
            remaining_value=preview_line.true_total_cost,
        )
        receipt_item = GoodsReceiptItem.objects.create(
            organization=organization,
            receipt=receipt,
            purchase_order_item=item,
            sku_id=preview_line.sku_id,
            quantity=preview_line.quantity,
            source_unit_cost=preview_line.source_unit_cost,
            base_unit_cost=preview_line.base_unit_cost,
            base_goods_cost=preview_line.base_goods_cost,
            basis_quantity=preview_line.basis_quantity,
            basis_share=preview_line.basis_share,
            allocated_landed_cost=preview_line.allocated_landed_cost,
            true_unit_cost=preview_line.true_unit_cost,
            true_total_cost=preview_line.true_total_cost,
            cost_layer=layer,
        )
        total_basis = sum(line.basis_quantity for line in preview.lines)
        remainder_cents = {}
        for fee_name, allocated in preview_line.allocations.items():
            if total_basis == 0:
                remainder_cents[fee_name] = 0
                continue
            exact = Decimal(minor_units(preview.costs["base"][fee_name])) * preview_line.basis_quantity / total_basis
            remainder_cents[fee_name] = minor_units(allocated) - int(exact)
        LandedCostAllocation.objects.create(
            organization=organization,
            receipt_item=receipt_item,
            method=preview.allocation_method,
            freight_base=preview_line.allocations["freight"],
            customs_base=preview_line.allocations["customs"],
            port_handling_base=preview_line.allocations["port_handling"],
            insurance_base=preview_line.allocations["insurance"],
            remainder_cents=remainder_cents,
        )
        inbound_delta = -preview_line.quantity if was_in_transit else item.ordered_quantity - item.received_quantity - preview_line.quantity
        StockBalance.objects.filter(organization=organization, sku_id=preview_line.sku_id, warehouse_id=warehouse_id).update(
            on_hand=F("on_hand") + preview_line.quantity,
            in_transit=Greatest(F("in_transit") + inbound_delta, Decimal("0")),
            updated_at=timestamp,
        )
    if order.items.filter(received_quantity__lt=F("ordered_quantity")).exists():
        order.status = PurchaseOrderStatus.IN_TRANSIT
    else:
        order.status = PurchaseOrderStatus.RECEIVED
    order.save(update_fields=["status", "updated_at"])
    Vendor.objects.filter(pk=order.vendor_id).update(payable_balance=F("payable_balance") + preview.total_goods_base)
    record_activity(organization, ActivityType.PROCUREMENT, "Landed receipt posted", f"{receipt_number} capitalized {preview.total_allocated_cost} of import charges into {preview.total_inventory_base} of inventory.", receipt_number, f"/app/procurement?grn={receipt.id}", [journal])
    record_audit(organization, actor, "Goods receipt posted", "GoodsReceiptNote", receipt.id, new_value={"number": receipt.number, "inventory": str(preview.total_inventory_base), "journal": journal.number})
    return receipt


@transaction.atomic
def record_vendor_payment(organization, actor, *, vendor_id, purchase_order_id=None, payment_method, amount, currency, exchange_rate, paid_at=None, reference, notes=""):
    assert_permission(actor, organization, Permission.POST_EXPENSES)
    if payment_method not in {PaymentMethod.CASH, PaymentMethod.BANK, PaymentMethod.MOBILE_BANKING}:
        raise ServiceError("Unsupported vendor payment method.")
    vendor = Vendor.objects.get(organization=organization, pk=vendor_id)
    if currency not in Currency.values:
        raise ServiceError("Unsupported payment currency.")
    if not reference.strip():
        raise ServiceError("Payment reference is required.")
    if purchase_order_id:
        order = PurchaseOrder.objects.get(organization=organization, pk=purchase_order_id, vendor=vendor)
    else:
        order = None
    amount = positive(amount)
    amount_base = base_value(amount, exchange_rate)
    account_code = {PaymentMethod.CASH: "101000", PaymentMethod.BANK: "101100", PaymentMethod.MOBILE_BANKING: "101200"}[payment_method]
    payment_id = uuid.uuid4()
    number = next_document_number(organization, DocumentKind.VENDOR_PAYMENT)
    journal = post_journal(
        organization,
        actor,
        JournalSourceType.VENDOR_PAYMENT,
        payment_id,
        number,
        "/app/vendors",
        f"Vendor payment {number} to {vendor.name}",
        [
            LedgerLine("201000", "Accounts Payable reduced", debit=amount_base),
            LedgerLine(account_code, f"Vendor payment via {payment_method}", credit=amount_base),
        ],
        timestamp=datetime_value(paid_at),
        liquidity_account_codes=[account_code],
    )
    payment = VendorPayment.objects.create(
        id=payment_id,
        organization=organization,
        number=number,
        vendor=vendor,
        purchase_order=order,
        payment_method=payment_method,
        payment_account_id=journal.lines.get(account__code=account_code).account_id,
        amount=amount,
        currency=currency,
        exchange_rate=exchange_rate,
        amount_base=amount_base,
        paid_at=datetime_value(paid_at),
        reference=reference.strip(),
        notes=notes.strip(),
        journal_entry=journal,
        **actor_kwargs(actor),
    )
    updated = Vendor.objects.filter(pk=vendor.pk, payable_balance__gte=amount_base).update(payable_balance=F("payable_balance") - amount_base)
    if updated != 1:
        raise ServiceError("Vendor payment exceeds the remaining payable balance.")
    record_activity(organization, ActivityType.FINANCE, "Vendor payment posted", f"{number} reduced supplier payable by {amount_base} {organization.base_currency}.", number, "/app/vendors", [journal])
    record_audit(organization, actor, "Vendor payment recorded", "VendorPayment", payment.id, new_value={"number": number, "amount_base": str(amount_base), "journal": journal.number})
    return payment


def vendor_directory(organization):
    purchases = PurchaseOrder.objects.filter(vendor=models.OuterRef("pk")).values("vendor").annotate(total=models.Sum("total_base_amount")).values("total")
    payments = VendorPayment.objects.filter(vendor=models.OuterRef("pk")).values("vendor").annotate(total=models.Sum("amount_base")).values("total")
    last_payment = VendorPayment.objects.filter(vendor=models.OuterRef("pk")).values("vendor").annotate(value=models.Max("paid_at")).values("value")
    return Vendor.objects.filter(organization=organization).annotate(
        total_purchased=Coalesce(models.Subquery(purchases), Value(Decimal("0.0000"))),
        total_paid=Coalesce(models.Subquery(payments), Value(Decimal("0.0000"))),
        last_payment_date=models.Subquery(last_payment),
    ).prefetch_related("purchase_orders").order_by("name")


@transaction.atomic
def reject_purchase_order(organization, actor, purchase_order_id, reason):
    assert_permission(actor, organization, Permission.APPROVE_TRANSACTIONS)
    if not reason.strip():
        raise ServiceError("An approval rejection reason is required.")
    order = PurchaseOrder.objects.select_for_update().get(organization=organization, pk=purchase_order_id)
    if order.status != PurchaseOrderStatus.PENDING_APPROVAL:
        raise ServiceError("Only a purchase order pending approval can be rejected.")
    order.status = PurchaseOrderStatus.CANCELLED
    order.approval_status = ApprovalStatus.REJECTED
    order.approval_reason = reason.strip()
    order.approved_by = actor
    order.approved_by_role = actor.role
    order.approved_at = timezone.now()
    order.save(update_fields=["status", "approval_status", "approval_reason", "approved_by", "approved_by_role", "approved_at", "updated_at"])
    ApprovalRequest.objects.filter(organization=organization, purchase_order=order, status=ApprovalReviewStatus.PENDING).update(
        status=ApprovalReviewStatus.REJECTED, reviewed_by=actor, reviewed_at=order.approved_at,
    )
    record_audit(organization, actor, "Purchase order rejected", "PurchaseOrder", order.id, old_value={"status": "PENDING_APPROVAL"}, new_value={"status": order.status, "reason": order.approval_reason})
    return order
