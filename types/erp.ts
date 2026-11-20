export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CNY", "AED", "INR"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];
export type ISODateString = string;
export type EntityId = string;

export interface Organization {
  id: EntityId;
  legalName: string;
  displayName: string;
  taxId: string;
  baseCurrency: CurrencyCode;
  timezone: string;
  invoiceFooterNote: string;
  email: string;
  phone: string;
  address: Address;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
}

export interface Warehouse {
  id: EntityId;
  code: string;
  name: string;
  type: "Bonded" | "Distribution" | "Fulfillment";
  address: Address;
  capacityCbm: number;
  temperatureControlled: boolean;
  status: "Active" | "Inactive";
}

export interface Supplier {
  id: EntityId;
  code: string;
  name: string;
  contactName: string;
  email: string;
  currency: CurrencyCode;
  paymentTermsDays: number;
  countryCode: string;
  status: "Active" | "On Hold";
}

export interface Customer {
  id: EntityId;
  code: string;
  name: string;
  contactName: string;
  email: string;
  currency: CurrencyCode;
  paymentTermsDays: number;
  billingAddress: Address;
  taxRateBasisPoints: number;
  creditLimitBaseMinor: number;
}

export interface Product {
  id: EntityId;
  sku: string;
  name: string;
  category: string;
  description: string;
  unitOfMeasure: string;
  weightKgPerUnit: number;
  volumeCbmPerUnit: number;
  salesPriceMinor: number;
  salesCurrency: CurrencyCode;
  barcode?: string;
  vatRateBasisPoints?: number;
  reorderPoint: number;
  preferredSupplierId: EntityId;
  active: boolean;
}

export type PurchaseOrderStatus = "Draft" | "Pending Approval" | "Approved" | "In Transit" | "Received" | "Cancelled";
export type ApprovalStatus = "Not Required" | "Pending" | "Approved" | "Rejected";

export interface PurchaseOrderLine {
  id: EntityId;
  productId: EntityId;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCostMinor: number;
}

export interface PurchaseOrder {
  id: EntityId;
  number: string;
  supplierId: EntityId;
  destinationWarehouseId: EntityId;
  status: PurchaseOrderStatus;
  approvalStatus?: ApprovalStatus;
  approvalReason?: string;
  approvedByRole?: UserRole;
  currency: CurrencyCode;
  fxRateToBase: number;
  reference: string;
  createdAt: ISODateString;
  approvedAt?: ISODateString;
  expectedAt: ISODateString;
  lines: PurchaseOrderLine[];
}

export type LandedCostAllocationMethod = "weight" | "volume" | "value";

export interface LandedCostAmounts {
  freightMinor: number;
  customsMinor: number;
  portHandlingMinor: number;
  insuranceMinor: number;
}

export interface PostedLandedCosts extends LandedCostAmounts {
  currency: CurrencyCode;
  fxRateToBase: number;
  base: LandedCostAmounts;
}

export interface GoodsReceiptLine {
  id: EntityId;
  purchaseOrderLineId: EntityId;
  productId: EntityId;
  quantity: number;
  sourceUnitCostMinor: number;
  baseUnitCostMinor: number;
  baseGoodsCostMinor: number;
  basisQuantity: number;
  basisShare: number;
  allocatedFreightMinor: number;
  allocatedCustomsMinor: number;
  allocatedPortHandlingMinor: number;
  allocatedInsuranceMinor: number;
  allocatedLandedCostMinor: number;
  trueUnitCostMinor: number;
  trueTotalCostMinor: number;
  costLayerId: EntityId;
}

export interface GoodsReceipt {
  id: EntityId;
  number: string;
  purchaseOrderId: EntityId;
  purchaseOrderNumber: string;
  warehouseId: EntityId;
  receivedAt: ISODateString;
  allocationMethod: LandedCostAllocationMethod;
  landedCosts: PostedLandedCosts;
  lines: GoodsReceiptLine[];
  totalGoodsBaseMinor: number;
  totalLandedCostBaseMinor: number;
  totalInventoryBaseMinor: number;
  journalEntryId: EntityId;
}

