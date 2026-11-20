from decimal import Decimal

from django.db import transaction
from django.db.models import F

from core.models import Currency, JournalSourceType
from core.services.actors import Permission, assert_permission, record_audit
from core.services.ledger import LedgerLine, post_journal
from core.services.money import money, positive
from finance.models import Account, JournalLine, NormalBalance
from inventory.models import InventoryLayer, SKU
from orders.models import CreditNote, Customer, CustomerPayment, Invoice, PaymentAllocation, SalesOrder, SalesOrderItem, SalesReturn, SalesReturnItem
from procurement.models import GoodsReceiptItem, GoodsReceiptNote, LandedCostAllocation, PurchaseOrder, Vendor, VendorPayment
from finance.models import JournalEntry, OperatingExpense
from inventory.models import StockAdjustment


@transaction.atomic
def update_fiscal_settings(organization, actor, *, legal_name, display_name, tax_id, base_currency, timezone, invoice_footer_note, currency_conversion_rate):
    assert_permission(actor, organization, Permission.VIEW_GOVERNANCE)
    if base_currency not in Currency.values:
        raise ValueError("Unsupported base currency.")
    rate = positive(currency_conversion_rate)
    previous_currency = organization.base_currency
    previous_timezone = organization.timezone
    organization.legal_name = legal_name.strip()
    organization.display_name = display_name.strip()
    organization.tax_id = tax_id.strip()
    organization.timezone = timezone.strip()
    organization.invoice_footer_note = invoice_footer_note.strip()
    organization.base_currency = base_currency
    organization.full_clean()
    revaluation = None
    if previous_currency != base_currency and rate != Decimal("1.0000"):
        lines = []
        for account in Account.objects.filter(organization=organization, is_active=True):
            delta = money(account.balance * rate - account.balance)
            if delta == 0:
                continue
            if account.normal_balance == NormalBalance.DEBIT:
                lines.append(LedgerLine(account.code, f"Base-currency revaluation to {base_currency}", debit=delta if delta > 0 else Decimal("0.00"), credit=-delta if delta < 0 else Decimal("0.00")))
            else:
                lines.append(LedgerLine(account.code, f"Base-currency revaluation to {base_currency}", debit=-delta if delta < 0 else Decimal("0.00"), credit=delta if delta > 0 else Decimal("0.00")))
        if lines:
            revaluation = post_journal(
                organization,
                actor,
                JournalSourceType.FISCAL_REVALUATION,
                organization.id,
                f"FX-{previous_currency}-{base_currency}",
                "/app/settings",
                f"Base currency revaluation from {previous_currency} to {base_currency} at {rate}",
                lines,
            )
        conversions = [
            (Customer, ["credit_limit", "receivable_balance"]),
            (Vendor, ["payable_balance"]),
            (PurchaseOrder, ["exchange_rate", "total_base_amount"]),
            (GoodsReceiptNote, ["cost_exchange_rate", "total_goods_base", "total_landed_cost_base", "total_inventory_base"]),
            (GoodsReceiptItem, ["base_unit_cost", "base_goods_cost", "allocated_landed_cost", "true_unit_cost", "true_total_cost"]),
            (LandedCostAllocation, ["freight_base", "customs_base", "port_handling_base", "insurance_base"]),
            (InventoryLayer, ["unit_cost", "allocated_landed_unit_cost", "remaining_value"]),
            (SKU, ["cost_price"]),
            (SalesOrder, ["exchange_rate", "subtotal_base", "tax_base", "total_base"]),
            (SalesOrderItem, ["cogs_base"]),
            (Invoice, ["exchange_rate", "subtotal_base", "tax_base", "total_base", "cogs_base"]),
            (OperatingExpense, ["exchange_rate", "amount_base"]),
            (CustomerPayment, ["exchange_rate", "amount_base"]),
            (PaymentAllocation, ["amount_base"]),
            (VendorPayment, ["exchange_rate", "amount_base"]),
            (SalesReturn, ["restored_value_base", "shrinkage_base"]),
            (SalesReturnItem, ["unit_cost_base"]),
            (CreditNote, ["amount_base"]),
            (StockAdjustment, ["value_delta"]),
        ]
        for model, fields in conversions:
            model.objects.filter(organization=organization).update(**{field: F(field) * rate for field in fields})
    organization.save()
    record_audit(
        organization,
        actor,
        "Fiscal settings updated",
        "Organization",
        organization.id,
        old_value={"base_currency": previous_currency, "timezone": previous_timezone},
        new_value={"base_currency": organization.base_currency, "timezone": organization.timezone, "conversion_rate": str(rate), "revaluation_journal": revaluation.number if revaluation else None},
    )
    return revaluation
