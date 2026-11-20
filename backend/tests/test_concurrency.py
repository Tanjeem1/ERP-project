import threading
from decimal import Decimal

import pytest
from django.db import connections
from django.db.models import Sum

from core.services.money import InsufficientStockError, ServiceError
from finance.models import Account
from finance.services import record_expense
from inventory.models import InventoryLayer, StockBalance, StockReservation
from inventory.services import post_opening_stock, reserve_stock_atomic, transfer_stock_atomic
from orders.models import InvoiceStatus, PaymentAllocation
from orders.services import record_customer_payment
from procurement.models import PurchaseOrderItem
from procurement.services import approve_purchase_order, create_purchase_order, post_goods_receipt

pytestmark = [pytest.mark.concurrency, pytest.mark.django_db(transaction=True)]


def run_concurrent(target, count):
    barrier = threading.Barrier(count)
    outcomes = []
    outcome_lock = threading.Lock()

    def worker(index):
        try:
            barrier.wait(timeout=10)
            target(index)
        except Exception as error:
            with outcome_lock:
                outcomes.append(error)
        else:
            with outcome_lock:
                outcomes.append(None)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=worker, args=(index,), daemon=True) for index in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=35)
    assert all(not thread.is_alive() for thread in threads), "A database operation deadlocked or exceeded its timeout."
    return outcomes


def test_reservations_never_oversell_last_units(actor, organization, sku, warehouse):
    post_opening_stock(organization, actor, sku_id=sku.id, warehouse_id=warehouse.id, quantity=100, unit_cost=Decimal("10.00"), batch_code="CONCURRENT-STOCK")
    outcomes = run_concurrent(lambda _: reserve_stock_atomic(organization, actor, sku_id=sku.id, warehouse_id=warehouse.id, channel="B2B", reference="RACE", quantity=10), 12)
    successes = [result for result in outcomes if result is None]
    failures = [result for result in outcomes if result is not None]
    assert len(successes) == 10
    assert len(failures) == 2
    assert all(isinstance(error, InsufficientStockError) for error in failures)
    position = StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse)
    assert position.on_hand == 100
    assert position.reserved == 100
    assert StockReservation.objects.filter(organization=organization, status="ACTIVE").count() == 10


def test_opposite_transfers_do_not_deadlock_or_change_valuation(actor, organization, sku, warehouse, warehouse_two):
    post_opening_stock(organization, actor, sku_id=sku.id, warehouse_id=warehouse.id, quantity=100, unit_cost=Decimal("10.00"), batch_code="SHARED-BATCH")
    post_opening_stock(organization, actor, sku_id=sku.id, warehouse_id=warehouse_two.id, quantity=100, unit_cost=Decimal("10.00"), batch_code="SHARED-BATCH")

    def transfer(index):
        source, destination = (warehouse.id, warehouse_two.id) if index % 2 == 0 else (warehouse_two.id, warehouse.id)
        transfer_stock_atomic(organization, actor, source_warehouse_id=source, destination_warehouse_id=destination, lines=[{"sku_id": sku.id, "quantity": 10}])

    outcomes = run_concurrent(transfer, 6)
    assert outcomes == [None] * 6
    positions = StockBalance.objects.filter(organization=organization, sku=sku)
    assert sum((position.on_hand for position in positions), Decimal("0")) == 200
    layers = InventoryLayer.objects.filter(organization=organization, sku=sku)
    assert sum((layer.remaining_value for layer in layers), Decimal("0.00")) == Decimal("2000.00")


def test_concurrent_receipts_cannot_exceed_purchase_order(actor, organization, vendor, sku, warehouse):
    order = create_purchase_order(
        organization,
        actor,
        vendor_id=vendor.id,
        destination_warehouse_id=warehouse.id,
        currency="USD",
        exchange_rate=Decimal("1"),
        expected_at="2026-12-01T00:00:00Z",
        reference="RECEIPT-RACE",
        lines=[{"sku_id": sku.id, "quantity": 100, "unit_cost": Decimal("10.00")}],
    )
    approve_purchase_order(organization, actor, order.id)
    item = order.items.get()
    costs = {"freight": Decimal("0"), "customs": Decimal("0"), "port_handling": Decimal("0"), "insurance": Decimal("0"), "currency": "USD", "exchange_rate": Decimal("1")}

    def receive(_):
        post_goods_receipt(
            organization,
            actor,
            purchase_order_id=order.id,
            warehouse_id=warehouse.id,
            allocation_method="weight",
            costs=costs,
            lines=[{"purchase_order_item_id": item.id, "quantity": 80}],
        )

    outcomes = run_concurrent(receive, 2)
    assert len([result for result in outcomes if result is None]) == 1
    assert len([result for result in outcomes if isinstance(result, ServiceError)]) == 1
    item.refresh_from_db()
    assert item.received_quantity == 80
    assert PurchaseOrderItem.objects.get(pk=item.pk).received_quantity == 80


def test_concurrent_customer_payments_cannot_overpay_invoice(actor, organization, invoice, customer):
    def collect(_):
        record_customer_payment(
            organization,
            actor,
            customer_id=customer.id,
            payment_method="BANK",
            amount=Decimal("80.00"),
            currency="USD",
            exchange_rate=Decimal("1"),
            reference="PAYMENT-RACE",
        )

    outcomes = run_concurrent(collect, 2)
    assert len([result for result in outcomes if result is None]) == 1
    assert len([result for result in outcomes if isinstance(result, ServiceError)]) == 1
    assert PaymentAllocation.objects.filter(invoice=invoice).aggregate(total=Sum("amount_base"))["total"] == Decimal("80.00")
    customer.refresh_from_db()
    invoice.refresh_from_db()
    assert customer.receivable_balance == Decimal("20.00")
    assert invoice.status == InvoiceStatus.ISSUED


def test_concurrent_expenses_cannot_overdraw_payment_account(actor, organization, opening_cash):
    def spend(_):
        record_expense(
            organization,
            actor,
            category="UTILITIES",
            payee="Utility Vendor",
            reference="LIQUIDITY-RACE",
            notes="Concurrent utility payment",
            payment_method="BANK",
            amount=Decimal("7500.00"),
            currency="USD",
            exchange_rate=Decimal("1"),
        )

    outcomes = run_concurrent(spend, 2)
    assert len([result for result in outcomes if result is None]) == 1
    assert len([result for result in outcomes if isinstance(result, ServiceError)]) == 1
    account = Account.objects.get(organization=organization, code="101100")
    assert account.balance == Decimal("2500.00")
