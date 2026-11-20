import type { AccountBalance, ActivityEvent, ErpData, ErpMetrics, JournalEntry } from "@/types/erp";
import type { SessionUser } from "@/store/useSessionStore";

export interface Paginated<T> {
  count?: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface DashboardSummary {
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
  inventoryVarianceMinor: number | null;
  warehouseData: Array<{
    id: string;
    code: string;
    name: string;
    usedCbm: number;
    capacityCbm: number;
    utilization: number;
    valueMinor: number | null;
    units: number;
  }>;
  agingData: Record<"0-30" | "31-60" | "61-90" | "90+", number | null>;
  ledgerFeed: JournalEntry[];
}

export interface CollectionSummary {
  collectedTodayMinor: number;
  collectedThisMonthMinor: number;
  collectedRangeMinor: number;
  salesRangeMinor: number;
  totalMarketDebtMinor: number;
  aging: Record<"0-30" | "31-60" | "61+", number>;
  rangeStart: string;
  rangeEnd: string;
}

export interface FinancialReports {
  trialBalance: {
    endDate: string;
    rows: AccountBalance[];
    totalDebitMinor: number;
    totalCreditMinor: number;
    balanced: boolean;
  };
  profitLoss: {
    startDate: string;
    endDate: string;
    revenueMinor: number;
    cogsMinor: number;
    grossProfitMinor: number;
    operatingExpensesMinor: number;
    shrinkageMinor: number;
    totalExpensesMinor: number;
    netProfitMinor: number;
  };
  balanceSheet: {
    endDate: string;
    assetsMinor: number;
    liabilitiesMinor: number;
    ledgerEquityMinor: number;
    currentEarningsMinor: number;
    equityMinor: number;
    liabilitiesAndEquityMinor: number;
    varianceMinor: number;
    balanced: boolean;
  };
  periodEntries: number;
}

export interface ApprovalRequest {
  id: string;
  entityType: "Purchase Order" | "Sales Order";
  entityId: string;
  entityNumber: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  reason: string;
  requestedBy: string;
  requestedByRole: string;
  reviewedBy: string | null;
  createdAt: string;
  reviewedAt: string | null;
  amountBaseMinor: number;
}

export interface NotificationItem {
  id: string;
  kind: "LOW_STOCK" | "OVERDUE_DEBT" | "PENDING_APPROVAL" | "SYSTEM";
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface SearchResult {
  id: string;
  type: "SKU" | "Purchase Order" | "Invoice" | "Journal Entry";
  title: string;
  subtitle: string;
  href: string;
  module: string;
  score: number;
}

export interface AuthResponse {
  user: SessionUser;
  organization: SessionUser["organization"];
  sandbox?: { id: string; expiresAt: string };
}

export interface ErpSnapshot extends ErpData {
  dashboard: DashboardSummary | null;
  collectionSummary: CollectionSummary | null;
  financialReports: FinancialReports | null;
  approvals: ApprovalRequest[];
  notifications: NotificationItem[];
}

export interface PosCheckoutResult {
  order: ErpData["orders"][number];
  invoice: ErpData["invoices"][number] | null;
  payments: ErpData["customerPayments"];
  customerDueMinor: number;
}

export interface FifoSimulation {
  quantity: number;
  totalCostMinor: number;
  wacComparisonMinor: number;
  layers: Array<{
    layerId: string;
    batchCode: string;
    quantity: number;
    unitCostMinor: number;
    valueMinor: number;
    remainingQuantity: number;
  }>;
}

export type OrderHistoryItem = ErpData["orders"][number]["lines"][number] & {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  status: ErpData["orders"][number]["status"];
  sku: string;
  productName: string;
};

export interface DashboardMetrics extends ErpMetrics {
  dashboard: DashboardSummary | null;
}

export interface ActivityFeed extends ActivityEvent {
  sourceType?: string;
}
