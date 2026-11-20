import uuid
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import PermissionDenied
from django.db import models, transaction
from django.db.models import DecimalField, F, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from core.models import ActivityType, ApprovalEntityType, ApprovalReviewStatus, ApprovalStatus, ApprovalRequest, Currency, DocumentKind, JournalSourceType, PaymentMethod, PaymentStatus
from core.services.actors import Permission, ROLE_PERMISSIONS, actor_kwargs, assert_permission, record_activity, record_audit
from core.services.approvals import approval_rule
from core.services.documents import next_document_number
from core.services.ledger import LedgerLine, post_journal
from core.services.money import ServiceError, base_value, datetime_value, line_total, money, non_negative, positive, sum_money, whole_quantity
from core.services.time import local_date_range, local_day_bounds, month_to_date_bounds, today_bounds
from finance.models import Account
from inventory.models import InventoryLayer, ReservationStatus, StockBalance, StockReservation
from inventory.services import consume_fifo_layers, consume_order_reservation, reserve_sales_order_items
from orders.models import CreditNote, Customer, CustomerPayment, Invoice, InvoiceLine, InvoiceStatus, OrderChannel, OrderStatus, PaymentAllocation, ReturnCondition, SalesOrder, SalesOrderItem, SalesReturn, SalesReturnItem, SalesReturnStatus


@dataclass(frozen=True)
class ShipOrderResult:
    invoice: Invoice
    cogs_journal: object
    revenue_journal: object
    cogs_base: Decimal


@dataclass(frozen=True)
class PosCheckoutResult:
    order: SalesOrder
    invoice: Invoice | None
    payments: list[CustomerPayment]
    customer_due: Decimal


def _address(customer):
    return {
        "address_line1": customer.address_line1,
        "address_line2": customer.address_line2,
        "city": customer.city,
        "region": customer.region,
        "postal_code": customer.postal_code,
        "country_code": customer.country_code,
    }


def create_customer(organization, actor, *, code, name, contact_name, email="", currency=Currency.USD, payment_terms_days=30, tax_rate=Decimal("0"), credit_limit=Decimal("0"), **address):
    assert_permission(actor, organization, Permission.CREATE_ORDERS)
    if currency not in Currency.values:
        raise ServiceError("Unsupported customer currency.")
    customer = Customer(
        organization=organization,
        code=code.strip().upper(),
        name=name.strip(),
        contact_name=contact_name.strip(),
        email=email.strip().lower(),
        currency=currency,
        payment_terms_days=payment_terms_days,
        tax_rate=non_negative(tax_rate),
        credit_limit=non_negative(credit_limit),
        **address,
    )
    customer.full_clean()
    customer.save()
    record_audit(organization, actor, "Customer created", "Customer", customer.id, new_value={"code": customer.code, "name": customer.name, "credit_limit": str(customer.credit_limit)})
    return customer


def update_customer(organization, actor, customer_id, **changes):
    assert_permission(actor, organization, Permission.POST_EXPENSES)
    customer = Customer.objects.get(organization=organization, pk=customer_id)
    old_value = {"name": customer.name, "credit_limit": str(customer.credit_limit), "payment_terms_days": customer.payment_terms_days}
    allowed = {"name", "contact_name", "email", "currency", "payment_terms_days", "tax_rate", "credit_limit", "address_line1", "address_line2", "city", "region", "postal_code", "country_code"}
    for key, value in changes.items():
        if key not in allowed:
            raise ServiceError(f"Unsupported customer field: {key}")
        if key in {"tax_rate", "credit_limit"}:
            value = non_negative(value)
        if key == "email":
            value = value.strip().lower()
        if key in {"name", "contact_name"}:
            value = value.strip()
        setattr(customer, key, value)
    customer.full_clean()
    customer.save()
    record_audit(organization, actor, "Customer terms updated", "Customer", customer.id, old_value=old_value, new_value={"name": customer.name, "credit_limit": str(customer.credit_limit), "payment_terms_days": customer.payment_terms_days})
    return customer


def _order_totals(customer, lines, exchange_rate):
    subtotal = sum_money(line["quantity"] * line["unit_price"] for line in lines)
    tax = money(subtotal * customer.tax_rate / 100)
    subtotal_base = base_value(subtotal, exchange_rate)
    tax_base = base_value(tax, exchange_rate)
    return subtotal, tax, money(subtotal + tax), subtotal_base, tax_base, money(subtotal_base + tax_base)


