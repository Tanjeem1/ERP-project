from decimal import Decimal

from rest_framework import serializers

from core.api import CurrencyField, PaymentAccountMethodField, decimal_number, minor, payment_label, role_label, source_label
from finance.models import Account, JournalEntry, JournalLine, OperatingExpense


class AccountSerializer(serializers.ModelSerializer):
    group = serializers.SerializerMethodField()
    parentId = serializers.UUIDField(source="parent_id", allow_null=True)
    normalBalance = serializers.CharField(source="get_normal_balance_display", read_only=True)
    balanceMinor = serializers.SerializerMethodField()
    active = serializers.BooleanField(source="is_active", read_only=True)

    class Meta:
        model = Account
        fields = ["id", "code", "name", "group", "parentId", "normalBalance", "active", "balanceMinor"]

    def get_group(self, instance) -> str:
        return instance.group.title()

    def get_balanceMinor(self, instance) -> int:
        return minor(instance.balance)


class JournalLineSerializer(serializers.ModelSerializer):
    accountId = serializers.UUIDField(source="account_id", read_only=True)
    debitMinor = serializers.SerializerMethodField()
    creditMinor = serializers.SerializerMethodField()

    class Meta:
        model = JournalLine
        fields = ["id", "accountId", "description", "debitMinor", "creditMinor"]

    def get_debitMinor(self, instance) -> int:
        return minor(instance.debit)

    def get_creditMinor(self, instance) -> int:
        return minor(instance.credit)


class JournalEntrySerializer(serializers.ModelSerializer):
    timestamp = serializers.DateTimeField(read_only=True)
    source = serializers.SerializerMethodField()
    currency = serializers.CharField(read_only=True)
    status = serializers.CharField(source="get_status_display", read_only=True)
    lines = JournalLineSerializer(many=True, read_only=True)
    totalDebitMinor = serializers.SerializerMethodField()
    totalCreditMinor = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntry
        fields = ["id", "number", "timestamp", "description", "source", "status", "currency", "lines", "totalDebitMinor", "totalCreditMinor"]

    def get_source(self, instance) -> dict:
        return {"type": source_label(instance.source_type), "id": str(instance.source_id), "number": instance.source_number, "href": instance.source_href}

    def get_totalDebitMinor(self, instance) -> int:
        return minor(instance.total_debit)

    def get_totalCreditMinor(self, instance) -> int:
        return minor(instance.total_credit)


class ExpenseSerializer(serializers.ModelSerializer):
    category = serializers.CharField(source="get_category_display", read_only=True)
    paymentMethod = serializers.SerializerMethodField()
    warehouseId = serializers.UUIDField(source="warehouse_id", allow_null=True)
    paymentAccountId = serializers.UUIDField(source="payment_account_id", read_only=True)
    expenseAccountId = serializers.UUIDField(source="expense_account_id", read_only=True)
    amountMinor = serializers.SerializerMethodField()
    currency = serializers.CharField(read_only=True)
    fxRateToBase = serializers.SerializerMethodField()
    amountBaseMinor = serializers.SerializerMethodField()
    expenseDate = serializers.DateTimeField(source="expense_date", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    createdByRole = serializers.SerializerMethodField()
    journalEntryId = serializers.UUIDField(source="journal_entry_id", read_only=True)

    class Meta:
        model = OperatingExpense
        fields = ["id", "number", "category", "payee", "reference", "notes", "warehouseId", "paymentMethod", "paymentAccountId", "expenseAccountId", "amountMinor", "currency", "fxRateToBase", "amountBaseMinor", "expenseDate", "createdAt", "createdByRole", "journalEntryId"]

    def get_paymentMethod(self, instance) -> str:
        return payment_label(instance.payment_method, vendor=True)

    def get_amountMinor(self, instance) -> int:
        return minor(instance.amount)

    def get_fxRateToBase(self, instance) -> float:
        return decimal_number(instance.exchange_rate)

    def get_amountBaseMinor(self, instance) -> int:
        return minor(instance.amount_base)

    def get_createdByRole(self, instance) -> str:
        return role_label(instance.created_by_role)


class ExpenseInputSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=["WAREHOUSE_RENT", "DELIVERY_FUEL", "FREIGHT_PORT_MISC", "STAFF_PAYROLL", "UTILITIES", "INVENTORY_SHRINKAGE"])
    payee = serializers.CharField(max_length=180)
    reference = serializers.CharField(max_length=120)
    notes = serializers.CharField(max_length=500)
    warehouseId = serializers.UUIDField(required=False, allow_null=True)
    paymentMethod = PaymentAccountMethodField()
    amountMinor = serializers.IntegerField(min_value=1)
    currency = CurrencyField()
    fxRateToBase = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    expenseDate = serializers.DateTimeField(required=False, allow_null=True)


class WarehouseCapacitySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()
    usedCbm = serializers.FloatField()
    capacityCbm = serializers.FloatField()
    utilization = serializers.FloatField()
    valueMinor = serializers.IntegerField(allow_null=True)
    units = serializers.IntegerField()


class DashboardSerializer(serializers.Serializer):
    inventoryValuationMinor = serializers.IntegerField(allow_null=True)
    pendingLandedCostMinor = serializers.IntegerField(allow_null=True)
    onHandUnits = serializers.IntegerField()
    reservedUnits = serializers.IntegerField()
    availableUnits = serializers.IntegerField()
    reservedRatio = serializers.FloatField()
    realizedRevenueMinor = serializers.IntegerField(allow_null=True)
    realizedCogsMinor = serializers.IntegerField(allow_null=True)
    grossMarginPercent = serializers.FloatField(allow_null=True)
    unreconciledAccounts = serializers.IntegerField(allow_null=True)
    inventoryVarianceMinor = serializers.IntegerField(allow_null=True)
    warehouseData = WarehouseCapacitySerializer(many=True)
    agingData = serializers.DictField(child=serializers.IntegerField(allow_null=True))
    ledgerFeed = JournalEntrySerializer(many=True)


class TrialBalanceRowSerializer(serializers.Serializer):
    account = AccountSerializer()
    debitMinor = serializers.IntegerField()
    creditMinor = serializers.IntegerField()
    balanceMinor = serializers.IntegerField()


class TrialBalanceSerializer(serializers.Serializer):
    endDate = serializers.DateField()
    rows = TrialBalanceRowSerializer(many=True)
    totalDebitMinor = serializers.IntegerField()
    totalCreditMinor = serializers.IntegerField()
    balanced = serializers.BooleanField()


class ProfitLossSerializer(serializers.Serializer):
    startDate = serializers.DateField()
    endDate = serializers.DateField()
    revenueMinor = serializers.IntegerField()
    cogsMinor = serializers.IntegerField()
    grossProfitMinor = serializers.IntegerField()
    operatingExpensesMinor = serializers.IntegerField()
    shrinkageMinor = serializers.IntegerField()
    totalExpensesMinor = serializers.IntegerField()
    netProfitMinor = serializers.IntegerField()


class BalanceSheetSerializer(serializers.Serializer):
    endDate = serializers.DateField()
    assetsMinor = serializers.IntegerField()
    liabilitiesMinor = serializers.IntegerField()
    ledgerEquityMinor = serializers.IntegerField()
    currentEarningsMinor = serializers.IntegerField()
    equityMinor = serializers.IntegerField()
    liabilitiesAndEquityMinor = serializers.IntegerField()
    varianceMinor = serializers.IntegerField()
    balanced = serializers.BooleanField()


class FinancialReportsSerializer(serializers.Serializer):
    trialBalance = TrialBalanceSerializer()
    profitLoss = ProfitLossSerializer()
    balanceSheet = BalanceSheetSerializer()
    periodEntries = serializers.IntegerField()
