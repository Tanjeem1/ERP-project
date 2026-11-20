import { ApiError, apiRequest, normalizeApiPath } from "@/lib/api";
import type { SessionUser } from "@/store/useSessionStore";
import type {
  AuthResponse,
  ApprovalRequest,
  CollectionSummary,
  DashboardSummary,
  ErpSnapshot,
  FifoSimulation,
  FinancialReports,
  NotificationItem,
  OrderHistoryItem,
  Paginated,
  PosCheckoutResult,
  SearchResult,
} from "@/types/api";
import type {
  ActivityEvent,
  CreatePurchaseOrderInput,
  CreateSalesOrderInput,
  CreateSalesReturnInput,
  CreateStockAuditInput,
  Customer,
  CustomerPayment,
  DateRangeFilter,
  EntityId,
  ExpenseCategory,
  ExpenseRecord,
  FiscalSettingsInput,
  GoodsReceipt,
  JournalEntry,
  Organization,
  PostGoodsReceiptInput,
  Product,
  ProductMasterInput,
  PurchaseOrder,
  RecordCustomerPaymentInput,
  RecordExpenseInput,
  RecordVendorPaymentInput,
  RegisterOrganizationInput,
  ReserveStockInput,
  SalesOrder,
  SalesReturn,
  StockAudit,
  StockReservation,
  StockTransfer,
  TransferStockInput,
  UpdateCustomerInput,
  UpdateCustomerPaymentInput,
  UserRole,
  VendorPayment,
  Warehouse,
  WarehouseMasterInput,
} from "@/types/erp";

export type ErpResourceKey = keyof Pick<ErpSnapshot,
  "warehouses" | "products" | "suppliers" | "customers" | "purchaseOrders" | "goodsReceipts" | "costLayers" |
  "inventory" | "reservations" | "transfers" | "orders" | "invoices" | "accounts" | "journalEntries" |
  "expenses" | "customerPayments" | "vendorPayments" | "salesReturns" | "creditNotes" | "stockAudits" |
  "auditLog" | "dashboard" | "financialReports" | "collectionSummary" | "approvals" | "notifications"
>;

export const financialResourceKeys: ErpResourceKey[] = ["inventory", "costLayers", "accounts", "journalEntries", "dashboard", "financialReports", "collectionSummary", "auditLog", "notifications", "approvals"];

function get<T>(path: string) {
  return apiRequest<T>(path, { method: "GET", idempotent: false });
}

function post<T>(path: string, body: unknown = {}) {
  return apiRequest<T>(path, { method: "POST", body });
}

function postPublic<T>(path: string, body: unknown = {}) {
  return apiRequest<T>(path, { method: "POST", body, idempotent: false, skipRefresh: true });
}

function put<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: "PUT", body });
}

function patch<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: "PATCH", body });
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const records: T[] = [];
  let nextPath: string | null = path;
  while (nextPath) {
    const page: Paginated<T> = await get<Paginated<T>>(normalizeApiPath(nextPath));
    records.push(...page.results);
    nextPath = page.next;
  }
  return records;
}

async function optional<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return fallback;
    throw error;
  }
}

export function getDefaultReportRange(): DateRangeFilter {
  const today = new Date().toISOString().slice(0, 10);
  return { startDate: `${today.slice(0, 8)}01`, endDate: today };
}

export function getFinancialReports(range = getDefaultReportRange()) {
  return get<FinancialReports>(`/finance/reports/?startDate=${range.startDate}&endDate=${range.endDate}`);
}

export function getCollectionSummary(range = getDefaultReportRange()) {
  return get<CollectionSummary>(`/collections/summary/?startDate=${range.startDate}&endDate=${range.endDate}`);
}

export function getDashboardSummary() {
  return get<DashboardSummary>("/dashboard/summary/");
}

