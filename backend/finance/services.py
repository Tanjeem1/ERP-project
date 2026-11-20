import uuid
from dataclasses import dataclass
from decimal import Decimal

from django.db import models, transaction
from django.db.models import F, Q, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from core.models import ActivityType, DocumentKind, ExpenseCategory, JournalSourceType, JournalStatus, PaymentMethod
from core.services.actors import Permission, actor_kwargs, assert_permission, record_activity, record_audit
from core.services.documents import next_document_number
from core.services.ledger import LedgerLine, post_journal
from core.services.money import ServiceError, base_value, datetime_value, money, non_negative, positive
from core.services.time import local_date_range, local_day_bounds, today_bounds
from finance.models import Account, AccountGroup, JournalEntry, NormalBalance, OperatingExpense
from inventory.models import InventoryLayer, StockBalance, Warehouse, WarehouseStatus
from procurement.models import PurchaseOrderItem, PurchaseOrderStatus


@dataclass(frozen=True)
class AccountBalance:
    account: Account
    debit: Decimal
    credit: Decimal
    balance: Decimal


EXPENSE_ACCOUNTS = {
    ExpenseCategory.WAREHOUSE_RENT: "602000",
    ExpenseCategory.DELIVERY_FUEL: "603000",
    ExpenseCategory.FREIGHT_PORT_MISC: "604000",
    ExpenseCategory.STAFF_PAYROLL: "605000",
    ExpenseCategory.UTILITIES: "606000",
    ExpenseCategory.INVENTORY_SHRINKAGE: "607000",
}
PAYMENT_ACCOUNTS = {
    PaymentMethod.CASH: "101000",
    PaymentMethod.BANK: "101100",
    PaymentMethod.MOBILE_BANKING: "101200",
}


@transaction.atomic
def record_expense(organization, actor, *, category, payee, reference, notes, warehouse_id=None, payment_method, amount, currency, exchange_rate, expense_date=None):
    assert_permission(actor, organization, Permission.POST_EXPENSES)
    if category not in EXPENSE_ACCOUNTS or payment_method not in PAYMENT_ACCOUNTS:
        raise ServiceError("Unsupported expense category or payment method.")
    if not payee.strip() or not reference.strip() or not notes.strip():
        raise ServiceError("Payee, reference, and business purpose are required.")
    if warehouse_id:
        from inventory.models import Warehouse

        warehouse = Warehouse.objects.get(organization=organization, pk=warehouse_id, status=WarehouseStatus.ACTIVE)
    else:
        warehouse = None
    amount = positive(amount)
    amount_base = base_value(amount, exchange_rate)
    timestamp = datetime_value(expense_date)
    expense_id = uuid.uuid4()
    number = next_document_number(organization, DocumentKind.EXPENSE)
    payment_account_code = PAYMENT_ACCOUNTS[payment_method]
    expense_account_code = EXPENSE_ACCOUNTS[category]
    journal = post_journal(
        organization,
        actor,
        JournalSourceType.EXPENSE,
        expense_id,
        number,
        f"/app/expenses?expense={expense_id}",
        f"{number} · {category} paid via {payment_method}",
        [
            LedgerLine(expense_account_code, f"{category} · {payee}", debit=amount_base),
            LedgerLine(payment_account_code, f"{payment_method} payment · {reference}", credit=amount_base),
        ],
        timestamp=timestamp,
        liquidity_account_codes=[payment_account_code],
    )
    expense = OperatingExpense.objects.create(
        id=expense_id,
        organization=organization,
        number=number,
        category=category,
        payee=payee.strip(),
        reference=reference.strip(),
        notes=notes.strip(),
        warehouse=warehouse,
        payment_method=payment_method,
        payment_account_id=journal.lines.get(account__code=payment_account_code).account_id,
        expense_account_id=journal.lines.get(account__code=expense_account_code).account_id,
        amount=amount,
        currency=currency,
        exchange_rate=exchange_rate,
        amount_base=amount_base,
        expense_date=timestamp,
        journal_entry=journal,
        **actor_kwargs(actor),
    )
    record_activity(organization, ActivityType.FINANCE, "Operating expense posted", f"{number} recorded {category} and reduced {payment_method} by {amount_base} {organization.base_currency}.", number, f"/app/expenses?expense={expense.id}", [journal])
    record_audit(organization, actor, "Operating expense recorded", "OperatingExpense", expense.id, new_value={"number": number, "amount_base": str(amount_base), "journal": journal.number})
    return expense