@transaction.atomic
def create_sales_order(organization, actor, *, customer_id, warehouse_id, channel, currency, exchange_rate, reference, lines):
    assert_permission(actor, organization, Permission.CREATE_ORDERS)
    if channel not in OrderChannel.values or currency not in Currency.values:
        raise ServiceError("Unsupported order channel or currency.")
    if not lines:
        raise ServiceError("A sales order requires at least one line.")
    if len({line["sku_id"] for line in lines}) != len(lines):
        raise ServiceError("Each SKU can appear only once in an order.")
    customer = Customer.objects.get(organization=organization, pk=customer_id)
    from inventory.models import Warehouse, WarehouseStatus, SKU

    Warehouse.objects.get(organization=organization, pk=warehouse_id, status=WarehouseStatus.ACTIVE)
    exchange_rate = positive(exchange_rate)
    if currency != organization.base_currency and exchange_rate == Decimal("1.0000"):
        raise ServiceError("An explicit exchange rate is required for a foreign-currency order.")
    prepared = []
    for line in lines:
        sku = SKU.objects.get(organization=organization, pk=line["sku_id"], is_active=True)
        prepared.append({"sku": sku, "quantity": whole_quantity(line["quantity"]), "unit_price": non_negative(line["unit_price"])})
    subtotal, tax, total, subtotal_base, tax_base, total_base = _order_totals(customer, prepared, exchange_rate)
    rule = approval_rule(organization, ApprovalEntityType.SALES_ORDER)
    exceeds_credit = rule.enforce_credit_limit and customer.receivable_balance + total_base > customer.credit_limit
    order_number = next_document_number(organization, DocumentKind.SALES_ORDER)
    order = SalesOrder.objects.create(
        organization=organization,
        number=order_number,
        customer=customer,
        warehouse_id=warehouse_id,
        channel=channel,
        status=OrderStatus.PENDING_APPROVAL if exceeds_credit else OrderStatus.ORDER_PLACED,
        approval_status=ApprovalStatus.PENDING if exceeds_credit else ApprovalStatus.NOT_REQUIRED,
        approval_reason=f"Projected customer exposure {customer.receivable_balance + total_base} exceeds the {customer.credit_limit} credit limit." if exceeds_credit else "",
        currency=currency,
        exchange_rate=exchange_rate,
        reference=reference.strip() or (f"POS-{order_number.removeprefix('SO-')}" if channel == OrderChannel.POS else order_number),
        subtotal=subtotal,
        tax_amount=tax,
        total_amount=total,
        subtotal_base=subtotal_base,
        tax_base=tax_base,
        total_base=total_base,
        **actor_kwargs(actor),
    )
    for line in prepared:
        SalesOrderItem.objects.create(
            organization=organization,
            sales_order=order,
            sku=line["sku"],
            quantity=line["quantity"],
            unit_price=line["unit_price"],
        )
    if exceeds_credit:
        ApprovalRequest.objects.create(
            organization=organization,
            rule=rule,
            sales_order=order,
            requested_by=actor,
            requested_by_role=actor.role,
            reason=order.approval_reason,
        )
    else:
        reserve_sales_order_items(organization, actor, order)
    record_audit(organization, actor, "Sales order created", "SalesOrder", order.id, new_value={"number": order.number, "status": order.status, "total_base": str(total_base)})
    return order


@transaction.atomic
def approve_sales_order(organization, actor, order_id):
    assert_permission(actor, organization, Permission.APPROVE_TRANSACTIONS)
    order = SalesOrder.objects.select_for_update().select_related("customer").get(organization=organization, pk=order_id)
    if order.status != OrderStatus.PENDING_APPROVAL:
        raise ServiceError("Only an order pending credit approval can be approved.")
    reserve_sales_order_items(organization, actor, order)
    now = timezone.now()
    order.status = OrderStatus.ORDER_PLACED
    order.approval_status = ApprovalStatus.APPROVED
    order.approved_by = actor
    order.approved_by_role = actor.role
    order.approved_at = now
    order.save(update_fields=["status", "approval_status", "approved_by", "approved_by_role", "approved_at", "updated_at"])
    ApprovalRequest.objects.filter(organization=organization, sales_order=order, status=ApprovalReviewStatus.PENDING).update(
        status=ApprovalReviewStatus.APPROVED,
        reviewed_by=actor,
        reviewed_at=now,
    )
    record_audit(organization, actor, "Sales order approved", "SalesOrder", order.id, old_value={"status": "PENDING_APPROVAL"}, new_value={"status": order.status, "approved_by_role": actor.role})
    return order


