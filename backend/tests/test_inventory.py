from decimal import Decimal

import pytest

from core.services.money import InsufficientStockError, ServiceError
from inventory.models import InventoryLayer, StockBalance, StockReservation
from inventory.services import create_stock_adjustment, create_warehouse, release_stock_reservation, reserve_stock_atomic, transfer_stock_atomic, update_sku, update_warehouse
from orders.services import create_sales_order, ship_order, update_sales_order_line_quantity


def test_fifo_sale_consumes_oldest_layers(actor, organization, customer, sku, warehouse, opening_layer, opening_layer_two):
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="FIFO-150",
        lines=[{"sku_id": sku.id, "quantity": 150, "unit_price": Decimal("25.00")}],
    )
    shipment = ship_order(organization, actor, order.id)
    position = StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse)
    second = InventoryLayer.objects.get(pk=opening_layer_two.id)
    assert shipment.cogs_base == Decimal("1625.00")
    assert position.on_hand == 50
    assert position.reserved == 0
    assert second.remaining_quantity == 50
    assert second.remaining_value == Decimal("625.00")


def test_reservation_cannot_oversell(actor, organization, sku, warehouse, opening_layer):
    reserve_stock_atomic(organization, actor, sku_id=sku.id, warehouse_id=warehouse.id, channel="B2B", reference="LOCK-ALL", quantity=100)
    with pytest.raises(InsufficientStockError):
        reserve_stock_atomic(organization, actor, sku_id=sku.id, warehouse_id=warehouse.id, channel="SHOPIFY", reference="OVERSELL", quantity=1)


def test_release_reservation_restores_atp(actor, organization, sku, warehouse, opening_layer):
    reservation = reserve_stock_atomic(organization, actor, sku_id=sku.id, warehouse_id=warehouse.id, channel="B2B", reference="RELEASE", quantity=60)
    release_stock_reservation(organization, actor, reservation.id)
    position = StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse)
    assert position.reserved == 0
    reservation.refresh_from_db()
    assert reservation.status == "RELEASED"


def test_transfer_preserves_fifo_age_and_cost(actor, organization, sku, warehouse, warehouse_two, opening_layer, opening_layer_two):
    transfer = transfer_stock_atomic(
        organization,
        actor,
        source_warehouse_id=warehouse.id,
        destination_warehouse_id=warehouse_two.id,
        lines=[{"sku_id": sku.id, "quantity": 50}],
    )
    destination = InventoryLayer.objects.get(organization=organization, warehouse=warehouse_two, sku=sku, batch_code=opening_layer.batch_code)
    assert destination.received_at == opening_layer.received_at
    assert destination.unit_cost == Decimal("10.00")
    assert destination.remaining_value == Decimal("500.00")
    assert transfer.items.get().value == Decimal("500.00")
    assert InventoryLayer.objects.get(pk=opening_layer.id).remaining_quantity == 50


def test_stock_shortage_posts_shrinkage(actor, organization, sku, warehouse, opening_layer, opening_layer_two):
    adjustment = create_stock_adjustment(organization, actor, warehouse_id=warehouse.id, sku_id=sku.id, counted_quantity=100, reason="Cycle count shortage")
    assert adjustment.delta_quantity == -100
    assert adjustment.value_delta == Decimal("-1000.00")
    assert adjustment.journal_entry.total_debit == Decimal("1000.00")
    assert StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse).on_hand == 100


def test_zero_count_is_supported(actor, organization, sku, warehouse, opening_layer):
    adjustment = create_stock_adjustment(organization, actor, warehouse_id=warehouse.id, sku_id=sku.id, counted_quantity=0, reason="Total stock write-off")
    assert adjustment.counted_quantity == 0
    assert StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse).on_hand == 0


def test_count_below_reserved_stock_is_rejected(actor, organization, sku, warehouse, opening_layer):
    reserve_stock_atomic(organization, actor, sku_id=sku.id, warehouse_id=warehouse.id, channel="B2B", reference="RESERVED", quantity=20)
    with pytest.raises(ServiceError):
        create_stock_adjustment(organization, actor, warehouse_id=warehouse.id, sku_id=sku.id, counted_quantity=10, reason="Invalid count")


def test_order_quantity_increase_uses_one_reservation(actor, organization, customer, sku, warehouse, opening_layer, opening_layer_two):
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="QUANTITY-EDIT",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_price": Decimal("20.00")}],
    )
    item = order.items.get()
    update_sales_order_line_quantity(organization, actor, order.id, item.id, 15)
    reservation = StockReservation.objects.get(organization=organization, sales_order_item=item)
    assert reservation.quantity == 15
    assert StockReservation.objects.filter(organization=organization).count() == 1
    ship_order(organization, actor, order.id)
    position = StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse)
    assert position.reserved == 0
    assert position.on_hand == 185


def test_master_data_changes_are_audited(actor, organization, warehouse, sku):
    update_warehouse(organization, actor, warehouse.id, name="Renamed Warehouse")
    update_sku(organization, actor, sku.id, selling_price=Decimal("30.00"))
    warehouse.refresh_from_db()
    sku.refresh_from_db()
    assert warehouse.name == "Renamed Warehouse"
    assert sku.selling_price == Decimal("30.00")
    assert organization.core_auditevent_records.filter(action__in=["Warehouse updated", "SKU updated"]).count() == 2