def trial_balance(organization, end_date):
    end_timestamp = local_day_bounds(organization, end_date)[1]
    accounts = Account.objects.filter(organization=organization, is_active=True).annotate(
        debit_total=Coalesce(models.Sum("journal_lines__debit", filter=Q(journal_lines__journal_entry__status=JournalStatus.POSTED, journal_lines__journal_entry__timestamp__lte=end_timestamp)), Value(Decimal("0.0000"))),
        credit_total=Coalesce(models.Sum("journal_lines__credit", filter=Q(journal_lines__journal_entry__status=JournalStatus.POSTED, journal_lines__journal_entry__timestamp__lte=end_timestamp)), Value(Decimal("0.0000"))),
    ).order_by("code")
    result = []
    for account in accounts:
        balance = account.debit_total - account.credit_total if account.normal_balance == NormalBalance.DEBIT else account.credit_total - account.debit_total
        result.append(AccountBalance(account, account.debit_total, account.credit_total, money(balance)))
    if sum((item.debit for item in result), Decimal("0")) != sum((item.credit for item in result), Decimal("0")):
        raise ServiceError("The trial balance is not balanced.")
    return result


def _group_balances(organization, start_timestamp, end_timestamp):
    rows = Account.objects.filter(organization=organization, is_active=True).values("group").annotate(
        debit=Coalesce(models.Sum("journal_lines__debit", filter=Q(journal_lines__journal_entry__status=JournalStatus.POSTED, journal_lines__journal_entry__timestamp__gte=start_timestamp, journal_lines__journal_entry__timestamp__lte=end_timestamp)), Value(Decimal("0.0000"))),
        credit=Coalesce(models.Sum("journal_lines__credit", filter=Q(journal_lines__journal_entry__status=JournalStatus.POSTED, journal_lines__journal_entry__timestamp__gte=start_timestamp, journal_lines__journal_entry__timestamp__lte=end_timestamp)), Value(Decimal("0.0000"))),
    )
    balances = {}
    for row in rows:
        if row["group"] in {AccountGroup.ASSETS, AccountGroup.COGS, AccountGroup.EXPENSES}:
            balances[row["group"]] = money(row["debit"] - row["credit"])
        else:
            balances[row["group"]] = money(row["credit"] - row["debit"])
    return balances


def profit_and_loss(organization, start_date, end_date):
    start_timestamp, end_timestamp = local_date_range(organization, start_date, end_date)
    balances = _group_balances(organization, start_timestamp, end_timestamp)
    revenue = balances.get(AccountGroup.REVENUE, Decimal("0.00"))
    cogs = balances.get(AccountGroup.COGS, Decimal("0.00"))
    total_expenses = balances.get(AccountGroup.EXPENSES, Decimal("0.00"))
    shrinkage_row = Account.objects.filter(organization=organization, code="607000").annotate(
        debit=Coalesce(models.Sum("journal_lines__debit", filter=Q(journal_lines__journal_entry__status=JournalStatus.POSTED, journal_lines__journal_entry__timestamp__gte=start_timestamp, journal_lines__journal_entry__timestamp__lte=end_timestamp)), Value(Decimal("0.0000"))),
        credit=Coalesce(models.Sum("journal_lines__credit", filter=Q(journal_lines__journal_entry__status=JournalStatus.POSTED, journal_lines__journal_entry__timestamp__gte=start_timestamp, journal_lines__journal_entry__timestamp__lte=end_timestamp)), Value(Decimal("0.0000"))),
    ).first()
    shrinkage = (shrinkage_row.debit - shrinkage_row.credit) if shrinkage_row else Decimal("0.00")
    operating_expenses = money(total_expenses - shrinkage)
    gross_profit = money(revenue - cogs)
    net_profit = money(gross_profit - total_expenses)
    return {
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "operating_expenses": operating_expenses,
        "shrinkage": money(shrinkage),
        "total_expenses": total_expenses,
        "net_profit": net_profit,
    }


def balance_sheet(organization, end_date):
    end_timestamp = local_day_bounds(organization, end_date)[1]
    earnings_start, _ = local_date_range(organization, "2000-01-01", end_date)
    all_time = _group_balances(organization, earnings_start, end_timestamp)
    balances = all_time
    current_earnings = money(
        all_time.get(AccountGroup.REVENUE, Decimal("0.00"))
        - all_time.get(AccountGroup.COGS, Decimal("0.00"))
        - all_time.get(AccountGroup.EXPENSES, Decimal("0.00"))
    )
    assets = balances.get(AccountGroup.ASSETS, Decimal("0.00"))
    liabilities = balances.get(AccountGroup.LIABILITIES, Decimal("0.00"))
    ledger_equity = balances.get(AccountGroup.EQUITY, Decimal("0.00"))
    equity = money(ledger_equity + current_earnings)
    return {
        "assets": assets,
        "liabilities": liabilities,
        "ledger_equity": ledger_equity,
        "current_earnings": current_earnings,
        "equity": equity,
        "liabilities_and_equity": money(liabilities + equity),
        "variance": money(assets - liabilities - equity),
    }