const loaders: Record<ErpResourceKey, () => Promise<unknown>> = {
  warehouses: () => fetchAll<Warehouse>("/inventory/warehouses/"),
  products: () => fetchAll<Product>("/inventory/skus/"),
  suppliers: () => optional(() => fetchAll<ErpSnapshot["suppliers"][number]>("/vendors/"), []),
  customers: () => fetchAll<Customer>("/customers/"),
  purchaseOrders: () => fetchAll<PurchaseOrder>("/procurement/purchase-orders/"),
  goodsReceipts: () => optional(() => fetchAll<GoodsReceipt>("/procurement/receipts/"), []),
  costLayers: () => optional(() => fetchAll<ErpSnapshot["costLayers"][number]>("/inventory/layers/"), []),
  inventory: () => fetchAll<ErpSnapshot["inventory"][number]>("/inventory/stock/"),
  reservations: () => fetchAll<StockReservation>("/inventory/reservations/"),
  transfers: () => fetchAll<StockTransfer>("/inventory/transfers/"),
  orders: () => fetchAll<SalesOrder>("/orders/"),
  invoices: () => fetchAll<ErpSnapshot["invoices"][number]>("/invoices/"),
  accounts: () => fetchAll<ErpSnapshot["accounts"][number]>("/finance/accounts/"),
  journalEntries: () => fetchAll<JournalEntry>("/finance/journal-entries/"),
  expenses: () => fetchAll<ExpenseRecord>("/finance/expenses/"),
  customerPayments: () => fetchAll<CustomerPayment>("/customer-payments/"),
  vendorPayments: () => fetchAll<VendorPayment>("/procurement/vendor-payments/"),
  salesReturns: () => fetchAll<SalesReturn>("/returns/"),
  creditNotes: () => fetchAll<ErpSnapshot["creditNotes"][number]>("/credit-notes/"),
  stockAudits: () => fetchAll<StockAudit>("/inventory/adjustments/"),
  auditLog: async () => {
    const entries = await optional(() => fetchAll<ErpSnapshot["auditLog"][number]>("/audit-logs/"), []);
    const entityLabels: Record<string, string> = { PurchaseOrder: "Purchase Order", SalesOrder: "Sales Order", GoodsReceiptNote: "Goods Receipt", StockReservation: "Stock Reservation", StockTransfer: "Stock Transfer", StockAdjustment: "Stock Audit", CustomerPayment: "Customer Payment", VendorPayment: "Vendor Payment", OperatingExpense: "Expense" };
    return entries.map((entry) => ({
      ...entry,
      userId: entry.userId ?? "system",
      userName: entry.userName || "System",
      entityType: entityLabels[entry.entityType] ?? entry.entityType,
      oldValue: typeof entry.oldValue === "string" ? entry.oldValue : JSON.stringify(entry.oldValue),
      newValue: typeof entry.newValue === "string" ? entry.newValue : JSON.stringify(entry.newValue),
    }));
  },
  dashboard: getDashboardSummary,
  financialReports: () => optional(() => getFinancialReports(), null),
  collectionSummary: getCollectionSummary,
  approvals: () => optional(() => fetchAll<ApprovalRequest>("/approvals/"), []),
  notifications: () => fetchAll<NotificationItem>("/notifications/"),
};

export async function refreshErpData(keys: ErpResourceKey[]): Promise<Partial<ErpSnapshot>> {
  const entries = await Promise.all(keys.map(async (key) => {
    try {
      return [key, await loaders[key]()] as const;
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        return [key, key === "dashboard" || key === "financialReports" || key === "collectionSummary" ? null : []] as const;
      }
      throw error;
    }
  }));
  return Object.fromEntries(entries) as Partial<ErpSnapshot>;
}

function emptySequences() {
  return {
    purchaseOrder: 0, goodsReceipt: 0, salesOrder: 0, invoice: 0, journal: 0, transfer: 0, reservation: 0,
    activity: 0, expense: 0, customerPayment: 0, vendorPayment: 0, salesReturn: 0, creditNote: 0, stockAudit: 0, entity: 0,
  };
}

export function emptyErpSnapshot(user: SessionUser | null): ErpSnapshot {
  return {
    schemaVersion: 1,
    activeRole: user?.role ?? "Super Admin",
    organization: user?.organization ?? { id: "", legalName: "", displayName: "", taxId: "", baseCurrency: "USD", timezone: "UTC", invoiceFooterNote: "", email: "", phone: "", address: { line1: "", city: "", region: "", postalCode: "", countryCode: "" } },
    warehouses: [], products: [], suppliers: [], customers: [], purchaseOrders: [], goodsReceipts: [],
    costLayers: [], inventory: [], reservations: [], transfers: [], orders: [], invoices: [], accounts: [],
    journalEntries: [], expenses: [], customerPayments: [], vendorPayments: [], salesReturns: [], creditNotes: [],
    stockAudits: [], auditLog: [], activity: [], sequences: emptySequences(), dashboard: null,
    financialReports: null, collectionSummary: null, approvals: [], notifications: [],
  };
}