export interface CostLayer {
  id: EntityId;
  productId: EntityId;
  warehouseId: EntityId;
  purchaseOrderId?: EntityId;
  goodsReceiptId?: EntityId;
  batchCode: string;
  receivedAt: ISODateString;
  expiresAt?: ISODateString;
  initialQuantity: number;
  remainingQuantity: number;
  sourceUnitCostMinor: number;
  sourceCurrency: CurrencyCode;
  unitCostMinor: number;
  allocatedLandedUnitCostMinor: number;
  remainingValueMinor: number;
}

export interface InventoryPosition {
  id: EntityId;
  productId: EntityId;
  warehouseId: EntityId;
  onHand: number;
  reserved: number;
  inTransit: number;
  reorderPoint: number;
  updatedAt: ISODateString;
}

export type ReservationChannel = "B2B Wholesale" | "Shopify Sync" | "Direct Import" | "Point of Sale" | "Manual";

export interface StockReservation {
  id: EntityId;
  reference: string;
  productId: EntityId;
  warehouseId: EntityId;
  channel: ReservationChannel;
  quantity: number;
  status: "Active" | "Consumed" | "Released";
  createdAt: ISODateString;
  expiresAt: ISODateString;
  resolvedAt?: ISODateString;
}

export interface StockTransferLine {
  productId: EntityId;
  quantity: number;
  costLayerIds: EntityId[];
  valueMinor: number;
}

export interface StockTransfer {
  id: EntityId;
  number: string;
  sourceWarehouseId: EntityId;
  destinationWarehouseId: EntityId;
  status: "Completed";
  createdAt: ISODateString;
  lines: StockTransferLine[];
}

export type OrderChannel = Exclude<ReservationChannel, "Manual">;
export type OrderStatus = "Pending Approval" | "Order Placed" | "Pick & Pack" | "Shipped" | "Invoiced" | "Cancelled";

export interface SalesOrderLine {
  id: EntityId;
  productId: EntityId;
  quantity: number;
  shippedQuantity: number;
  unitPriceMinor: number;
  reservationId?: EntityId;
  cogsBaseMinor?: number;
  returnedQuantity?: number;
}

export interface SalesOrder {
  id: EntityId;
  number: string;
  customerId: EntityId;
  warehouseId: EntityId;
  channel: OrderChannel;
  status: OrderStatus;
  approvalStatus?: ApprovalStatus;
  approvalReason?: string;
  approvedByRole?: UserRole;
  approvedAt?: ISODateString;
  currency: CurrencyCode;
  fxRateToBase: number;
  reference: string;
  createdAt: ISODateString;
  shippedAt?: ISODateString;
  invoiceId?: EntityId;
  lines: SalesOrderLine[];
}