def build_financial_statements(organization, start_date, end_date):
    local_date_range(organization, start_date, end_date)
    return {
        "trial_balance": trial_balance(organization, end_date),
        "profit_loss": profit_and_loss(organization, start_date, end_date),
        "balance_sheet": balance_sheet(organization, end_date),
        "period_entries": JournalEntry.objects.filter(organization=organization, status=JournalStatus.POSTED, timestamp__gte=local_date_range(organization, start_date, end_date)[0], timestamp__lte=local_date_range(organization, start_date, end_date)[1]).count(),
    }


def dashboard_summary(organization):
    today = today_bounds(organization)[1].date()
    inventory_value = InventoryLayer.objects.filter(organization=organization).aggregate(value=Coalesce(models.Sum("remaining_value"), Value(Decimal("0.0000"))))["value"]
    stock = StockBalance.objects.filter(organization=organization).aggregate(
        on_hand=Coalesce(models.Sum("on_hand"), Value(Decimal("0.0000"))),
        reserved=Coalesce(models.Sum("reserved"), Value(Decimal("0.0000"))),
    )
    pending = PurchaseOrderItem.objects.filter(
        organization=organization,
        purchase_order__status__in=[PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.IN_TRANSIT],
    ).aggregate(value=Coalesce(models.Sum((F("ordered_quantity") - F("received_quantity")) * F("unit_cost") * F("purchase_order__exchange_rate")), Value(Decimal("0.0000"))))["value"]
    report = profit_and_loss(organization, "2000-01-01", today)
    revenue = report["revenue"]
    cogs = report["cogs"]
    gross_margin = money((revenue - cogs) / revenue * 100) if revenue else Decimal("0.00")
    inventory_ledger = next((item.balance for item in trial_balance(organization, today) if item.account.code == "103000"), Decimal("0.00"))
    freight = next((item.balance for item in trial_balance(organization, today) if item.account.code == "202000"), Decimal("0.00"))
    warehouses = []
    for warehouse in Warehouse.objects.filter(organization=organization, status=WarehouseStatus.ACTIVE):
        layers = InventoryLayer.objects.filter(organization=organization, warehouse=warehouse, remaining_quantity__gt=0)
        used_cbm = sum((layer.remaining_quantity * layer.sku.volume_cbm for layer in layers), Decimal("0.0000"))
        value = sum((layer.remaining_value for layer in layers), Decimal("0.00"))
        units = sum((layer.remaining_quantity for layer in layers), Decimal("0.00"))
        warehouses.append({
            "id": str(warehouse.id),
            "code": warehouse.code,
            "name": warehouse.name,
            "used_cbm": used_cbm,
            "capacity_cbm": warehouse.capacity_cbm,
            "utilization": (used_cbm / warehouse.capacity_cbm * 100) if warehouse.capacity_cbm else Decimal("0.00"),
            "value": value,
            "units": units,
        })
    now = timezone.now()
    aging = {}
    for label, lower, upper in (("0-30", 0, 30), ("31-60", 31, 60), ("61-90", 61, 90), ("90+", 91, None)):
        layers = InventoryLayer.objects.filter(organization=organization, remaining_quantity__gt=0)
        if lower:
            layers = layers.filter(received_at__lt=now - timezone.timedelta(days=lower - 1))
        if upper is not None:
            layers = layers.filter(received_at__gte=now - timezone.timedelta(days=upper))
        else:
            layers = layers.filter(received_at__lt=now - timezone.timedelta(days=90))
        aging[label] = layers.aggregate(value=Coalesce(models.Sum("remaining_value"), Value(Decimal("0.0000"))))["value"]
    return {
        "inventory_valuation": inventory_value,
        "pending_landed_cost": pending,
        "on_hand_units": stock["on_hand"],
        "reserved_units": stock["reserved"],
        "available_units": stock["on_hand"] - stock["reserved"],
        "reserved_ratio": (stock["reserved"] / stock["on_hand"]) if stock["on_hand"] else Decimal("0.00"),
        "realized_revenue": revenue,
        "realized_cogs": cogs,
        "gross_margin_percent": gross_margin,
        "unreconciled_accounts": int(freight != 0) + int(inventory_ledger != inventory_value),
        "warehouse_data": warehouses,
        "aging_data": aging,
        "inventory_variance": money(inventory_ledger - inventory_value),
    }
