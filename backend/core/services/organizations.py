from django.db import transaction

from core.models import ApprovalEntityType, ApprovalRule, Organization, User, UserRole
from core.services.documents import ensure_document_sequences
from finance.models import Account, AccountGroup, NormalBalance


DEFAULT_ACCOUNTS = [
    ("100000", "Assets", AccountGroup.ASSETS, NormalBalance.DEBIT, None),
    ("101000", "Cash & Cash Equivalents", AccountGroup.ASSETS, NormalBalance.DEBIT, "100000"),
    ("101100", "Bank Operating Account", AccountGroup.ASSETS, NormalBalance.DEBIT, "100000"),
    ("101200", "Mobile Banking Wallet", AccountGroup.ASSETS, NormalBalance.DEBIT, "100000"),
    ("102000", "Accounts Receivable", AccountGroup.ASSETS, NormalBalance.DEBIT, "100000"),
    ("103000", "Inventory Asset", AccountGroup.ASSETS, NormalBalance.DEBIT, "100000"),
    ("200000", "Liabilities", AccountGroup.LIABILITIES, NormalBalance.CREDIT, None),
    ("201000", "Accrued Accounts Payable", AccountGroup.LIABILITIES, NormalBalance.CREDIT, "200000"),
    ("202000", "Freight & Duty Clearing", AccountGroup.LIABILITIES, NormalBalance.CREDIT, "200000"),
    ("203000", "Sales Tax Payable", AccountGroup.LIABILITIES, NormalBalance.CREDIT, "200000"),
    ("300000", "Equity", AccountGroup.EQUITY, NormalBalance.CREDIT, None),
    ("301000", "Opening Balance Equity", AccountGroup.EQUITY, NormalBalance.CREDIT, "300000"),
    ("400000", "Revenue", AccountGroup.REVENUE, NormalBalance.CREDIT, None),
    ("401000", "Product Sales Revenue", AccountGroup.REVENUE, NormalBalance.CREDIT, "400000"),
    ("500000", "Cost of Goods Sold", AccountGroup.COGS, NormalBalance.DEBIT, None),
    ("501000", "FIFO Cost of Goods Sold", AccountGroup.COGS, NormalBalance.DEBIT, "500000"),
    ("600000", "Operating Expenses", AccountGroup.EXPENSES, NormalBalance.DEBIT, None),
    ("601000", "Warehouse Operating Expenses", AccountGroup.EXPENSES, NormalBalance.DEBIT, "600000"),
    ("602000", "Warehouse Rent", AccountGroup.EXPENSES, NormalBalance.DEBIT, "600000"),
    ("603000", "Delivery Fuel", AccountGroup.EXPENSES, NormalBalance.DEBIT, "600000"),
    ("604000", "Freight & Port Miscellaneous", AccountGroup.EXPENSES, NormalBalance.DEBIT, "600000"),
    ("605000", "Staff Payroll", AccountGroup.EXPENSES, NormalBalance.DEBIT, "600000"),
    ("606000", "Utilities", AccountGroup.EXPENSES, NormalBalance.DEBIT, "600000"),
    ("607000", "Inventory Shrinkage", AccountGroup.EXPENSES, NormalBalance.DEBIT, "600000"),
]


def ensure_default_accounts(organization):
    accounts = {
        account.code: account
        for account in Account.objects.filter(organization=organization, code__in=[item[0] for item in DEFAULT_ACCOUNTS])
    }
    missing = []
    for code, name, group, normal_balance, parent_code in DEFAULT_ACCOUNTS:
        if code in accounts:
            continue
        account = Account(organization=organization, code=code, name=name, group=group, normal_balance=normal_balance, parent=accounts.get(parent_code), is_active=True)
        accounts[code] = account
        missing.append(account)
    Account.objects.bulk_create(missing)
    return accounts


@transaction.atomic
def provision_organization(*, legal_name, display_name, tax_id, base_currency, timezone, invoice_footer_note, email, password, full_name="", is_sandbox=False, expires_at=None, **address):
    organization = Organization(
        legal_name=legal_name,
        display_name=display_name,
        tax_id=tax_id,
        base_currency=base_currency,
        timezone=timezone,
        invoice_footer_note=invoice_footer_note,
        email=email,
        is_sandbox=is_sandbox,
        expires_at=expires_at,
        **address,
    )
    organization.full_clean()
    organization.save()
    ensure_default_accounts(organization)
    for entity_type, threshold, credit_check in (
        (ApprovalEntityType.PURCHASE_ORDER, "5000.0000", False),
        (ApprovalEntityType.SALES_ORDER, "0.0000", True),
    ):
        ApprovalRule.objects.create(
            organization=organization,
            entity_type=entity_type,
            threshold_amount=threshold,
            enforce_credit_limit=credit_check,
            approver_roles=[UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT],
            is_active=True,
        )
    user = User.objects.create_user(
        email=email,
        password=password,
        organization=organization,
        full_name=full_name,
        role=UserRole.SUPER_ADMIN,
        is_staff=False,
    )
    ensure_document_sequences(organization)
    return organization, user