@transaction.atomic
def update_sales_order_line_quantity(organization, actor, order_id, item_id, quantity):
    assert_permission(actor, organization, Permission.CREATE_ORDERS)
    quantity = whole_quantity(quantity)
    order = SalesOrder.objects.select_for_update().select_related("customer").get(organization=organization, pk=order_id)
    if order.status not in {OrderStatus.PENDING_APPROVAL, OrderStatus.ORDER_PLACED}:
        raise ServiceError("Only pending or unshipped orders can be edited.")
    item = SalesOrderItem.objects.select_for_update().get(organization=organization, pk=item_id, sales_order=order)
    old_quantity = item.quantity
    reservation = getattr(item, "reservation", None)
    if reservation and quantity < old_quantity:
        released = old_quantity - quantity
        reservation.quantity = quantity
        reservation.save(update_fields=["quantity", "updated_at"])
        StockBalance.objects.filter(organization=organization, sku_id=item.sku_id, warehouse_id=order.warehouse_id).update(reserved=F("reserved") - released)
    item.quantity = quantity
    item.save(update_fields=["quantity", "updated_at"])
    order.refresh_from_db(fields=["customer"])
    customer = order.customer
    items = list(order.items.all())
    lines = [{"quantity": line.quantity, "unit_price": line.unit_price} for line in items]
    subtotal, tax, total, subtotal_base, tax_base, total_base = _order_totals(customer, lines, order.exchange_rate)
    if customer.receivable_balance + total_base > customer.credit_limit:
        raise ServiceError("The updated order exceeds the customer's credit limit.")
    order.subtotal = subtotal
    order.tax_amount = tax
    order.total_amount = total
    order.subtotal_base = subtotal_base
    order.tax_base = tax_base
    order.total_base = total_base
    order.version += 1
    order.save(update_fields=["subtotal", "tax_amount", "total_amount", "subtotal_base", "tax_base", "total_base", "version", "updated_at"])
    if reservation and quantity > old_quantity:
        from inventory.services import increase_stock_reservation

        additional = quantity - old_quantity
        increase_stock_reservation(organization, actor, reservation_id=reservation.id, additional=additional)
    record_audit(organization, actor, "Sales order quantity updated", "SalesOrderItem", item.id, old_value={"quantity": str(old_quantity)}, new_value={"quantity": str(quantity), "total_base": str(total_base)})
    return item


@transaction.atomic
def move_order_to_pick_pack(organization, actor, order_id):
    assert_permission(actor, organization, Permission.FULFILL_ORDERS)
    order = SalesOrder.objects.select_for_update().get(organization=organization, pk=order_id)
    if order.status != OrderStatus.ORDER_PLACED:
        raise ServiceError("Only a placed order can move to pick and pack.")
    order.status = OrderStatus.PICK_PACK
    order.save(update_fields=["status", "updated_at"])
    record_audit(organization, actor, "Order moved to pick and pack", "SalesOrder", order.id, new_value={"status": order.status})
    return order


