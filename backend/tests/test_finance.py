from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import DatabaseError, transaction

from core.services.fiscal import update_fiscal_settings
from core.services.money import ServiceError
from finance.models import Account, JournalEntry
from finance.services import build_financial_statements, dashboard_summary, record_expense
from inventory.models import InventoryLayer
from orders.services import create_sales_order, ship_order


def test_financial_statements_reconcile_profit_and_balance_sheet(actor, organization, customer, sku, warehouse, opening_cash, opening_layer):
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="FINANCIAL-REPORT",
        lines=[{"sku_id": sku.id, "quantity": 24, "unit_price": Decimal("25.00")}],
    )
    ship_order(organization, actor, order.id)
    record_expense(
        organization,
        actor,
        category="WAREHOUSE_RENT",
        payee="Test Landlord",
        reference="RENT-001",
        notes="Warehouse rent",
        payment_method="BANK",
        amount=Decimal("50.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
    )
    report = build_financial_statements(organization, "2000-01-01", "2026-12-31")
    assert report["profit_loss"]["revenue"] == Decimal("600.00")
    assert report["profit_loss"]["cogs"] == Decimal("240.00")
    assert report["profit_loss"]["gross_profit"] == Decimal("360.00")
    assert report["profit_loss"]["operating_expenses"] == Decimal("50.00")
    assert report["profit_loss"]["net_profit"] == Decimal("310.00")
    assert report["balance_sheet"]["assets"] == Decimal("11310.00")
    assert report["balance_sheet"]["equity"] == Decimal("11310.00")
    assert report["balance_sheet"]["variance"] == Decimal("0.00")
    assert sum((line.debit for line in report["trial_balance"]), Decimal("0.00")) == sum((line.credit for line in report["trial_balance"]), Decimal("0.00"))


def test_expense_reduces_liquidity_and_net_profit(actor, organization, opening_cash):
    expense = record_expense(
        organization,
        actor,
        category="WAREHOUSE_RENT",
        payee="Test Landlord",
        reference="RENT-1250",
        notes="Warehouse rent",
        payment_method="BANK",
        amount=Decimal("1250.00"),
        currency="USD",
        exchange_rate=Decimal("1"),
    )
    assert Account.objects.get(organization=organization, code="101100").balance == Decimal("8750.00")
    assert expense.journal_entry.total_debit == expense.journal_entry.total_credit
    report = build_financial_statements(organization, "2000-01-01", "2026-12-31")
    assert report["profit_loss"]["net_profit"] == Decimal("-1250.00")


def test_expense_cannot_overdraw_payment_account(actor, organization, opening_cash):
    with pytest.raises(ServiceError):
        record_expense(
            organization,
            actor,
            category="UTILITIES",
            payee="Utility Vendor",
            reference="OVERDRAW",
            notes="Excessive utility payment",
            payment_method="BANK",
            amount=Decimal("10001.00"),
            currency="USD",
            exchange_rate=Decimal("1"),
        )
    assert Account.objects.get(organization=organization, code="101100").balance == Decimal("10000.00")


def test_fiscal_revaluation_preserves_original_journals(actor, organization, customer, opening_cash, opening_layer):
    original = JournalEntry.objects.get(organization=organization, description="Opening cash and equity balance")
    original_total = original.total_debit
    original_currency = original.currency
    original_count = JournalEntry.objects.count()
    revaluation = update_fiscal_settings(
        organization,
        actor,
        legal_name="Nexus Test Industries",
        display_name="Nexus Test",
        tax_id="TEST-TAX-001",
        base_currency="EUR",
        timezone="Asia/Dhaka",
        invoice_footer_note="Test invoice footer",
        currency_conversion_rate=Decimal("0.92"),
    )
    original.refresh_from_db()
    organization.refresh_from_db()
    assert original.total_debit == original_total
    assert original.currency == original_currency
    assert revaluation is not None
    assert JournalEntry.objects.count() == original_count + 1
    assert Account.objects.get(organization=organization, code="101100").balance == Decimal("9200.00")
    assert InventoryLayer.objects.get(pk=opening_layer.pk).remaining_value == Decimal("920.00")
    assert organization.base_currency == "EUR"
    report = build_financial_statements(organization, "2000-01-01", "2026-12-31")
    assert report["balance_sheet"]["variance"] == Decimal("0.00")


def test_dashboard_aggregates_inventory_and_financial_metrics(actor, organization, customer, sku, warehouse, opening_layer):
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1"),
        reference="DASHBOARD",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_price": Decimal("25.00")}],
    )
    ship_order(organization, actor, order.id)
    summary = dashboard_summary(organization)
    assert summary["inventory_valuation"] == Decimal("900.00")
    assert summary["on_hand_units"] == 90
    assert summary["reserved_units"] == 0
    assert summary["available_units"] == 90
    assert summary["realized_revenue"] == Decimal("250.00")
    assert summary["realized_cogs"] == Decimal("100.00")
    assert summary["unreconciled_accounts"] == 0
    assert summary["inventory_variance"] == Decimal("0.00")


def test_posted_journals_are_immutable_at_model_and_database_levels(actor, organization, opening_cash):
    journal = JournalEntry.objects.get(organization=organization, description="Opening cash and equity balance")
    with pytest.raises(ValidationError):
        journal.save()
    with pytest.raises(ValidationError):
        journal.delete()
    with transaction.atomic():
        with pytest.raises(DatabaseError):
            JournalEntry.objects.filter(pk=journal.pk).update(description="Attempted edit")
    with transaction.atomic():
        with pytest.raises(DatabaseError):
            journal.lines.all().delete()
    with pytest.raises(ValidationError):
        JournalEntry(
            organization=organization,
            number="INVALID-POSTED",
            timestamp=journal.timestamp,
            description="Attempt to create a posted journal without lines",
            source_type="OPENING_BALANCE",
            source_id=organization.id,
            source_number="INVALID",
            status="POSTED",
            currency="USD",
            total_debit=100,
            total_credit=100,
        ).save()
