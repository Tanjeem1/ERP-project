from datetime import datetime, timezone as datetime_timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.db import DatabaseError, transaction

from core.services.money import ServiceError
from finance.models import Account
from inventory.models import InventoryLayer, StockBalance, StockReservation
from orders.models import CustomerPayment, Invoice, InvoiceStatus, OrderStatus, PaymentAllocation, SalesOrder
from orders.services import approve_sales_order, checkout_pos, collection_summary, create_customer, create_sales_order, create_sales_return, customer_purchase_history, record_customer_payment, replace_customer_payment, ship_order, update_sales_order_line_quantity


def test_credit_limited_order_waits_for_approval(actor, organization, customer, sku, warehouse, opening_layer):
    customer.credit_limit = Decimal("100.00")
    customer.save(update_fields=["credit_limit"])
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="CREDIT-APPROVAL",
        lines=[{"sku_id": sku.id, "quantity": 2, "unit_price": Decimal("75.00")}],
    )
    assert order.status == OrderStatus.PENDING_APPROVAL
    assert StockReservation.objects.filter(organization=organization).count() == 0
    approve_sales_order(organization, actor, order.id)
    order.refresh_from_db()
    assert order.status == OrderStatus.ORDER_PLACED
    assert StockReservation.objects.get(organization=organization, sales_order_item__sales_order=order).quantity == 2


def test_order_quantity_decrease_updates_reservation(actor, organization, customer, sku, warehouse, opening_layer):
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="QUANTITY-DOWN",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_price": Decimal("20.00")}],
    )
    item = order.items.get()
    update_sales_order_line_quantity(organization, actor, order.id, item.id, 5)
    reservation = StockReservation.objects.get(organization=organization, sales_order_item=item)
    assert reservation.quantity == 5
    assert StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse).reserved == 5


def test_shipping_creates_invoice_and_two_balanced_journals(actor, organization, invoice, customer):
    assert invoice.total_base == Decimal("100.00")
    assert invoice.cogs_base == Decimal("100.00")
    assert invoice.journal_entries.count() == 2
    assert all(journal.total_debit == journal.total_credit for journal in invoice.journal_entries.all())
    customer.refresh_from_db()
    assert customer.receivable_balance == Decimal("100.00")
    assert invoice.sales_order.status == OrderStatus.INVOICED