export async function loadErpSnapshot(user: SessionUser): Promise<ErpSnapshot> {
  const [snapshot, approvals, notifications, dashboard, financialReports, collectionSummary] = await Promise.all([
    refreshErpData([
      "warehouses", "products", "suppliers", "customers", "purchaseOrders", "costLayers", "inventory", "reservations",
      "transfers", "orders", "invoices", "accounts", "journalEntries", "expenses", "customerPayments", "vendorPayments",
      "salesReturns", "creditNotes", "stockAudits", "auditLog",
    ]),
    optional(() => fetchAll<ApprovalRequest>("/approvals/"), []),
    fetchAll<NotificationItem>("/notifications/"),
    getDashboardSummary(),
    optional(() => getFinancialReports(), null),
    getCollectionSummary(),
  ]);
  return {
    ...emptyErpSnapshot(user),
    ...snapshot,
    approvals,
    notifications,
    dashboard,
    financialReports,
    collectionSummary,
    activity: (snapshot.journalEntries ?? []).map(journalActivity),
  };
}

export function journalActivity(entry: JournalEntry): ActivityEvent {
  const source = entry.source.type;
  const type = source === "Goods Receipt" || source === "Purchase Order" ? "Procurement" : source === "Stock Transfer" || source === "Stock Audit" ? "Inventory" : source === "Sales Order" || source === "Invoice" || source === "Sales Return" || source === "POS Sale" ? "Sales" : "Finance";
  return {
    id: `journal-${entry.id}`,
    timestamp: entry.timestamp,
    type,
    title: source,
    description: entry.description,
    reference: entry.source.number,
    href: entry.source.href,
    journalEntryIds: [entry.id],
  };
}

export function getAuthMe() {
  return get<AuthResponse>("/auth/me/");
}

export function login(email: string, password: string) {
  return postPublic<AuthResponse>("/auth/login/", { email, password });
}

export function registerOrganization(input: RegisterOrganizationInput & { password: string; fullName?: string }) {
  return postPublic<AuthResponse>("/auth/register/", {
    legalName: input.legalName,
    displayName: input.displayName,
    taxId: input.taxId,
    baseCurrency: input.baseCurrency,
    timezone: input.timezone,
    invoiceFooterNote: input.invoiceFooterNote,
    currencyConversionRate: input.currencyConversionRate,
    email: input.contactEmail,
    fullName: input.fullName ?? input.displayName,
    password: input.password,
  });
}

export function acceptTeamInvitation(input: { token: string; password: string; fullName: string }) {
  return postPublic<AuthResponse>("/settings/team/accept/", input);
}

export function startDemo() {
  return postPublic<AuthResponse>("/auth/sandbox/");
}

export function switchDemoRole(role: UserRole) {
  return post<AuthResponse>("/auth/sandbox/switch-role/", { role: roleCode(role) });
}

export function logout() {
  return post<void>("/auth/logout/");
}

export function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  return post<PurchaseOrder>("/procurement/purchase-orders/", input);
}

export function approvePurchaseOrder(id: EntityId) {
  return post<PurchaseOrder>(`/procurement/purchase-orders/${id}/approve/`);
}

export function markPurchaseOrderInTransit(id: EntityId) {
  return post<PurchaseOrder>(`/procurement/purchase-orders/${id}/in-transit/`);
}

export function previewLandedCosts(input: PostGoodsReceiptInput) {
  return post<ErpSnapshot["purchaseOrders"] extends never ? never : import("@/types/erp").LandedCostPreview>(`/procurement/purchase-orders/${input.purchaseOrderId}/preview/`, input);
}

export function postGoodsReceipt(input: PostGoodsReceiptInput) {
  return post<GoodsReceipt>(`/procurement/purchase-orders/${input.purchaseOrderId}/receive/`, input);
}

export function createSalesOrder(input: CreateSalesOrderInput) {
  return post<SalesOrder>("/orders/", { ...input, channel: channelCode(input.channel) });
}

export function approveSalesOrder(id: EntityId) {
  return post<SalesOrder>(`/orders/${id}/approve/`);
}

export function moveOrderToPickPack(id: EntityId) {
  return post<SalesOrder>(`/orders/${id}/pick-pack/`);
}

