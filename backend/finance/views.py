from decimal import Decimal

from django.http import StreamingHttpResponse
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import minor
from core.models import JournalStatus
from core.serializers import DateRangeSerializer
from core.services.actors import Permission, assert_permission
from core.services.cache import get_cached
from core.services.money import from_minor_units
from core.services.time import local_date_range
from core.viewsets import TenantViewSet
from finance.models import Account, JournalEntry, OperatingExpense
from finance.serializers import AccountSerializer, BalanceSheetSerializer, DashboardSerializer, ExpenseInputSerializer, ExpenseSerializer, FinancialReportsSerializer, JournalEntrySerializer, ProfitLossSerializer, TrialBalanceSerializer
from finance.services import balance_sheet, dashboard_summary, profit_and_loss, record_expense, trial_balance


def date_range(request):
    parameters = {"startDate": request.query_params.get("startDate", "2000-01-01")}
    if request.query_params.get("endDate"):
        parameters["endDate"] = request.query_params["endDate"]
    serializer = DateRangeSerializer(data=parameters, context={"organization": request.user.organization})
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data["startDate"], serializer.validated_data["endDate"]


def trial_balance_payload(organization, end_date):
    rows = trial_balance(organization, end_date)
    debit = sum((row.debit for row in rows), Decimal("0.00"))
    credit = sum((row.credit for row in rows), Decimal("0.00"))
    return {
        "endDate": end_date.isoformat(),
        "rows": [{"account": AccountSerializer(row.account).data, "debitMinor": minor(row.debit), "creditMinor": minor(row.credit), "balanceMinor": minor(row.balance)} for row in rows],
        "totalDebitMinor": minor(debit),
        "totalCreditMinor": minor(credit),
        "balanced": debit == credit,
    }


def profit_loss_payload(organization, start_date, end_date):
    report = profit_and_loss(organization, start_date, end_date)
    labels = {"revenue": "revenueMinor", "cogs": "cogsMinor", "gross_profit": "grossProfitMinor", "operating_expenses": "operatingExpensesMinor", "shrinkage": "shrinkageMinor", "total_expenses": "totalExpensesMinor", "net_profit": "netProfitMinor"}
    return {"startDate": start_date.isoformat(), "endDate": end_date.isoformat(), **{labels[key]: minor(value) for key, value in report.items()}}


def balance_sheet_payload(organization, end_date):
    report = balance_sheet(organization, end_date)
    labels = {"assets": "assetsMinor", "liabilities": "liabilitiesMinor", "ledger_equity": "ledgerEquityMinor", "current_earnings": "currentEarningsMinor", "equity": "equityMinor", "liabilities_and_equity": "liabilitiesAndEquityMinor", "variance": "varianceMinor"}
    return {"endDate": end_date.isoformat(), **{labels[key]: minor(value) for key, value in report.items()}, "balanced": report["variance"] == 0}


def dashboard_payload(organization, user):
    data = dashboard_summary(organization)
    can_profit = user.role in {"SUPER_ADMIN", "ACCOUNTANT"}
    entries = JournalEntry.objects.filter(organization=organization, status=JournalStatus.POSTED).prefetch_related("lines__account").order_by("-timestamp", "-created_at")[:10] if can_profit else []
    return {
        "inventoryValuationMinor": minor(data["inventory_valuation"]) if can_profit else None,
        "pendingLandedCostMinor": minor(data["pending_landed_cost"]) if can_profit else None,
        "onHandUnits": int(data["on_hand_units"]),
        "reservedUnits": int(data["reserved_units"]),
        "availableUnits": int(data["available_units"]),
        "reservedRatio": float(data["reserved_ratio"]),
        "realizedRevenueMinor": minor(data["realized_revenue"]) if can_profit else None,
        "realizedCogsMinor": minor(data["realized_cogs"]) if can_profit else None,
        "grossMarginPercent": float(data["gross_margin_percent"]) if can_profit else None,
        "unreconciledAccounts": data["unreconciled_accounts"] if can_profit else None,
        "inventoryVarianceMinor": minor(data["inventory_variance"]) if can_profit else None,
        "warehouseData": [{
            "id": item["id"], "code": item["code"], "name": item["name"], "usedCbm": float(item["used_cbm"]),
            "capacityCbm": float(item["capacity_cbm"]), "utilization": float(item["utilization"]),
            "valueMinor": minor(item["value"]) if can_profit else None, "units": int(item["units"]),
        } for item in data["warehouse_data"]],
        "agingData": {key: minor(value) if can_profit else None for key, value in data["aging_data"].items()},
        "ledgerFeed": JournalEntrySerializer(entries, many=True).data,
    }


