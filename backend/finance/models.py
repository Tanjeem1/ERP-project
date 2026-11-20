from decimal import Decimal

from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from simple_history.models import HistoricalRecords

from core.models import ActorModel, Currency, ExpenseCategory, JournalSourceType, JournalStatus, PaymentMethod, TenantModel, decimal_field, non_negative_decimal_field, positive_decimal_field


class AccountGroup(models.TextChoices):
    ASSETS = "ASSETS", "Assets"
    LIABILITIES = "LIABILITIES", "Liabilities"
    EQUITY = "EQUITY", "Equity"
    REVENUE = "REVENUE", "Revenue"
    COGS = "COGS", "COGS"
    EXPENSES = "EXPENSES", "Operating Expenses"


class NormalBalance(models.TextChoices):
    DEBIT = "DEBIT", "Debit"
    CREDIT = "CREDIT", "Credit"


class Account(TenantModel):
    code = models.CharField(max_length=24)
    name = models.CharField(max_length=160)
    group = models.CharField(max_length=16, choices=AccountGroup.choices)
    parent = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="children")
    normal_balance = models.CharField(max_length=8, choices=NormalBalance.choices)
    balance = decimal_field()
    is_active = models.BooleanField(default=True)

    history = HistoricalRecords(excluded_fields=["balance"])

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "code"], name="finance_account_code_unique")]
        indexes = [models.Index(fields=["organization", "group", "parent"], name="finance_account_tree_idx")]

    def __str__(self):
        return f"{self.code} · {self.name}"


class JournalEntry(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    description = models.TextField()
    source_type = models.CharField(max_length=32, choices=JournalSourceType.choices)
    source_id = models.UUIDField()
    source_number = models.CharField(max_length=80)
    source_href = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, choices=JournalStatus.choices, default=JournalStatus.DRAFT, db_index=True)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    total_debit = non_negative_decimal_field()
    total_credit = non_negative_decimal_field()
    reversal_of = models.OneToOneField("self", on_delete=models.PROTECT, null=True, blank=True, related_name="reversal")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="finance_journal_number_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=["DRAFT", "REVERSED"]) | models.Q(total_debit=models.F("total_credit")),
                name="finance_journal_totals_balanced",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status", "timestamp"], name="finance_journal_posted_idx"),
            models.Index(fields=["organization", "source_type", "source_id"], name="finance_journal_source_idx"),
            GinIndex(fields=["number", "source_number", "description"], name="finance_journal_search_trgm", opclasses=["gin_trgm_ops", "gin_trgm_ops", "gin_trgm_ops"]),
        ]

    def clean(self):
        if self.status == JournalStatus.POSTED and self.total_debit != self.total_credit:
            raise ValidationError("A posted journal entry must have equal debit and credit totals.")

    def save(self, *args, **kwargs):
        if self._state.adding and self.status != JournalStatus.DRAFT:
            raise ValidationError("Create a draft journal and post it only after all lines exist.")
        if self.pk and not self._state.adding:
            previous_status = type(self).objects.filter(pk=self.pk).values_list("status", flat=True).first()
            if previous_status in {JournalStatus.POSTED, JournalStatus.REVERSED}:
                raise ValidationError("Posted journal entries are immutable.")
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Posted journal entries cannot be deleted.")

    def mark_posted(self):
        if self.status != JournalStatus.DRAFT:
            raise ValidationError("Only a draft journal can be posted.")
        totals = self.lines.aggregate(
            debit=Coalesce(Sum("debit"), Value(Decimal("0.0000"))),
            credit=Coalesce(Sum("credit"), Value(Decimal("0.0000"))),
        )
        if totals["debit"] != totals["credit"] or totals["debit"] == 0:
            raise ValidationError("Journal lines must be non-empty and balanced before posting.")
        updated = type(self).objects.filter(pk=self.pk, status=JournalStatus.DRAFT).update(
            status=JournalStatus.POSTED,
            total_debit=totals["debit"],
            total_credit=totals["credit"],
        )
        if updated != 1:
            raise ValidationError("The journal was already posted or does not exist.")
        self.status = JournalStatus.POSTED
        self.total_debit = totals["debit"]
        self.total_credit = totals["credit"]


class JournalLine(TenantModel):
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="journal_lines")
    description = models.CharField(max_length=255)
    debit = non_negative_decimal_field()
    credit = non_negative_decimal_field()
    position = models.PositiveSmallIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["journal_entry", "position"], name="finance_journal_line_position_unique"),
            models.CheckConstraint(
                condition=(
                    models.Q(debit__gt=Decimal("0.0000"), credit=Decimal("0.0000"))
                    | models.Q(debit=Decimal("0.0000"), credit__gt=Decimal("0.0000"))
                ),
                name="finance_journal_line_single_side",
            ),
        ]
        indexes = [models.Index(fields=["organization", "account", "journal_entry"], name="finance_line_account_idx")]

    def clean(self):
        if (self.debit > 0 and self.credit > 0) or (self.debit <= 0 and self.credit <= 0):
            raise ValidationError("Each journal line must have a positive amount on exactly one side.")

    def save(self, *args, **kwargs):
        if self.journal_entry.status in {JournalStatus.POSTED, JournalStatus.REVERSED}:
            raise ValidationError("Lines of a posted journal are immutable.")
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.journal_entry.status in {JournalStatus.POSTED, JournalStatus.REVERSED}:
            raise ValidationError("Lines of a posted journal cannot be deleted.")
        return super().delete(*args, **kwargs)


class OperatingExpense(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    category = models.CharField(max_length=32, choices=ExpenseCategory.choices)
    payee = models.CharField(max_length=180)
    reference = models.CharField(max_length=120)
    notes = models.TextField()
    warehouse = models.ForeignKey("inventory.Warehouse", on_delete=models.PROTECT, null=True, blank=True, related_name="operating_expenses")
    payment_method = models.CharField(max_length=20, choices=[(PaymentMethod.CASH.value, PaymentMethod.CASH.label), (PaymentMethod.BANK.value, PaymentMethod.BANK.label), (PaymentMethod.MOBILE_BANKING.value, PaymentMethod.MOBILE_BANKING.label)])
    payment_account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="expense_payments")
    expense_account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="expense_postings")
    amount = positive_decimal_field()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    exchange_rate = positive_decimal_field(default=Decimal("1.0000"))
    amount_base = positive_decimal_field()
    expense_date = models.DateTimeField(db_index=True)
    journal_entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, related_name="operating_expense")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="finance_expense_number_unique")]
        indexes = [models.Index(fields=["organization", "category", "expense_date"], name="finance_expense_period_idx")]