@transaction.atomic
def ship_order(organization, actor, order_id):
    assert_permission(actor, organization, Permission.FULFILL_ORDERS)
    order = SalesOrder.objects.select_for_update().select_related("customer").get(organization=organization, pk=order_id)
    if order.status not in {OrderStatus.ORDER_PLACED, OrderStatus.PICK_PACK}:
        raise ServiceError("Only a placed or picked order can be shipped.")
    if hasattr(order, "invoice"):
        raise ServiceError("This order already has an invoice.")
    items = list(order.items.select_related("sku", "reservation").order_by("sku_id"))
    if any(item.shipped_quantity > 0 for item in items):
        raise ServiceError("Partial shipment is not supported by this workflow.")
    timestamp = timezone.now()
    for item in items:
        if item.reservation_id:
            consume_order_reservation(organization, item.reservation_id, timestamp)
    consumption = consume_fifo_layers(organization, {(item.sku_id, order.warehouse_id): item.quantity for item in items})
    total_cogs = sum_money(consumption.total_cost for consumption in consumption.values())
    for item in items:
        item.shipped_quantity = item.quantity
        item.cogs_base = consumption[(item.sku_id, order.warehouse_id)].total_cost
        item.save(update_fields=["shipped_quantity", "cogs_base", "updated_at"])
    cogs_journal = post_journal(
        organization,
        actor,
        JournalSourceType.SALES_ORDER,
        order.id,
        order.number,
        f"/app/orders?order={order.id}",
        f"FIFO COGS for shipment {order.number}",
        [LedgerLine("501000", "FIFO Cost of Goods Sold", debit=total_cogs), LedgerLine("103000", "Inventory Asset relieved", credit=total_cogs)],
        timestamp=timestamp,
    )
    customer = order.customer
    invoice = Invoice.objects.create(
        organization=organization,
        number=next_document_number(organization, DocumentKind.INVOICE),
        sales_order=order,
        order_number=order.number,
        customer=customer,
        status=InvoiceStatus.ISSUED,
        currency=order.currency,
        exchange_rate=order.exchange_rate,
        issued_at=timestamp,
        due_at=timestamp + timedelta(days=customer.payment_terms_days),
        subtotal=order.subtotal,
        tax_amount=order.tax_amount,
        total_amount=order.total_amount,
        subtotal_base=order.subtotal_base,
        tax_base=order.tax_base,
        total_base=order.total_base,
        cogs_base=total_cogs,
        **_address(customer),
    )
    InvoiceLine.objects.bulk_create([
        InvoiceLine(
            organization=organization,
            invoice=invoice,
            sku=item.sku,
            description=item.sku.name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_price=money(item.quantity * item.unit_price),
            position=index,
        )
        for index, item in enumerate(items, start=1)
    ])
    revenue_journal = post_journal(
        organization,
        actor,
        JournalSourceType.INVOICE,
        invoice.id,
        invoice.number,
        f"/app/orders?invoice={invoice.id}",
        f"Revenue recognition for {invoice.number}",
        [
            LedgerLine("102000", "Accounts Receivable", debit=order.total_base),
            LedgerLine("401000", "Product Sales Revenue", credit=order.subtotal_base),
            LedgerLine("203000", "Sales Tax Payable", credit=order.tax_base),
        ],
        timestamp=timestamp,
    )
    invoice.journal_entries.set([cogs_journal, revenue_journal])
    Customer.objects.filter(pk=customer.pk).update(receivable_balance=F("receivable_balance") + order.total_base)
    order.status = OrderStatus.INVOICED
    order.shipped_at = timestamp
    order.save(update_fields=["status", "shipped_at", "updated_at"])
    record_activity(organization, ActivityType.SALES, "Order shipped and invoiced", f"{order.number} generated {invoice.number} with {total_cogs} of FIFO COGS.", invoice.number, f"/app/orders?invoice={invoice.id}", [cogs_journal, revenue_journal])
    record_audit(organization, actor, "Order shipped", "SalesOrder", order.id, new_value={"invoice": invoice.number, "cogs": str(total_cogs), "revenue_journal": revenue_journal.number})
    return ShipOrderResult(invoice, cogs_journal, revenue_journal, total_cogs)


def _payment_account(payment_method):
    mapping = {
        PaymentMethod.CASH: "101000",
        PaymentMethod.BANK: "101100",
        PaymentMethod.CHEQUE: "101100",
        PaymentMethod.MOBILE_BANKING: "101200",
    }
    if payment_method not in mapping:
        raise ServiceError("Unsupported payment method.")
    return mapping[payment_method]


def _invoices_with_outstanding(organization, customer_id, invoice_id=None, include_paid=False):
    paid = PaymentAllocation.objects.filter(invoice=OuterRef("pk"), payment__status=PaymentStatus.POSTED).values("invoice").annotate(total=models.Sum("amount_base")).values("total")
    credits = CreditNote.objects.filter(invoice=OuterRef("pk"), status="ISSUED").values("invoice").annotate(total=models.Sum("amount_base")).values("total")
    statuses = [InvoiceStatus.ISSUED, InvoiceStatus.PAID] if include_paid else [InvoiceStatus.ISSUED]
    queryset = Invoice.objects.filter(organization=organization, status__in=statuses)
    if customer_id is not None:
        queryset = queryset.filter(customer_id=customer_id)
    queryset = queryset.annotate(
        paid_base=Coalesce(Subquery(paid), Value(Decimal("0.0000"))),
        credited_base=Coalesce(Subquery(credits), Value(Decimal("0.0000"))),
    ).order_by("issued_at", "id")
    if invoice_id:
        queryset = queryset.filter(pk=invoice_id)
    return queryset


def invoice_outstanding(invoice):
    return max(Decimal("0.00"), money(invoice.total_base - invoice.paid_base - invoice.credited_base))


def _collection_permission(user, organization):
    if not user.is_active or user.organization_id != organization.id:
        raise PermissionDenied("The actor does not belong to this organization.")
    if not (ROLE_PERMISSIONS[user.role][Permission.POST_EXPENSES] or ROLE_PERMISSIONS[user.role][Permission.FULFILL_ORDERS]):
        raise PermissionDenied("This role cannot record customer collections.")
    if organization.is_sandbox and organization.expires_at and organization.expires_at <= timezone.now():
        raise PermissionDenied("This sandbox has expired.")