export function shipOrder(id: EntityId) {
  return post<ErpSnapshot["invoices"][number]>(`/orders/${id}/ship/`);
}

export function reserveStock(input: ReserveStockInput) {
  return post<StockReservation>("/inventory/stock/reserve/", { ...input, channel: channelCode(input.channel) });
}

export function releaseReservation(id: EntityId) {
  return post<StockReservation>(`/inventory/reservations/${id}/release/`);
}

export function transferStock(input: TransferStockInput) {
  return post<StockTransfer>("/inventory/transfers/", input);
}

export function recordExpense(input: RecordExpenseInput) {
  return post<ExpenseRecord>("/finance/expenses/", { ...input, category: expenseCode(input.category), paymentMethod: accountPaymentCode(input.paymentMethod) });
}

export function recordCustomerPayment(input: RecordCustomerPaymentInput) {
  return post<CustomerPayment>("/customer-payments/", { ...input, paymentMethod: collectionPaymentCode(input.paymentMethod) });
}

export function updateCustomerPayment(id: EntityId, input: UpdateCustomerPaymentInput) {
  return put<CustomerPayment>(`/customer-payments/${id}/`, { ...input, paymentMethod: collectionPaymentCode(input.paymentMethod) });
}

export function updateCustomer(id: EntityId, input: UpdateCustomerInput) {
  return patch<Customer>(`/customers/${id}/`, input);
}

export function updateSalesOrderLineQuantity(orderId: EntityId, lineId: EntityId, quantity: number) {
  return patch<SalesOrder["lines"][number]>(`/orders/${orderId}/lines/${lineId}/quantity/`, { quantity });
}

export function recordVendorPayment(input: RecordVendorPaymentInput) {
  return post<VendorPayment>("/procurement/vendor-payments/", { ...input, paymentMethod: accountPaymentCode(input.paymentMethod) });
}

export function createSalesReturn(input: CreateSalesReturnInput) {
  return post<SalesReturn>("/returns/", { ...input, lines: input.lines.map((line) => ({ ...line, condition: line.condition === "Restockable" ? "RESTOCKABLE" : "DAMAGED_EXPIRED" })) });
}

export function createStockAudit(input: CreateStockAuditInput) {
  return post<StockAudit>("/inventory/adjustments/", { ...input, adjustmentType: "CYCLE_COUNT" });
}

export function updateFiscalSettings(input: FiscalSettingsInput) {
  return patch<Organization & { revaluationJournalId?: string | null }>("/settings/fiscal/", input);
}

export function createProduct(input: ProductMasterInput) {
  return post<Product>("/inventory/skus/", input);
}

export function updateProduct(id: EntityId, input: ProductMasterInput) {
  return patch<Product>(`/inventory/skus/${id}/`, input);
}

export function createWarehouse(input: WarehouseMasterInput) {
  return post<Warehouse>("/inventory/warehouses/", { ...input, type: input.type.toUpperCase(), status: input.status.toUpperCase() });
}

export function updateWarehouse(id: EntityId, input: WarehouseMasterInput) {
  return patch<Warehouse>(`/inventory/warehouses/${id}/`, { ...input, type: input.type.toUpperCase(), status: input.status.toUpperCase() });
}

export function checkoutPos(input: { customerId: EntityId; warehouseId: EntityId; exchangeRate: number; reference: string; lines: CreateSalesOrderInput["lines"]; payments: Array<{ method: "CASH" | "BANK" | "CHEQUE" | "MOBILE_BANKING"; amountMinor: number }> }) {
  return post<PosCheckoutResult>("/pos/", input);
}

export function getCustomerHistory(customerId: EntityId) {
  return get<OrderHistoryItem[]>(`/customers/${customerId}/history/`);
}

export function simulateFifo(layerId: EntityId, quantity: number) {
  return post<FifoSimulation>(`/inventory/layers/${layerId}/simulate/`, { quantity });
}

export function getProductByBarcode(code: string) {
  return get<Product>(`/inventory/skus/by-barcode/?code=${encodeURIComponent(code)}`);
}

export function searchErp(query: string) {
  return get<{ results: SearchResult[] }>(`/search/?q=${encodeURIComponent(query)}`);
}

export function getApprovals() {
  return fetchAll<ApprovalRequest>("/approvals/");
}