export interface InvoiceLine {
  productId: EntityId;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface Invoice {
  id: EntityId;
  number: string;
  orderId: EntityId;
  orderNumber: string;
  customerId: EntityId;
  status: "Draft" | "Issued" | "Paid" | "Void";
  currency: CurrencyCode;
  fxRateToBase: number;
  issuedAt: ISODateString;
  dueAt: ISODateString;
  billingAddress: Address;
  lines: InvoiceLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  subtotalBaseMinor: number;
  taxBaseMinor: number;
  totalBaseMinor: number;
  cogsBaseMinor: number;
  journalEntryIds: EntityId[];
}

export type AccountGroup = "Assets" | "Liabilities" | "Equity" | "Revenue" | "COGS" | "Expenses";
export type NormalBalance = "Debit" | "Credit";

export interface Account {
  id: EntityId;
  code: string;
  name: string;
  group: AccountGroup;
  parentId?: EntityId;
  normalBalance: NormalBalance;
  active: boolean;
}

export interface JournalSource {
  type: "Opening Balance" | "Purchase Order" | "Goods Receipt" | "Sales Order" | "Invoice" | "Stock Transfer" | "Expense" | "Customer Payment" | "Vendor Payment" | "Credit Note" | "Stock Audit" | "Sales Return" | "POS Sale" | "Fiscal Revaluation";
  id: EntityId;
  number: string;
  href: string;
}

export interface JournalLine {
  id: EntityId;
  accountId: EntityId;
  description: string;
  debitMinor: number;
  creditMinor: number;
}

export interface JournalEntry {
  id: EntityId;
  number: string;
  timestamp: ISODateString;
  description: string;
  source: JournalSource;
  status: "Posted" | "Reversed";
  currency: CurrencyCode;
  lines: JournalLine[];
  totalDebitMinor: number;
  totalCreditMinor: number;
}

export interface ActivityEvent {
  id: EntityId;
  timestamp: ISODateString;
  type: "Procurement" | "Inventory" | "Sales" | "Finance" | "System";
  title: string;
  description: string;
  reference: string;
  href: string;
  journalEntryIds: EntityId[];
}

export type UserRole = "Super Admin" | "Accountant" | "Warehouse Manager" | "Sales Officer";
export type ExpenseCategory = "Warehouse Rent" | "Delivery Fuel" | "Freight/Port Misc" | "Staff Payroll" | "Utilities" | "Inventory Shrinkage";
export type PaymentMethod = "Cash" | "Bank" | "Mobile Banking";

export interface ExpenseRecord {
  id: EntityId;
  number: string;
  category: ExpenseCategory;
  payee: string;
  reference: string;
  notes: string;
  warehouseId?: EntityId;
  paymentMethod: PaymentMethod;
  paymentAccountId: EntityId;
  expenseAccountId: EntityId;
  amountMinor: number;
  currency: CurrencyCode;
  fxRateToBase: number;
  amountBaseMinor: number;
  expenseDate: ISODateString;
  createdAt: ISODateString;
  createdByRole: UserRole;
  journalEntryId: EntityId;
}

export interface AuditLogEntry {
  id: EntityId;
  timestamp: ISODateString;
  userId: string;
  userName: string;
  role: UserRole | "System";
  action: string;
  entityType: string;
  entityId: EntityId;
  oldValue: string;
  newValue: string;
}

export interface ErpSequences {
  purchaseOrder: number;
  goodsReceipt: number;
  salesOrder: number;
  invoice: number;
  journal: number;
  transfer: number;
  reservation: number;
  activity: number;
  expense: number;
  customerPayment: number;
  vendorPayment: number;
  salesReturn: number;
  creditNote: number;
  stockAudit: number;
  entity: number;
}

export interface ErpData {
  schemaVersion: number;
  activeRole: UserRole;
  organization: Organization;
  warehouses: Warehouse[];
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  costLayers: CostLayer[];
  inventory: InventoryPosition[];
  reservations: StockReservation[];
  transfers: StockTransfer[];
  orders: SalesOrder[];
  invoices: Invoice[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  expenses: ExpenseRecord[];
  customerPayments: CustomerPayment[];
  vendorPayments: VendorPayment[];
  salesReturns: SalesReturn[];
  creditNotes: CreditNote[];
  stockAudits: StockAudit[];
  auditLog: AuditLogEntry[];
  activity: ActivityEvent[];
  sequences: ErpSequences;
}

export interface CreatePurchaseOrderInput {
  supplierId: EntityId;
  destinationWarehouseId: EntityId;
  currency: CurrencyCode;
  fxRateToBase: number;
  expectedAt: ISODateString;
  reference: string;
  lines: Array<{
    productId: EntityId;
    orderedQuantity: number;
    unitCostMinor: number;
  }>;
}

export interface GoodsReceiptLineInput {
  purchaseOrderLineId: EntityId;
  quantity: number;
}

export interface PostGoodsReceiptInput {
  purchaseOrderId: EntityId;
  warehouseId: EntityId;
  allocationMethod: LandedCostAllocationMethod;
  costs: LandedCostAmounts & {
    currency: CurrencyCode;
    fxRateToBase: number;
  };
  lines: GoodsReceiptLineInput[];
  receivedAt?: ISODateString;
}

export interface LandedCostPreviewLine extends Omit<GoodsReceiptLine, "id" | "costLayerId"> {
  sku: string;
  productName: string;
}

export interface LandedCostPreview {
  purchaseOrderId: EntityId;
  warehouseId: EntityId;
  allocationMethod: LandedCostAllocationMethod;
  costs: PostedLandedCosts;
  lines: LandedCostPreviewLine[];
  totalGoodsBaseMinor: number;
  totalAllocatedCostMinor: number;
  totalInventoryBaseMinor: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
}

export interface CreateSalesOrderInput {
  customerId: EntityId;
  warehouseId: EntityId;
  channel: OrderChannel;
  currency: CurrencyCode;
  fxRateToBase: number;
  reference: string;
  lines: Array<{
    productId: EntityId;
    quantity: number;
    unitPriceMinor: number;
  }>;
}

export interface ReserveStockInput {
  productId: EntityId;
  warehouseId: EntityId;
  channel: ReservationChannel;
  reference: string;
  quantity: number;
  expiresAt?: ISODateString;
}

export interface TransferStockInput {
  sourceWarehouseId: EntityId;
  destinationWarehouseId: EntityId;
  lines: Array<{
    productId: EntityId;
    quantity: number;
  }>;
  createdAt?: ISODateString;
}

export interface FifoLayerConsumption {
  layerId: EntityId;
  batchCode: string;
  quantity: number;
  unitCostMinor: number;
  valueMinor: number;
  remainingQuantity: number;
}

export interface FifoConsumption {
  productId: EntityId;
  warehouseId: EntityId;
  requestedQuantity: number;
  consumedQuantity: number;
  totalCostMinor: number;
  layers: FifoLayerConsumption[];
  updatedLayers: CostLayer[];
}

export interface AccountBalance {
  account: Account;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}

export interface ErpMetrics {
  inventoryValuationMinor: number | null;
  pendingLandedCostMinor: number | null;
  onHandUnits: number;
  reservedUnits: number;
  availableUnits: number;
  reservedRatio: number;
  realizedRevenueMinor: number | null;
  realizedCogsMinor: number | null;
  grossMarginPercent: number | null;
  unreconciledAccounts: number | null;
}


export interface RecordExpenseInput {
  category: ExpenseCategory;
  payee: string;
  reference: string;
  notes: string;
  warehouseId?: EntityId;
  paymentMethod: PaymentMethod;
  amountMinor: number;
  currency: CurrencyCode;
  fxRateToBase: number;
  expenseDate: ISODateString;
}

export interface DateRangeFilter {
  startDate: string;
  endDate: string;
}


export type CollectionPaymentMethod = "Cash" | "Bank Transfer" | "Cheque" | "Mobile Banking";
export type PaymentStatus = "Posted" | "Replaced";

export interface PaymentAllocation {
  invoiceId: EntityId;
  amountBaseMinor: number;
}

export interface CustomerPayment {
  id: EntityId;
  number: string;
  customerId: EntityId;
  paymentMethod: CollectionPaymentMethod;
  paymentAccountId: EntityId;
  amountMinor: number;
  currency: CurrencyCode;
  fxRateToBase: number;
  amountBaseMinor: number;
  receivedAt: ISODateString;
  reference: string;
  notes: string;
  allocations: PaymentAllocation[];
  status: PaymentStatus;
  journalEntryId: EntityId;
  reversalJournalEntryId?: EntityId;
  replacedByPaymentId?: EntityId;
  reversalOfPaymentId?: EntityId;
  createdByRole: UserRole;
}

export interface RecordCustomerPaymentInput {
  customerId: EntityId;
  invoiceId?: EntityId;
  paymentMethod: CollectionPaymentMethod;
  amountMinor: number;
  currency: CurrencyCode;
  fxRateToBase: number;
  receivedAt?: ISODateString;
  reference: string;
  notes: string;
}

export interface UpdateCustomerPaymentInput {
  paymentMethod: CollectionPaymentMethod;
  amountMinor: number;
  currency: CurrencyCode;
  fxRateToBase: number;
  receivedAt: ISODateString;
  reference: string;
  notes: string;
}

export interface UpdateCustomerInput {
  name: string;
  contactName: string;
  email: string;
  paymentTermsDays: number;
  taxRateBasisPoints: number;
  creditLimitBaseMinor: number;
  currency: CurrencyCode;
  billingAddress: Address;
}

export interface VendorPayment {
  id: EntityId;
  number: string;
  supplierId: EntityId;
  purchaseOrderId?: EntityId;
  paymentMethod: PaymentMethod;
  paymentAccountId: EntityId;
  amountMinor: number;
  currency: CurrencyCode;
  fxRateToBase: number;
  amountBaseMinor: number;
  paidAt: ISODateString;
  reference: string;
  notes: string;
  journalEntryId: EntityId;
  createdByRole: UserRole;
}

export interface RecordVendorPaymentInput {
  supplierId: EntityId;
  purchaseOrderId?: EntityId;
  paymentMethod: PaymentMethod;
  amountMinor: number;
  currency: CurrencyCode;
  fxRateToBase: number;
  paidAt?: ISODateString;
  reference: string;
  notes: string;
}

export type ReturnCondition = "Restockable" | "Damaged/Expired";

export interface SalesReturnLine {
  orderLineId: EntityId;
  productId: EntityId;
  quantity: number;
  condition: ReturnCondition;
  unitPriceMinor: number;
  unitCostBaseMinor: number;
  restoredLayerId?: EntityId;
}

export interface SalesReturn {
  id: EntityId;
  number: string;
  orderId: EntityId;
  orderNumber: string;
  customerId: EntityId;
  warehouseId: EntityId;
  reason: string;
  status: "Completed";
  createdAt: ISODateString;
  createdByRole: UserRole;
  lines: SalesReturnLine[];
  creditNoteId: EntityId;
  restoredValueBaseMinor: number;
  shrinkageBaseMinor: number;
  journalEntryIds: EntityId[];
}

export interface CreditNote {
  id: EntityId;
  number: string;
  customerId: EntityId;
  invoiceId?: EntityId;
  returnId: EntityId;
  amountBaseMinor: number;
  currency: CurrencyCode;
  issuedAt: ISODateString;
  status: "Issued";
  journalEntryId: EntityId;
}

export interface CreateSalesReturnInput {
  orderId: EntityId;
  reason: string;
  lines: Array<{
    orderLineId: EntityId;
    quantity: number;
    condition: ReturnCondition;
  }>;
}

export interface StockAudit {
  id: EntityId;
  number: string;
  warehouseId: EntityId;
  productId: EntityId;
  systemQuantity: number;
  countedQuantity: number;
  deltaQuantity: number;
  valueDeltaBaseMinor: number;
  reason: string;
  createdAt: ISODateString;
  createdByRole: UserRole;
  journalEntryId: EntityId;
}

export interface CreateStockAuditInput {
  warehouseId: EntityId;
  productId: EntityId;
  countedQuantity: number;
  reason: string;
}

export interface FiscalSettingsInput {
  legalName: string;
  displayName: string;
  taxId: string;
  baseCurrency: CurrencyCode;
  timezone: string;
  invoiceFooterNote: string;
  currencyConversionRate: number;
}

export interface RegisterOrganizationInput extends FiscalSettingsInput {
  contactEmail: string;
}

export interface ProductMasterInput {
  sku: string;
  name: string;
  category: string;
  description: string;
  unitOfMeasure: string;
  barcode: string;
  vatRateBasisPoints: number;
  reorderPoint: number;
  weightKgPerUnit: number;
  volumeCbmPerUnit: number;
  costPriceMinor?: number;
  salesPriceMinor: number;
  salesCurrency: CurrencyCode;
  preferredSupplierId: EntityId;
}

export interface WarehouseMasterInput {
  code: string;
  name: string;
  type: Warehouse["type"];
  address: Address;
  capacityCbm: number;
  temperatureControlled: boolean;
  status: Warehouse["status"];
}


export interface Organization {
  isSandbox?: boolean;
  expiresAt?: ISODateString;
}

export interface Product {
  costPriceMinor?: number | null;
}

export interface Customer {
  totalPurchasedMinor?: number;
  totalPaidMinor?: number;
  remainingDebtMinor?: number;
  lastPaymentDate?: ISODateString | null;
}

export interface Supplier {
  payableBalanceMinor?: number;
  totalPurchasedMinor?: number;
  totalPaidMinor?: number;
  lastPaymentDate?: ISODateString | null;
  shipmentReferences?: string[];
}

export interface Account {
  balanceMinor?: number;
}