@transaction.atomic
def record_customer_payment(organization, actor, *, customer_id, payment_method, amount, currency, exchange_rate, received_at=None, reference, notes="", invoice_id=None, reversal_of_payment=None):
    _collection_permission(actor, organization)
    customer = Customer.objects.get(organization=organization, pk=customer_id)
    if currency not in Currency.values:
        raise ServiceError("Unsupported payment currency.")
    amount = positive(amount)
    if not reference.strip():
        raise ServiceError("Payment reference is required.")
    amount_base = base_value(amount, exchange_rate)
    timestamp = datetime_value(received_at)
    account_code = _payment_account(payment_method)
    remaining = amount_base
    allocations = []
    invoice_filter = Invoice.objects.filter(organization=organization, customer_id=customer_id, status=InvoiceStatus.ISSUED)
    if invoice_id:
        invoice_filter = invoice_filter.filter(pk=invoice_id)
    locked_invoice_ids = list(invoice_filter.order_by("issued_at", "id").select_for_update().values_list("id", flat=True))
    invoices = list(_invoices_with_outstanding(organization, customer_id, invoice_id).filter(pk__in=locked_invoice_ids))
    if invoice_id and not invoices:
        raise ServiceError("The selected invoice is not open for this customer.")
    for invoice in invoices:
        if remaining == 0:
            break
        outstanding = invoice_outstanding(invoice)
        allocated = min(remaining, outstanding)
        if allocated > 0:
            allocations.append((invoice, allocated))
            remaining -= allocated
    if remaining > 0:
        raise ServiceError(f"Payment exceeds open customer debt by {remaining} {organization.base_currency}.")
    payment_id = uuid.uuid4()
    number = next_document_number(organization, DocumentKind.CUSTOMER_PAYMENT)
    journal = post_journal(
        organization,
        actor,
        JournalSourceType.CUSTOMER_PAYMENT,
        payment_id,
        number,
        f"/app/customers/{customer_id}?receipt={payment_id}",
        f"{number} · Customer collection via {payment_method}",
        [
            LedgerLine(account_code, f"Customer collection · {reference}", debit=amount_base),
            LedgerLine("102000", "Accounts Receivable reduced", credit=amount_base),
        ],
        timestamp=timestamp,
    )
    payment = CustomerPayment.objects.create(
        id=payment_id,
        organization=organization,
        number=number,
        customer=customer,
        payment_method=payment_method,
        payment_account_id=journal.lines.get(account__code=account_code).account_id,
        amount=amount,
        currency=currency,
        exchange_rate=exchange_rate,
        amount_base=amount_base,
        received_at=timestamp,
        reference=reference.strip(),
        notes=notes.strip(),
        status=PaymentStatus.POSTED,
        journal_entry=journal,
        reversal_of_payment=reversal_of_payment,
        **actor_kwargs(actor),
    )
    for invoice, allocated in allocations:
        PaymentAllocation.objects.create(organization=organization, payment=payment, invoice=invoice, amount_base=allocated)
        invoice.paid_base += allocated
        invoice.status = InvoiceStatus.PAID if invoice_outstanding(invoice) == 0 else InvoiceStatus.ISSUED
        invoice.save(update_fields=["status", "updated_at"])
    Customer.objects.filter(pk=customer.pk).update(receivable_balance=F("receivable_balance") - amount_base)
    record_activity(organization, ActivityType.FINANCE, "Customer collection posted", f"{number} reduced Accounts Receivable by {amount_base} {organization.base_currency}.", number, f"/app/customers/{customer_id}?receipt={payment_id}", [journal])
    record_audit(organization, actor, "Customer payment received", "CustomerPayment", payment.id, new_value={"number": number, "amount_base": str(amount_base), "journal": journal.number})
    return payment