export function reviewApproval(id: EntityId, decision: "approve" | "reject", reason?: string) {
  return post<ApprovalRequest>(`/approvals/${id}/${decision}/`, decision === "reject" ? { reason } : {});
}

export function getNotifications() {
  return fetchAll<NotificationItem>("/notifications/");
}

export function markNotificationRead(id: EntityId) {
  return post<NotificationItem>(`/notifications/${id}/read/`);
}

export function markAllNotificationsRead() {
  return post<{ updated: number }>("/notifications/read-all/");
}

export function getTeamSettings() {
  return get<{ members: SessionUser[]; invitations: Array<{ id: string; email: string; role: string; status: string; expiresAt: string; acceptedAt: string | null; invitedBy: string; invitedAt: string }> }>("/settings/team/");
}

export function inviteTeamMember(email: string, role: UserRole) {
  return post<{ id: string; email: string; role: string; status: string; expiresAt: string }>("/settings/team/", { email, role: roleCode(role) });
}

export function updateTeamRole(userId: EntityId, role: UserRole) {
  return patch<SessionUser>(`/settings/team/members/${userId}/role/`, { role: roleCode(role) });
}

export function revokeTeamInvitation(id: EntityId) {
  return post(`/settings/team/${id}/revoke/`);
}

export function createCustomer(input: { code: string; name: string; contactName: string; email?: string; currency: Customer["currency"]; paymentTermsDays: number; taxRateBasisPoints: number; creditLimitBaseMinor: number; billingAddress: Customer["billingAddress"] }) {
  return post<Customer>("/customers/", input);
}

export function createVendor(input: { code: string; name: string; contactName: string; email?: string; currency: ErpSnapshot["suppliers"][number]["currency"]; paymentTermsDays: number; countryCode: string; status: "ACTIVE" | "ON_HOLD" }) {
  return post<ErpSnapshot["suppliers"][number]>("/vendors/", input);
}

export function updateVendor(id: EntityId, input: { code: string; name: string; contactName: string; email?: string; currency: ErpSnapshot["suppliers"][number]["currency"]; paymentTermsDays: number; countryCode: string; status: "ACTIVE" | "ON_HOLD" }) {
  return patch<ErpSnapshot["suppliers"][number]>(`/vendors/${id}/`, input);
}

export function getExpenses(range: DateRangeFilter, paymentMethod = "All") {
  const paymentQuery = paymentMethod === "All" ? "" : `&paymentMethod=${accountPaymentCode(paymentMethod)}`;
  return fetchAll<ExpenseRecord>(`/finance/expenses/?startDate=${range.startDate}&endDate=${range.endDate}${paymentQuery}`);
}

export function bookDemo(input: { fullName: string; workEmail: string; companyName: string; phone: string; industry: string; warehouseCount: number; monthlyShipments: number; skuCount: number; message: string; consent: boolean }) {
  return postPublic<{ id: string; status: string; createdAt: string }>("/public/book-demo/", input);
}

export function channelCode(channel: string) {
  return ({ "B2B Wholesale": "B2B", "Shopify Sync": "SHOPIFY", "Direct Import": "DIRECT", "Point of Sale": "POS", Manual: "MANUAL" } as Record<string, string>)[channel] ?? channel;
}

export function expenseCode(category: ExpenseCategory) {
  return ({ "Warehouse Rent": "WAREHOUSE_RENT", "Delivery Fuel": "DELIVERY_FUEL", "Freight/Port Misc": "FREIGHT_PORT_MISC", "Staff Payroll": "STAFF_PAYROLL", Utilities: "UTILITIES", "Inventory Shrinkage": "INVENTORY_SHRINKAGE" } as Record<ExpenseCategory, string>)[category];
}

export function accountPaymentCode(method: string) {
  return method === "Bank" || method === "Bank Transfer" ? "BANK" : method === "Mobile Banking" ? "MOBILE_BANKING" : "CASH";
}

export function collectionPaymentCode(method: string) {
  return method === "Bank Transfer" || method === "Bank" ? "BANK" : method === "Cheque" ? "CHEQUE" : method === "Mobile Banking" ? "MOBILE_BANKING" : "CASH";
}

export function roleCode(role: string) {
  return ({ "Super Admin": "SUPER_ADMIN", Accountant: "ACCOUNTANT", "Warehouse Manager": "WAREHOUSE_MANAGER", "Sales Officer": "SALES_OFFICER" } as Record<string, string>)[role] ?? role;
}