def test_payment_allocates_oldest_invoice_and_replacement_reverses_original(actor, organization, invoice, customer, sku, warehouse, opening_cash):
    second_order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="SECOND-INVOICE",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_price": Decimal("10.00")}],
    )
    second_invoice = ship_order(organization, actor, second_order.id).invoice
    payment = record_customer_payment(
        organization,
        actor,
        customer_id=customer.id,
        payment_method="BANK",
        amount=Decimal("150.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="COLLECT-150",
    )
    assert PaymentAllocation.objects.get(payment=payment, invoice=invoice).amount_base == Decimal("100.00")
    assert PaymentAllocation.objects.get(payment=payment, invoice=second_invoice).amount_base == Decimal("50.00")
    invoice.refresh_from_db()
    second_invoice.refresh_from_db()
    assert invoice.status == InvoiceStatus.PAID
    assert second_invoice.status == InvoiceStatus.ISSUED
    replacement = replace_customer_payment(
        organization,
        actor,
        payment.id,
        payment_method="BANK",
        amount=Decimal("50.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        received_at="2026-11-19T00:00:00Z",
        reference="REPLACEMENT-50",
    )
    payment.refresh_from_db()
    customer.refresh_from_db()
    assert payment.status == "REPLACED"
    assert replacement.reversal_of_payment_id == payment.id
    assert customer.receivable_balance == Decimal("150.00")
    assert payment.reversal_journal_entry.total_debit == Decimal("150.00")
    with pytest.raises(ValidationError):
        payment.journal_entry.save()
    with pytest.raises(ValidationError):
        payment.journal_entry.delete()


def test_collection_cutoffs_use_organization_timezone(actor, organization, invoice, customer, sku, warehouse):
    record_customer_payment(
        organization,
        actor,
        customer_id=customer.id,
        payment_method="BANK",
        amount=Decimal("50.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        received_at="2026-11-18T18:30:00+00:00",
        reference="DHAKA-NEXT-DAY",
    )
    second_order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="SECOND-COLLECTION",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_price": Decimal("10.00")}],
    )
    ship_order(organization, actor, second_order.id)
    record_customer_payment(
        organization,
        actor,
        customer_id=customer.id,
        payment_method="BANK",
        amount=Decimal("50.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        received_at="2026-11-18T17:59:59+00:00",
        reference="DHAKA-PREVIOUS-DAY",
    )
    fixed_now = datetime(2026, 11, 19, 12, 0, tzinfo=datetime_timezone.utc)
    with patch("core.services.time.timezone.now", return_value=fixed_now):
        summary = collection_summary(organization, "2026-11-19", "2026-11-19")
    assert summary["collected_today"] == Decimal("50.00")
    assert summary["collected_this_month"] == Decimal("100.00")
    assert summary["collected_range"] == Decimal("50.00")


def test_ar_aging_buckets(actor, organization, customer, warehouse):
    for days, number in ((10, "INV-AGE-10"), (45, "INV-AGE-45"), (90, "INV-AGE-90")):
        issued = {10: "2026-11-09T00:00:00Z", 45: "2026-10-05T00:00:00Z", 90: "2026-08-21T00:00:00Z"}[days]
        sales_order = SalesOrder.objects.create(
            organization=organization,
            number=f"SO-{number}",
            customer=customer,
            warehouse=warehouse,
            channel="B2B",
            currency="USD",
            exchange_rate=Decimal("1"),
            reference=number,
        )
        Invoice.objects.create(
            organization=organization,
            number=number,
            sales_order=sales_order,
            order_number=sales_order.number,
            customer=customer,
            currency="USD",
            exchange_rate=Decimal("1"),
            issued_at=issued,
            due_at=issued,
            subtotal=Decimal("100.00"),
            total_amount=Decimal("100.00"),
            subtotal_base=Decimal("100.00"),
            total_base=Decimal("100.00"),
        )
    record_customer_payment(
        organization,
        actor,
        customer_id=customer.id,
        payment_method="BANK",
        amount=Decimal("50.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
        received_at="2026-11-19T00:00:00Z",
        reference="AGING-PAYMENT",
    )
    summary = collection_summary(organization, "2026-11-19", "2026-11-19")
    assert summary["aging"]["0-30"] == Decimal("100.00")
    assert summary["aging"]["31-60"] == Decimal("100.00")
    assert summary["aging"]["61+"] == Decimal("50.00")


def test_pos_split_payment_posts_sale_collection_and_remaining_debt(actor, organization, taxed_customer, sku, warehouse, opening_layer):
    result = checkout_pos(
        organization,
        actor,
        customer_id=taxed_customer.id,
        warehouse_id=warehouse.id,
        lines=[{"sku_id": sku.id, "quantity": 2, "unit_price": Decimal("20.00")}],
        payments=[("CASH", Decimal("20.00")), ("BANK", Decimal("10.00"))],
        exchange_rate=Decimal("1"),
    )
    assert result.invoice.total_base == Decimal("43.50")
    assert result.customer_due == Decimal("13.50")
    assert len(result.payments) == 2
    assert StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse).on_hand == 98
    assert StockReservation.objects.get(organization=organization, sales_order_item__sales_order=result.order).status == "CONSUMED"


def test_pos_credit_limit_stops_before_stock_reservation(actor, organization, customer, sku, warehouse, opening_layer):
    customer.credit_limit = Decimal("10.00")
    customer.save(update_fields=["credit_limit"])
    result = checkout_pos(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        lines=[{"sku_id": sku.id, "quantity": 1, "unit_price": Decimal("20.00")}],
        payments=[],
        exchange_rate=Decimal("1"),
    )
    assert result.invoice is None
    assert result.order.status == OrderStatus.PENDING_APPROVAL
    assert StockReservation.objects.filter(organization=organization).count() == 0


def test_returns_restore_stock_expense_damage_and_credit_customer(actor, organization, taxed_customer, sku, warehouse, opening_layer):
    order = create_sales_order(
        organization,
        actor,
        customer_id=taxed_customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="RETURN-ORDER",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_price": Decimal("20.00")}],
    )
    ship_order(organization, actor, order.id)
    returned = create_sales_return(
        organization,
        actor,
        order_id=order.id,
        reason="Customer returned damaged and sellable items",
        lines=[{"order_item_id": order.items.get().id, "quantity": 3, "condition": "RESTOCKABLE"}, {"order_item_id": order.items.get().id, "quantity": 1, "condition": "DAMAGED_EXPIRED"}],
    )
    assert returned.restored_value_base == Decimal("30.00")
    assert returned.shrinkage_base == Decimal("10.00")
    assert returned.credit_note.amount_base == Decimal("87.00")
    assert returned.journal_entries.count() == 3
    assert returned.items.get(condition="RESTOCKABLE").restored_layer.remaining_value == Decimal("30.00")
    assert StockBalance.objects.get(organization=organization, sku=sku, warehouse=warehouse).on_hand == 93
    taxed_customer.refresh_from_db()
    assert taxed_customer.receivable_balance == Decimal("130.50")


def test_itemized_customer_purchase_history(actor, organization, invoice, sku):
    history = customer_purchase_history(organization, invoice.customer_id)
    assert history.count() == 1
    assert history.first().sku == sku
    assert history.first().quantity == 10
