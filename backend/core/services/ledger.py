from dataclasses import dataclass
from decimal import Decimal

from django.core.exceptions import PermissionDenied
from django.db import models

from core.models import ActivityType, DocumentKind, JournalSourceType, JournalStatus
from core.services.actors import Permission, actor_kwargs, assert_permission, record_activity, record_audit
from core.services.documents import next_document_number
from core.services.money import ZERO, ServiceError, datetime_value, money
from finance.models import Account, JournalEntry, JournalLine, NormalBalance


@dataclass(frozen=True)
class LedgerLine:
    account_code: str
    description: str
    debit: Decimal = ZERO
    credit: Decimal = ZERO


def post_journal(organization, actor, source_type, source_id, source_number, source_href, description, lines, timestamp=None, liquidity_account_codes=()):
    if actor.organization_id != organization.id or not actor.is_active:
        raise PermissionDenied("The actor does not belong to this organization.")
    if source_type not in JournalSourceType.values:
        raise ServiceError("Unsupported journal source type.")
    lines = [line for line in lines if line.debit != ZERO or line.credit != ZERO]
    if not lines:
        raise ServiceError("A journal requires at least one debit and one credit line.")
    codes = {line.account_code for line in lines}
    accounts = {account.code: account for account in Account.objects.filter(organization=organization, code__in=codes, is_active=True)}
    if len(accounts) != len(codes):
        raise ServiceError("A journal line references an unknown or inactive account.")
    total_debit = money(sum((line.debit for line in lines), ZERO))
    total_credit = money(sum((line.credit for line in lines), ZERO))
    if total_debit <= ZERO or total_debit != total_credit:
        raise ServiceError("Journal debits and credits must be positive and equal.")
    for line in lines:
        if (line.debit > ZERO) == (line.credit > ZERO):
            raise ServiceError("Every journal line must contain exactly one debit or credit amount.")
    journal = JournalEntry.objects.create(
        organization=organization,
        number=next_document_number(organization, DocumentKind.JOURNAL),
        timestamp=datetime_value(timestamp),
        description=description,
        source_type=source_type,
        source_id=source_id,
        source_number=source_number,
        source_href=source_href,
        status=JournalStatus.DRAFT,
        currency=organization.base_currency,
        total_debit=total_debit,
        total_credit=total_credit,
        **actor_kwargs(actor),
    )
    JournalLine.objects.bulk_create([
        JournalLine(
            organization=organization,
            journal_entry=journal,
            account=accounts[line.account_code],
            description=line.description,
            debit=money(line.debit),
            credit=money(line.credit),
            position=index,
        )
        for index, line in enumerate(lines, start=1)
    ])
    journal.mark_posted()
    for line in lines:
        account = accounts[line.account_code]
        delta = money(line.debit - line.credit) if account.normal_balance == NormalBalance.DEBIT else money(line.credit - line.debit)
        if account.code in liquidity_account_codes:
            if account.normal_balance != NormalBalance.DEBIT or line.credit <= ZERO:
                raise ServiceError("Liquidity controls require a debit-normal payment account with a credit line.")
            updated = Account.objects.filter(pk=account.pk, balance__gte=line.credit).update(balance=models.F("balance") + delta)
            if updated != 1:
                raise ServiceError(f"Insufficient balance in {account.name}.")
        else:
            Account.objects.filter(pk=account.pk).update(balance=models.F("balance") + delta)
    return journal


def post_opening_balance(organization, actor, amount, timestamp=None, cash_account_code="101000"):
    assert_permission(actor, organization, Permission.VIEW_LEDGER)
    amount = money(amount)
    if amount <= ZERO:
        raise ServiceError("Opening cash must be greater than zero.")
    journal = post_journal(
        organization,
        actor,
        JournalSourceType.OPENING_BALANCE,
        organization.id,
        f"OPEN-{organization.display_name}",
        "/app/finance",
        "Opening cash and equity balance",
        [
            LedgerLine(cash_account_code, "Opening cash", debit=amount),
            LedgerLine("301000", "Opening equity", credit=amount),
        ],
        timestamp=timestamp,
    )
    record_audit(organization, actor, "Opening balance posted", "Organization", organization.id, new_value={"amount": str(amount), "journal": journal.number})
    record_activity(organization, ActivityType.FINANCE, "Opening balance posted", f"Opening cash of {amount} was recorded.", journal.number, "/app/finance", [journal])
    return journal
