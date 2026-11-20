from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny
from rest_framework.routers import DefaultRouter

from core.views import AcceptInvitationView, ApprovalViewSet, AuditLogViewSet, BookDemoView, FiscalSettingsView, LoginView, LogoutView, MeView, NotificationViewSet, PublicBenchmarksView, RefreshView, RegisterView, RevokeInvitationView, SandboxRoleView, SandboxView, SearchView, TeamMemberRoleView, TeamSettingsView, health_check
from finance.views import AccountViewSet, BalanceSheetView, DashboardView, ExpenseExportView, FinancialReportsView, JournalEntryViewSet, JournalExportView, OperatingExpenseViewSet, ProfitLossView, TrialBalanceView
from inventory.views import InventoryLayerViewSet, ReservationViewSet, SKUViewSet, StockAdjustmentViewSet, StockTransferViewSet, StockViewSet, WarehouseViewSet
from orders.views import CollectionViewSet, CreditNoteViewSet, CustomerPaymentViewSet, CustomerViewSet, InvoiceViewSet, PosViewSet, SalesOrderViewSet, SalesReturnViewSet
from procurement.views import GoodsReceiptViewSet, PurchaseOrderViewSet, VendorPaymentViewSet, VendorViewSet


router = DefaultRouter()
router.register("inventory/warehouses", WarehouseViewSet, basename="warehouse")
router.register("inventory/skus", SKUViewSet, basename="sku")
router.register("inventory/stock", StockViewSet, basename="stock")
router.register("inventory/reservations", ReservationViewSet, basename="reservation")
router.register("inventory/layers", InventoryLayerViewSet, basename="inventory-layer")
router.register("inventory/transfers", StockTransferViewSet, basename="stock-transfer")
router.register("inventory/adjustments", StockAdjustmentViewSet, basename="stock-adjustment")
router.register("vendors", VendorViewSet, basename="vendor")
router.register("procurement/purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register("procurement/receipts", GoodsReceiptViewSet, basename="goods-receipt")
router.register("procurement/vendor-payments", VendorPaymentViewSet, basename="vendor-payment")
router.register("customers", CustomerViewSet, basename="customer")
router.register("customer-payments", CustomerPaymentViewSet, basename="customer-payment")
router.register("orders", SalesOrderViewSet, basename="sales-order")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("returns", SalesReturnViewSet, basename="sales-return")
router.register("credit-notes", CreditNoteViewSet, basename="credit-note")
router.register("collections", CollectionViewSet, basename="collection")
router.register("pos", PosViewSet, basename="pos")
router.register("finance/accounts", AccountViewSet, basename="account")
router.register("finance/journal-entries", JournalEntryViewSet, basename="journal-entry")
router.register("finance/expenses", OperatingExpenseViewSet, basename="expense")
router.register("approvals", ApprovalViewSet, basename="approval")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

schema_view = SpectacularAPIView.as_view(permission_classes=[AllowAny], authentication_classes=[], throttle_classes=[])
swagger_view = SpectacularSwaggerView.as_view(url_name="api-schema", permission_classes=[AllowAny], authentication_classes=[], throttle_classes=[])

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/schema/", schema_view, name="api-schema"),
    path("api/schema/swagger-ui/", swagger_view, name="api-swagger"),
    path("api/v1/auth/register/", RegisterView.as_view(), name="auth-register"),
    path("api/v1/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/v1/auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/v1/auth/me/", MeView.as_view(), name="auth-me"),
    path("api/v1/auth/sandbox/", SandboxView.as_view(), name="auth-sandbox"),
    path("api/v1/auth/sandbox/switch-role/", SandboxRoleView.as_view(), name="sandbox-switch-role"),
    path("api/v1/sandbox/switch-role/", SandboxRoleView.as_view(), name="sandbox-switch-role-alias"),
    path("api/v1/public/book-demo/", BookDemoView.as_view(), name="public-book-demo"),
    path("api/v1/public/benchmarks/", PublicBenchmarksView.as_view(), name="public-benchmarks"),
    path("api/v1/settings/fiscal/", FiscalSettingsView.as_view(), name="fiscal-settings"),
    path("api/v1/settings/team/", TeamSettingsView.as_view(), name="team-settings"),
    path("api/v1/settings/team/accept/", AcceptInvitationView.as_view(), name="team-accept"),
    path("api/v1/settings/team/members/<uuid:user_id>/role/", TeamMemberRoleView.as_view(), name="team-member-role"),
    path("api/v1/settings/team/<uuid:invitation_id>/revoke/", RevokeInvitationView.as_view(), name="team-invitation-revoke"),
    path("api/v1/search/", SearchView.as_view(), name="global-search"),
    path("api/v1/dashboard/summary/", DashboardView.as_view(), name="dashboard-summary"),
    path("api/v1/finance/trial-balance/", TrialBalanceView.as_view(), name="trial-balance"),
    path("api/v1/finance/profit-loss/", ProfitLossView.as_view(), name="profit-loss"),
    path("api/v1/finance/balance-sheet/", BalanceSheetView.as_view(), name="balance-sheet"),
    path("api/v1/finance/reports/", FinancialReportsView.as_view(), name="financial-reports"),
    path("api/v1/finance/journal-entries/export/", JournalExportView.as_view(), name="journal-export"),
    path("api/v1/finance/expenses/export/", ExpenseExportView.as_view(), name="expense-export"),
    path("api/v1/", include(router.urls)),
]