@transaction.atomic
def replace_customer_payment(organization, actor, payment_id, *, payment_method, amount, currency, exchange_rate, received_at, reference, notes=""):
    assert_permission(actor, organization, Permission.POST_EXPENSES)
    original = CustomerPayment.objects.select_for_update().select_related("payment_account").get(organization=organization, pk=payment_id, status=PaymentStatus.POSTED)
    reversal = post_journal(
        organization,
        actor,
        JournalSourceType.CUSTOMER_PAYMENT,
        original.id,
        original.number,
        f"/app/customers/{original.customer_id}?receipt={original.id}",
        f"{original.number} · Payment reversal for replacement",
        [
            LedgerLine("102000", "Restore original receivable", debit=original.amount_base),
            LedgerLine(original.payment_account.code, "Reverse original collection account", credit=original.amount_base),
        ],
    )
    Customer.objects.filter(pk=original.customer_id).update(receivable_balance=F("receivable_balance") + original.amount_base)
    original.status = PaymentStatus.REPLACED
    original.reversal_journal_entry = reversal
    original.save(update_fields=["status", "reversal_journal_entry", "updated_at"])
    for allocation in original.allocations.select_related("invoice").all():
        invoice = _invoices_with_outstanding(organization, original.customer_id, allocation.invoice_id, include_paid=True).get()
        invoice.status = InvoiceStatus.PAID if invoice_outstanding(invoice) == 0 else InvoiceStatus.ISSUED
        invoice.save(update_fields=["status", "updated_at"])
    replacement = record_customer_payment(
        organization,
        actor,
        customer_id=original.customer_id,
        payment_method=payment_method,
        amount=amount,
        currency=currency,
        exchange_rate=exchange_rate,
        received_at=received_at,
        reference=reference,
        notes=notes,
        reversal_of_payment=original,
    )
    original.replaced_by_payment = replacement
    original.save(update_fields=["replaced_by_payment", "updated_at"])
    record_audit(organization, actor, "Customer payment replaced", "CustomerPayment", original.id, old_value={"number": original.number, "amount_base": str(original.amount_base)}, new_value={"number": replacement.number, "amount_base": str(replacement.amount_base)})
    return replacement


def collection_summary(organization, start_date=None, end_date=None):
    today_start, today_end = today_bounds(organization)
    month_start, month_end = month_to_date_bounds(organization)
    range_start, range_end = local_date_range(organization, start_date, end_date) if start_date and end_date else (today_start, today_end)
    posted = CustomerPayment.objects.filter(organization=organization, status=PaymentStatus.POSTED)
    total = lambda start, end: posted.filter(received_at__gte=start, received_at__lte=end).aggregate(value=Coalesce(models.Sum("amount_base"), Value(Decimal("0.0000"))))["value"]
    debt = Customer.objects.filter(organization=organization).aggregate(value=Coalesce(models.Sum("receivable_balance"), Value(Decimal("0.0000"))))["value"]
    aging = {"0-30": Decimal("0.00"), "31-60": Decimal("0.00"), "61+": Decimal("0.00")}
    for invoice in _invoices_with_outstanding(organization, None):
        outstanding = invoice_outstanding(invoice)
        if outstanding == 0:
            continue
        days = (range_end - invoice.issued_at).days
        if days <= 30:
            aging["0-30"] += outstanding
        elif days <= 60:
            aging["31-60"] += outstanding
        else:
            aging["61+"] += outstanding
    sales = SalesOrder.objects.filter(organization=organization, created_at__gte=range_start, created_at__lte=range_end).aggregate(value=Coalesce(models.Sum("total_base"), Value(Decimal("0.0000"))))["value"]
    return {
        "collected_today": total(today_start, today_end),
        "collected_this_month": total(month_start, month_end),
        "collected_range": total(range_start, range_end),
        "sales_range": sales,
        "total_market_debt": debt,
        "aging": aging,
        "range_start": range_start,
        "range_end": range_end,
    }


def customer_directory(organization):
    purchases = SalesOrder.objects.filter(customer=OuterRef("pk")).values("customer").annotate(total=models.Sum("total_base")).values("total")
    payments = CustomerPayment.objects.filter(customer=OuterRef("pk"), status=PaymentStatus.POSTED).values("customer").annotate(total=models.Sum("amount_base")).values("total")
    last_payment = CustomerPayment.objects.filter(customer=OuterRef("pk"), status=PaymentStatus.POSTED).values("customer").annotate(value=models.Max("received_at")).values("value")
    return Customer.objects.filter(organization=organization).annotate(
        total_purchased=Coalesce(Subquery(purchases), Value(Decimal("0.0000"))),
        total_paid=Coalesce(Subquery(payments), Value(Decimal("0.0000"))),
        last_payment_date=Subquery(last_payment),
    ).order_by("name")


def customer_purchase_history(organization, customer_id):
    return SalesOrderItem.objects.filter(organization=organization, sales_order__customer_id=customer_id).select_related("sales_order", "sku", "sales_order__warehouse").order_by("-created_at", "sales_order__number")