class DashboardView(APIView):
    def get(self, request):
        role = request.user.role
        data = get_cached("dashboard", request.user.organization, f"summary:{role}", lambda: dashboard_payload(request.user.organization, request.user), timeout=5)
        return Response(data)


class AccountViewSet(TenantViewSet):
    queryset = Account.objects.select_related("parent")
    serializer_class = AccountSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_LEDGER)
        return super().get_queryset().filter(is_active=True).order_by("code")

    @action(detail=False, methods=["get"], url_path="tree")
    def tree(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)


class JournalEntryViewSet(TenantViewSet):
    queryset = JournalEntry.objects.select_related("created_by").prefetch_related("lines__account")
    serializer_class = JournalEntrySerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_LEDGER)
        queryset = super().get_queryset().filter(status=JournalStatus.POSTED)
        params = self.request.query_params
        if params.get("sourceType"):
            queryset = queryset.filter(source_type=params["sourceType"])
        if params.get("sourceId"):
            queryset = queryset.filter(source_id=params["sourceId"])
        if params.get("accountId"):
            queryset = queryset.filter(lines__account_id=params["accountId"]).distinct()
        if params.get("startDate") or params.get("endDate"):
            start, end = local_date_range(self.get_organization(), params.get("startDate", "2000-01-01"), params.get("endDate", "2999-12-31"))
            queryset = queryset.filter(timestamp__gte=start, timestamp__lte=end)
        return queryset.order_by("-timestamp", "-created_at", "id")


class TrialBalanceView(APIView):
    def get(self, request):
        assert_permission(request.user, request.user.organization, Permission.VIEW_LEDGER)
        _, end_date = date_range(request)
        return Response(trial_balance_payload(request.user.organization, end_date))


class ProfitLossView(APIView):
    def get(self, request):
        assert_permission(request.user, request.user.organization, Permission.VIEW_LEDGER)
        start_date, end_date = date_range(request)
        return Response(profit_loss_payload(request.user.organization, start_date, end_date))


class BalanceSheetView(APIView):
    def get(self, request):
        assert_permission(request.user, request.user.organization, Permission.VIEW_LEDGER)
        _, end_date = date_range(request)
        return Response(balance_sheet_payload(request.user.organization, end_date))


class FinancialReportsView(APIView):
    def get(self, request):
        assert_permission(request.user, request.user.organization, Permission.VIEW_LEDGER)
        start_date, end_date = date_range(request)
        organization = request.user.organization
        start, end = local_date_range(organization, start_date, end_date)
        name = f"financial_statements:{request.user.role}:{start_date}:{end_date}"

        def load():
            return {
                "trialBalance": trial_balance_payload(organization, end_date),
                "profitLoss": profit_loss_payload(organization, start_date, end_date),
                "balanceSheet": balance_sheet_payload(organization, end_date),
                "periodEntries": JournalEntry.objects.filter(organization=organization, status=JournalStatus.POSTED, timestamp__gte=start, timestamp__lte=end).count(),
            }

        return Response(get_cached("finance", organization, name, load, timeout=15))


