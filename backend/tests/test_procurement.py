from decimal import Decimal

import pytest

from core.services.money import ServiceError
from finance.models import Account
from inventory.models import StockBalance
from procurement.models import PurchaseOrderStatus
from procurement.services import create_purchase_order, post_goods_receipt, preview_landed_costs, record_vendor_payment


def test_landed_cost_weight_allocation_is_exact(actor, organization, grn_order, landed_costs):
    preview = preview_landed_costs(
        organization,
        purchase_order_id=grn_order["order"].id,
        warehouse_id=grn_order["order"].destination_warehouse_id,
        allocation_method="weight",
        costs=landed_costs,
        lines=grn_order["lines"],
    )
    assert preview.total_goods_base == Decimal("24430.00")
    assert preview.total_allocated_cost == Decimal("1850.24")
    assert preview.total_inventory_base == Decimal("26280.24")
    assert preview.lines[0].allocated_landed_cost == Decimal("948.85")
    assert preview.lines[1].allocated_landed_cost == Decimal("901.39")
    assert preview.lines[0].true_unit_cost == Decimal("29.3377")
    assert preview.lines[1].true_unit_cost == Decimal("64.5077")
    for fee, total in preview.costs["base"].items():
        assert sum((line.allocations[fee] for line in preview.lines), Decimal("0.00")) == total


def test_volume_and_value_allocation_preserve_fee_totals(actor, organization, grn_order, landed_costs):
    previews = []
    for method in ("volume", "value"):
        preview = preview_landed_costs(
            organization,
            purchase_order_id=grn_order["order"].id,
            warehouse_id=grn_order["order"].destination_warehouse_id,
            allocation_method=method,
            costs=landed_costs,
            lines=grn_order["lines"],
        )
        assert preview.total_allocated_cost == Decimal("1850.24")
        assert preview.total_inventory_base == Decimal("26280.24")
        for fee, total in preview.costs["base"].items():
            assert sum((line.allocations[fee] for line in preview.lines), Decimal("0.00")) == total
        previews.append(preview)
    assert previews[0].lines[0].basis_quantity == Decimal("1.2000")
    assert previews[0].lines[0].allocated_landed_cost != previews[1].lines[0].allocated_landed_cost


def test_grn_posts_inventory_layers_stock_and_balanced_accounting(actor, organization, grn_order, landed_costs):
    receipt = post_goods_receipt(
        organization,
        actor,
        purchase_order_id=grn_order["order"].id,
        warehouse_id=grn_order["order"].destination_warehouse_id,
        allocation_method="weight",
        costs=landed_costs,
        lines=grn_order["lines"],
    )
    assert receipt.total_inventory_base == Decimal("26280.24")
    assert receipt.journal_entry.total_debit == receipt.journal_entry.total_credit
    assert receipt.items.count() == 2
    assert StockBalance.objects.get(organization=organization, sku=grn_order["scanner"], warehouse=grn_order["order"].destination_warehouse).on_hand == 500
    assert StockBalance.objects.get(organization=organization, sku=grn_order["switch"], warehouse=grn_order["order"].destination_warehouse).on_hand == 180
    assert StockBalance.objects.get(organization=organization, sku=grn_order["scanner"], warehouse=grn_order["order"].destination_warehouse).in_transit == 0
    assert Account.objects.get(organization=organization, code="103000").balance == Decimal("26280.24")
    assert Account.objects.get(organization=organization, code="202000").balance == Decimal("1850.24")
    assert receipt.purchase_order.vendor.payable_balance == Decimal("24430.00")
    first_layer = receipt.items.get(purchase_order_item__sku=grn_order["scanner"]).cost_layer
    assert first_layer.unit_cost == Decimal("29.34")
    assert first_layer.remaining_value == Decimal("14668.85")


def test_receipt_cannot_receive_above_ordered_quantity(actor, organization, grn_order, landed_costs):
    post_goods_receipt(
        organization,
        actor,
        purchase_order_id=grn_order["order"].id,
        warehouse_id=grn_order["order"].destination_warehouse_id,
        allocation_method="weight",
        costs=landed_costs,
        lines=grn_order["lines"],
    )
    with pytest.raises(ServiceError):
        post_goods_receipt(
            organization,
            actor,
            purchase_order_id=grn_order["order"].id,
            warehouse_id=grn_order["order"].destination_warehouse_id,
            allocation_method="weight",
            costs=landed_costs,
            lines=[grn_order["lines"][0]],
        )


def test_purchase_approval_threshold(actor, organization, vendor, sku, warehouse):
    large = create_purchase_order(
        organization,
        actor,
        vendor_id=vendor.id,
        destination_warehouse_id=warehouse.id,
        currency="USD",
        exchange_rate=Decimal("1"),
        expected_at="2026-12-01T00:00:00Z",
        reference="LARGE-PO",
        lines=[{"sku_id": sku.id, "quantity": 600, "unit_cost": Decimal("10.00")}],
    )
    small = create_purchase_order(
        organization,
        actor,
        vendor_id=vendor.id,
        destination_warehouse_id=warehouse.id,
        currency="USD",
        exchange_rate=Decimal("1"),
        expected_at="2026-12-01T00:00:00Z",
        reference="SMALL-PO",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_cost": Decimal("10.00")}],
    )
    assert large.status == PurchaseOrderStatus.PENDING_APPROVAL
    assert large.approval_requests.count() == 1
    assert small.status == PurchaseOrderStatus.DRAFT
    assert small.approval_status == "NOT_REQUIRED"


def test_vendor_payment_reduces_payable_and_bank_balance(actor, organization, grn_order, landed_costs, opening_cash):
    post_goods_receipt(
        organization,
        actor,
        purchase_order_id=grn_order["order"].id,
        warehouse_id=grn_order["order"].destination_warehouse_id,
        allocation_method="weight",
        costs=landed_costs,
        lines=grn_order["lines"],
    )
    payment = record_vendor_payment(
        organization,
        actor,
        vendor_id=grn_order["order"].vendor_id,
        payment_method="BANK",
        amount=Decimal("1000.00"),
        currency="EUR",
        exchange_rate=Decimal("1.08"),
        reference="SUPPLIER-PAYMENT",
    )
    assert payment.amount_base == Decimal("1080.00")
    payment.vendor.refresh_from_db()
    assert payment.vendor.payable_balance == Decimal("23350.00")
    assert Account.objects.get(organization=organization, code="101100").balance == Decimal("8920.00")
    assert payment.journal_entry.total_debit == payment.journal_entry.total_credit


def test_payment_liquidity_is_enforced_atomically(actor, organization, grn_order, landed_costs, opening_cash):
    post_goods_receipt(
        organization,
        actor,
        purchase_order_id=grn_order["order"].id,
        warehouse_id=grn_order["order"].destination_warehouse_id,
        allocation_method="weight",
        costs=landed_costs,
        lines=grn_order["lines"],
    )
    with pytest.raises(ServiceError):
        record_vendor_payment(
            organization,
            actor,
            vendor_id=grn_order["order"].vendor_id,
            payment_method="BANK",
            amount=Decimal("100000.00"),
            currency="USD",
            exchange_rate=Decimal("1.00"),
            reference="INSUFFICIENT-LIQUIDITY",
        )
    assert Account.objects.get(organization=organization, code="101100").balance == Decimal("10000.00")