@transaction.atomic
def checkout_pos(organization, actor, *, customer_id, warehouse_id, lines, payments, exchange_rate=Decimal("1.0000"), reference=""):
    customer = Customer.objects.get(organization=organization, pk=customer_id)
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer_id,
        warehouse_id=warehouse_id,
        channel=OrderChannel.POS,
        currency=customer.currency,
        exchange_rate=exchange_rate,
        reference=reference,
        lines=lines,
    )
    if order.status == OrderStatus.PENDING_APPROVAL:
        return PosCheckoutResult(order, None, [], customer.receivable_balance)
    payment_total = sum_money(base_value(amount, exchange_rate) for _, amount in payments if amount > 0)
    if payment_total > order.total_base:
        raise ServiceError("Split payments exceed the invoice total.")
    shipment = ship_order(organization, actor, order.id)
    records = []
    for method, amount in payments:
        if amount <= 0:
            continue
        records.append(record_customer_payment(
            organization,
            actor,
            customer_id=customer_id,
            payment_method=method,
            amount=amount,
            currency=order.currency,
            exchange_rate=exchange_rate,
            reference=f"{order.number}-{method}",
            notes="POS collection",
            invoice_id=shipment.invoice.id,
        ))
    customer.refresh_from_db(fields=["receivable_balance"])
    return PosCheckoutResult(order, shipment.invoice, records, customer.receivable_balance)


@transaction.atomic
def create_sales_return(organization, actor, *, order_id, reason, lines):
    assert_permission(actor, organization, Permission.FULFILL_ORDERS)
    order = SalesOrder.objects.select_for_update().select_related("customer").get(organization=organization, pk=order_id)
    if order.status not in {OrderStatus.SHIPPED, OrderStatus.INVOICED}:
        raise ServiceError("Only a shipped or invoiced order can be returned.")
    if not reason.strip() or not lines:
        raise ServiceError("A return reason and at least one returned unit are required.")
    if len({(line["order_item_id"], line["condition"]) for line in lines}) != len(lines):
        raise ServiceError("Each order line and return condition can appear only once in a return.")
    timestamp = timezone.now()
    return_id = uuid.uuid4()
    return_number = next_document_number(organization, DocumentKind.SALES_RETURN)
    sales_return = SalesReturn.objects.create(
        id=return_id,
        organization=organization,
        number=return_number,
        sales_order=order,
        order_number=order.number,
        customer=order.customer,
        warehouse=order.warehouse,
        reason=reason.strip(),
        status=SalesReturnStatus.COMPLETED,
        restored_value_base=Decimal("0.00"),
        shrinkage_base=Decimal("0.00"),
        **actor_kwargs(actor),
    )
    restored_total = Decimal("0.00")
    shrinkage_total = Decimal("0.00")
    selling_total = Decimal("0.00")
    for line in sorted(lines, key=lambda item: str(item["order_item_id"])):
        item = SalesOrderItem.objects.select_for_update().select_related("sku").get(organization=organization, pk=line["order_item_id"], sales_order=order)
        quantity = whole_quantity(line["quantity"])
        if quantity > item.shipped_quantity - item.returned_quantity:
            raise ServiceError("Return quantity exceeds unreturned shipped units.")
        condition = line["condition"]
        if condition not in {"RESTOCKABLE", "DAMAGED_EXPIRED"}:
            raise ServiceError("Unsupported return condition.")
        unit_cost = money(item.cogs_base / item.shipped_quantity)
        value = money(unit_cost * quantity)
        restored_layer = None
        if condition == "RESTOCKABLE":
            restored_layer = InventoryLayer.objects.create(
                organization=organization,
                sku_id=item.sku_id,
                warehouse_id=order.warehouse_id,
                batch_code=f"{return_number}-{item.sku.sku}-{item.id.hex[:8]}",
                received_at=timestamp,
                initial_quantity=quantity,
                remaining_quantity=quantity,
                source_unit_cost=unit_cost,
                source_currency=organization.base_currency,
                unit_cost=unit_cost,
                allocated_landed_unit_cost=Decimal("0.00"),
                remaining_value=value,
            )
            StockBalance.objects.filter(organization=organization, sku_id=item.sku_id, warehouse_id=order.warehouse_id).update(on_hand=F("on_hand") + quantity, updated_at=timestamp)
            restored_total += value
        else:
            shrinkage_total += value
        updated = SalesOrderItem.objects.filter(pk=item.pk, shipped_quantity__gte=F("returned_quantity") + quantity).update(returned_quantity=F("returned_quantity") + quantity, updated_at=timestamp)
        if updated != 1:
            raise ServiceError("Another return changed the available return quantity.")
        SalesReturnItem.objects.create(
            organization=organization,
            sales_return=sales_return,
            order_item=item,
            sku=item.sku,
            quantity=quantity,
            condition=condition,
            unit_price=item.unit_price,
            unit_cost_base=unit_cost,
            restored_layer=restored_layer,
        )
        selling_total = money(selling_total + item.unit_price * quantity)
    customer = order.customer
    sales_return.restored_value_base = restored_total
    sales_return.shrinkage_base = shrinkage_total
    sales_return.save(update_fields=["restored_value_base", "shrinkage_base", "updated_at"])
    journals = []
    if restored_total > 0:
        journals.append(post_journal(organization, actor, JournalSourceType.SALES_RETURN, return_id, return_number, f"/app/inventory/returns?return={return_id}", f"Restock return {return_number}", [LedgerLine("103000", "Restocked inventory", debit=restored_total), LedgerLine("501000", "Reverse FIFO COGS", credit=restored_total)], timestamp=timestamp))
    if shrinkage_total > 0:
        journals.append(post_journal(organization, actor, JournalSourceType.SALES_RETURN, return_id, return_number, f"/app/inventory/returns?return={return_id}", f"Damaged return {return_number}", [LedgerLine("607000", "Damaged or expired inventory", debit=shrinkage_total), LedgerLine("501000", "Reverse FIFO COGS", credit=shrinkage_total)], timestamp=timestamp))
    tax = money(selling_total * customer.tax_rate / 100)
    credit_base = base_value(selling_total, order.exchange_rate)
    tax_base = base_value(tax, order.exchange_rate)
    credit_total = money(credit_base + tax_base)
    credit_note_id = uuid.uuid4()
    credit_number = next_document_number(organization, DocumentKind.CREDIT_NOTE)
    credit_journal = post_journal(
        organization,
        actor,
        JournalSourceType.CREDIT_NOTE,
        credit_note_id,
        credit_number,
        f"/app/inventory/returns?return={return_id}",
        f"Credit note {credit_number} for {order.number}",
        [
            LedgerLine("401000", "Revenue reversed for returned goods", debit=credit_base),
            LedgerLine("203000", "Sales Tax Payable reversed", debit=tax_base),
            LedgerLine("102000", "Accounts Receivable reduced", credit=credit_total),
        ],
        timestamp=timestamp,
    )
    credit_note = CreditNote.objects.create(
        id=credit_note_id,
        organization=organization,
        number=credit_number,
        customer=customer,
        invoice=getattr(order, "invoice", None),
        sales_return=sales_return,
        amount_base=credit_total,
        currency=order.currency,
        issued_at=timestamp,
        journal_entry=credit_journal,
    )
    sales_return.journal_entries.set([*journals, credit_journal])
    Customer.objects.filter(pk=customer.pk).update(receivable_balance=F("receivable_balance") - credit_total)
    if hasattr(order, "invoice"):
        invoice = _invoices_with_outstanding(organization, customer.pk, order.invoice.pk).get()
        invoice.status = InvoiceStatus.PAID if invoice_outstanding(invoice) == 0 else InvoiceStatus.ISSUED
        invoice.save(update_fields=["status", "updated_at"])
    record_activity(organization, ActivityType.SALES, "Sales return completed", f"{return_number} restored {restored_total} and recorded {shrinkage_total} of shrinkage.", return_number, f"/app/inventory/returns?return={return_id}", [*journals, credit_journal])
    record_audit(organization, actor, "Sales return posted", "SalesReturn", sales_return.id, new_value={"credit_note": credit_note.number, "restored": str(restored_total), "shrinkage": str(shrinkage_total)})
    return sales_return