class OperatingExpenseViewSet(TenantViewSet):
    queryset = OperatingExpense.objects.select_related("warehouse", "payment_account", "expense_account", "journal_entry")
    serializer_class = ExpenseSerializer
    input_serializer_class = ExpenseInputSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_LEDGER)
        queryset = super().get_queryset()
        params = self.request.query_params
        if params.get("paymentMethod"):
            queryset = queryset.filter(payment_method=params["paymentMethod"])
        if params.get("category"):
            queryset = queryset.filter(category=params["category"])
        if params.get("startDate") or params.get("endDate"):
            start, end = local_date_range(self.get_organization(), params.get("startDate", "2000-01-01"), params.get("endDate", "2999-12-31"))
            queryset = queryset.filter(expense_date__gte=start, expense_date__lte=end)
        return queryset.order_by("-expense_date", "-created_at")

    def create_record(self, serializer):
        data = serializer.validated_data
        return record_expense(
            self.get_organization(), self.request.user, category=data["category"], payee=data["payee"], reference=data["reference"],
            notes=data["notes"], warehouse_id=data.get("warehouseId"), payment_method=data["paymentMethod"],
            amount=from_minor_units(data["amountMinor"]), currency=data["currency"], exchange_rate=data["fxRateToBase"], expense_date=data.get("expenseDate"),
        )


def csv_cell(value):
    text = str(value if value is not None else "")
    if text.startswith(("=", "+", "-", "@", "\t", "\r")):
        text = "'" + text
    return '"' + text.replace('"', '""') + '"'


def csv_response(filename, rows):
    response = StreamingHttpResponse((",".join(csv_cell(value) for value in row) + "\r\n" for row in rows()), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-Content-Type-Options"] = "nosniff"
    return response


class JournalExportView(APIView):
    def get(self, request):
        assert_permission(request.user, request.user.organization, Permission.VIEW_LEDGER)
        start, end = local_date_range(request.user.organization, request.query_params.get("startDate", "2000-01-01"), request.query_params.get("endDate", "2999-12-31"))
        entries = JournalEntry.objects.filter(organization=request.user.organization, status=JournalStatus.POSTED, timestamp__gte=start, timestamp__lte=end).prefetch_related("lines__account").order_by("timestamp", "id")

        def rows():
            yield ["Journal ID", "Timestamp", "Source Event", "Description", "Account Code", "Account Name", "Debit", "Credit"]
            for entry in entries.iterator(chunk_size=500):
                for line in entry.lines.all():
                    yield [entry.number, entry.timestamp.isoformat(), f"{entry.source_type} {entry.source_number}", line.description, line.account.code, line.account.name, line.debit, line.credit]

        return csv_response("nexusledger-journal.csv", rows)


class ExpenseExportView(APIView):
    def get(self, request):
        assert_permission(request.user, request.user.organization, Permission.VIEW_LEDGER)
        start, end = local_date_range(request.user.organization, request.query_params.get("startDate", "2000-01-01"), request.query_params.get("endDate", "2999-12-31"))
        expenses = OperatingExpense.objects.filter(organization=request.user.organization, expense_date__gte=start, expense_date__lte=end).select_related("payment_account", "expense_account").order_by("expense_date", "id")

        def rows():
            yield ["Expense ID", "Date", "Category", "Payee", "Reference", "Payment Method", "Amount", "Base Amount"]
            for expense in expenses.iterator(chunk_size=500):
                yield [expense.number, expense.expense_date.isoformat(), expense.category, expense.payee, expense.reference, expense.payment_method, expense.amount, expense.amount_base]

        return csv_response("nexusledger-expenses.csv", rows)


DashboardView = extend_schema(responses=DashboardSerializer)(DashboardView)
TrialBalanceView = extend_schema(parameters=[DateRangeSerializer], responses=TrialBalanceSerializer)(TrialBalanceView)
ProfitLossView = extend_schema(parameters=[DateRangeSerializer], responses=ProfitLossSerializer)(ProfitLossView)
BalanceSheetView = extend_schema(parameters=[DateRangeSerializer], responses=BalanceSheetSerializer)(BalanceSheetView)
FinancialReportsView = extend_schema(parameters=[DateRangeSerializer], responses=FinancialReportsSerializer)(FinancialReportsView)
JournalExportView = extend_schema(parameters=[DateRangeSerializer], responses={(200, "text/csv"): OpenApiTypes.BINARY})(JournalExportView)
ExpenseExportView = extend_schema(parameters=[DateRangeSerializer], responses={(200, "text/csv"): OpenApiTypes.BINARY})(ExpenseExportView)