@transaction.atomic
def reject_sales_order(organization, actor, order_id, reason):
    assert_permission(actor, organization, Permission.APPROVE_TRANSACTIONS)
    if not reason.strip():
        raise ServiceError("An approval rejection reason is required.")
    order = SalesOrder.objects.select_for_update().get(organization=organization, pk=order_id)
    if order.status != OrderStatus.PENDING_APPROVAL:
        raise ServiceError("Only an order pending credit approval can be rejected.")
    order.status = OrderStatus.CANCELLED
    order.approval_status = ApprovalStatus.REJECTED
    order.approval_reason = reason.strip()
    order.approved_by = actor
    order.approved_by_role = actor.role
    order.approved_at = timezone.now()
    order.save(update_fields=["status", "approval_status", "approval_reason", "approved_by", "approved_by_role", "approved_at", "updated_at"])
    ApprovalRequest.objects.filter(organization=organization, sales_order=order, status=ApprovalReviewStatus.PENDING).update(
        status=ApprovalReviewStatus.REJECTED, reviewed_by=actor, reviewed_at=order.approved_at,
    )
    record_audit(organization, actor, "Sales order rejected", "SalesOrder", order.id, old_value={"status": "PENDING_APPROVAL"}, new_value={"status": order.status, "reason": order.approval_reason})
    return order
