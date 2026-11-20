import { create } from "zustand";

import {
  approvePurchaseOrder as approvePurchaseOrderRequest,
  approveSalesOrder as approveSalesOrderRequest,
  checkoutPos,
  createCustomer as createCustomerRequest,
  createProduct as createProductRequest,
  createPurchaseOrder as createPurchaseOrderRequest,
  createSalesOrder as createSalesOrderRequest,
  createSalesReturn as createSalesReturnRequest,
  createStockAudit as createStockAuditRequest,
  createVendor as createVendorRequest,
  createWarehouse as createWarehouseRequest,
  emptyErpSnapshot,
  financialResourceKeys,
  loadErpSnapshot,
  markPurchaseOrderInTransit as markPurchaseOrderInTransitRequest,
  moveOrderToPickPack as moveOrderToPickPackRequest,
  postGoodsReceipt as postGoodsReceiptRequest,
  previewLandedCosts as previewLandedCostsRequest,
  recordCustomerPayment as recordCustomerPaymentRequest,
  recordExpense as recordExpenseRequest,
  recordVendorPayment as recordVendorPaymentRequest,
  refreshErpData,
  registerOrganization as registerOrganizationRequest,
  releaseReservation as releaseReservationRequest,
  reserveStock as reserveStockRequest,
  shipOrder as shipOrderRequest,
  startDemo,
  switchDemoRole,
  transferStock as transferStockRequest,
  updateCustomer as updateCustomerRequest,
  updateCustomerPayment as updateCustomerPaymentRequest,
  updateFiscalSettings as updateFiscalSettingsRequest,
  updateProduct as updateProductRequest,
  updateSalesOrderLineQuantity as updateSalesOrderLineQuantityRequest,
  updateWarehouse as updateWarehouseRequest,
  journalActivity,
  type ErpResourceKey,
} from "@/lib/erp-api";
import { useSessionStore } from "@/store/useSessionStore";
import type { ErpSnapshot } from "@/types/api";
import type {
  AccountBalance,
  CreatePurchaseOrderInput,
  CreateSalesOrderInput,
  CreateSalesReturnInput,
  CreateStockAuditInput,
  Customer,
  CustomerPayment,
  EntityId,
  ErpMetrics,
  ExpenseRecord,
  FifoConsumption,
  FifoLayerConsumption,
  FiscalSettingsInput,
  LandedCostAmounts,
  LandedCostPreview,
  PostGoodsReceiptInput,
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
  WarehouseMasterInput,
} from "@/types/erp";

export interface ShipOrderResult {
  invoiceId: EntityId;
  cogsJournalEntryId: EntityId;
  revenueJournalEntryId: EntityId;
  cogsBaseMinor: number;
}

export interface PostGoodsReceiptResult {
  goodsReceiptId: EntityId;
  journalEntryId: EntityId;
  inventoryValueBaseMinor: number;
}

export interface ErpState extends ErpSnapshot {
  ready: boolean;
  loadError: string | null;
  refresh: (keys?: ErpResourceKey[]) => Promise<void>;
  createPurchaseOrder: (input: CreatePurchaseOrderInput) => Promise<PurchaseOrder>;
  approvePurchaseOrder: (purchaseOrderId: EntityId) => Promise<void>;
  markPurchaseOrderInTransit: (purchaseOrderId: EntityId) => Promise<void>;
  previewLandedCosts: (input: PostGoodsReceiptInput) => Promise<LandedCostPreview>;
  postGoodsReceipt: (input: PostGoodsReceiptInput) => Promise<PostGoodsReceiptResult>;
  createSalesOrder: (input: CreateSalesOrderInput) => Promise<SalesOrder>;
  approveSalesOrder: (orderId: EntityId) => Promise<void>;
  moveOrderToPickPack: (orderId: EntityId) => Promise<void>;
  shipOrder: (orderId: EntityId) => Promise<ShipOrderResult>;
  reserveStock: (input: ReserveStockInput) => Promise<StockReservation>;
  releaseReservation: (reservationId: EntityId) => Promise<void>;
  transferStock: (input: TransferStockInput) => Promise<StockTransfer>;
  recordExpense: (input: RecordExpenseInput) => Promise<ExpenseRecord>;
  recordCustomerPayment: (input: RecordCustomerPaymentInput) => Promise<CustomerPayment>;
  updateCustomerPayment: (paymentId: EntityId, input: UpdateCustomerPaymentInput) => Promise<CustomerPayment>;
  updateCustomer: (customerId: EntityId, input: UpdateCustomerInput) => Promise<void>;
  createCustomer: (input: Parameters<typeof createCustomerRequest>[0]) => Promise<Customer>;
  createVendor: (input: Parameters<typeof createVendorRequest>[0]) => Promise<ErpSnapshot["suppliers"][number]>;
  updateSalesOrderLineQuantity: (orderId: EntityId, lineId: EntityId, quantity: number) => Promise<void>;
  recordVendorPayment: (input: RecordVendorPaymentInput) => Promise<VendorPayment>;
  createSalesReturn: (input: CreateSalesReturnInput) => Promise<SalesReturn>;
  createStockAudit: (input: CreateStockAuditInput) => Promise<StockAudit>;
  updateFiscalSettings: (input: FiscalSettingsInput) => Promise<void>;
  registerOrganization: (input: RegisterOrganizationInput & { password: string; fullName?: string }) => Promise<void>;
  createProduct: (input: ProductMasterInput) => Promise<void>;
  updateProduct: (productId: EntityId, input: ProductMasterInput) => Promise<void>;
  createWarehouse: (input: WarehouseMasterInput) => Promise<void>;
  updateWarehouse: (warehouseId: EntityId, input: WarehouseMasterInput) => Promise<void>;
  checkoutPos: (input: Parameters<typeof checkoutPos>[0]) => Promise<Awaited<ReturnType<typeof checkoutPos>>>;
  setActiveRole: (role: UserRole) => Promise<void>;
  resetDemo: () => Promise<void>;
}

export function sumLandedCosts(costs: LandedCostAmounts) {
  return costs.freightMinor + costs.customsMinor + costs.portHandlingMinor + costs.insuranceMinor;
}

export function consumeFifoLayers(layers: ErpSnapshot["costLayers"], productId: EntityId, warehouseId: EntityId, quantity: number): FifoConsumption {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("FIFO consumption quantity must be a positive whole number.");
  const updatedLayers = layers.map((layer) => ({ ...layer }));
  const eligible = updatedLayers.filter((layer) => layer.productId === productId && layer.warehouseId === warehouseId && layer.remainingQuantity > 0).sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.id.localeCompare(right.id));
  if (eligible.reduce((sum, layer) => sum + layer.remainingQuantity, 0) < quantity) throw new Error("Insufficient FIFO stock for this sale.");
  let remaining = quantity;
  const consumed: FifoLayerConsumption[] = [];
  for (const layer of eligible) {
    if (remaining === 0) break;
    const consumedQuantity = Math.min(layer.remainingQuantity, remaining);
    const valueMinor = consumedQuantity === layer.remainingQuantity ? layer.remainingValueMinor : Math.min(layer.remainingValueMinor, Math.round(layer.unitCostMinor * consumedQuantity));
    layer.remainingQuantity -= consumedQuantity;
    layer.remainingValueMinor -= valueMinor;
    remaining -= consumedQuantity;
    consumed.push({ layerId: layer.id, batchCode: layer.batchCode, quantity: consumedQuantity, unitCostMinor: layer.unitCostMinor, valueMinor, remainingQuantity: layer.remainingQuantity });
  }
  return { productId, warehouseId, requestedQuantity: quantity, consumedQuantity: quantity, totalCostMinor: consumed.reduce((sum, layer) => sum + layer.valueMinor, 0), layers: consumed, updatedLayers };
}

export function selectTrialBalance(data: ErpSnapshot): AccountBalance[] {
  if (data.financialReports) return data.financialReports.trialBalance.rows;
  return data.accounts.map((account) => {
    const lines = data.journalEntries.filter((entry) => entry.status === "Posted").flatMap((entry) => entry.lines);
    return {
      account,
      debitMinor: lines.filter((line) => line.accountId === account.id).reduce((sum, line) => sum + line.debitMinor, 0),
      creditMinor: lines.filter((line) => line.accountId === account.id).reduce((sum, line) => sum + line.creditMinor, 0),
      balanceMinor: account.normalBalance === "Debit" ? lines.filter((line) => line.accountId === account.id).reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0) : lines.filter((line) => line.accountId === account.id).reduce((sum, line) => sum + line.creditMinor - line.debitMinor, 0),
    };
  });
}

export function selectInventoryValuation(data: ErpSnapshot) {
  return data.dashboard?.inventoryValuationMinor ?? data.costLayers.reduce((sum, layer) => sum + layer.remainingValueMinor, 0);
}

export function selectAvailableToPromise(data: ErpSnapshot, productId: EntityId, warehouseId: EntityId) {
  const position = data.inventory.find((item) => item.productId === productId && item.warehouseId === warehouseId);
  return Math.max(0, (position?.onHand ?? 0) - (position?.reserved ?? 0));
}

export function selectErpMetrics(data: ErpSnapshot): ErpMetrics {
  const onHandUnits = data.dashboard?.onHandUnits ?? data.inventory.reduce((sum, item) => sum + item.onHand, 0);
  const reservedUnits = data.dashboard?.reservedUnits ?? data.inventory.reduce((sum, item) => sum + item.reserved, 0);
  return {
    inventoryValuationMinor: data.dashboard?.inventoryValuationMinor ?? selectInventoryValuation(data),
    pendingLandedCostMinor: data.dashboard?.pendingLandedCostMinor ?? 0,
    onHandUnits,
    reservedUnits,
    availableUnits: data.dashboard?.availableUnits ?? onHandUnits - reservedUnits,
    reservedRatio: data.dashboard?.reservedRatio ?? (onHandUnits === 0 ? 0 : reservedUnits / onHandUnits),
    realizedRevenueMinor: data.dashboard?.realizedRevenueMinor ?? null,
    realizedCogsMinor: data.dashboard?.realizedCogsMinor ?? null,
    grossMarginPercent: data.dashboard?.grossMarginPercent ?? null,
    unreconciledAccounts: data.dashboard?.unreconciledAccounts ?? null,
  };
}

const sessionUser = () => {
  const user = useSessionStore.getState().user;
  if (!user) throw new Error("Your session has expired. Sign in again to continue.");
  return user;
};

export const useErpStore = create<ErpState>((set, get) => {
  const refresh = async (additionalKeys: ErpResourceKey[] = []) => {
    try {
      const changes = await refreshErpData([...new Set([...financialResourceKeys, ...additionalKeys])]);
      set((state) => ({
        ...changes,
        activity: changes.journalEntries ? changes.journalEntries.map(journalActivity) : state.activity,
        loadError: null,
      }));
    } catch (error) {
      set({ loadError: error instanceof Error ? error.message : "Unable to refresh workspace data." });
    }
  };

  return {
    ...emptyErpSnapshot(null),
    ready: false,
    loadError: null,
    refresh,
    async createPurchaseOrder(input) {
      const order = await createPurchaseOrderRequest(input);
      await refresh(["purchaseOrders", "suppliers"]);
      return order;
    },
    async approvePurchaseOrder(purchaseOrderId) {
      await approvePurchaseOrderRequest(purchaseOrderId);
      await refresh(["purchaseOrders"]);
    },
    async markPurchaseOrderInTransit(purchaseOrderId) {
      await markPurchaseOrderInTransitRequest(purchaseOrderId);
      await refresh(["purchaseOrders", "inventory"]);
    },
    async previewLandedCosts(input) {
      return previewLandedCostsRequest(input);
    },
    async postGoodsReceipt(input) {
      const receipt = await postGoodsReceiptRequest(input);
      await refresh(["purchaseOrders", "goodsReceipts", "suppliers", "vendorPayments"]);
      return { goodsReceiptId: receipt.id, journalEntryId: receipt.journalEntryId, inventoryValueBaseMinor: receipt.totalInventoryBaseMinor };
    },
    async createSalesOrder(input) {
      const order = await createSalesOrderRequest(input);
      await refresh(["orders", "customers", "reservations"]);
      return order;
    },
    async approveSalesOrder(orderId) {
      await approveSalesOrderRequest(orderId);
      await refresh(["orders", "reservations", "customers"]);
    },
    async moveOrderToPickPack(orderId) {
      await moveOrderToPickPackRequest(orderId);
      await refresh(["orders"]);
    },
    async shipOrder(orderId) {
      const invoice = await shipOrderRequest(orderId);
      await refresh(["orders", "invoices", "customers", "customerPayments", "salesReturns", "creditNotes"]);
      return { invoiceId: invoice.id, cogsJournalEntryId: invoice.journalEntryIds[0] ?? "", revenueJournalEntryId: invoice.journalEntryIds[1] ?? "", cogsBaseMinor: invoice.cogsBaseMinor ?? 0 };
    },
    async reserveStock(input) {
      const reservation = await reserveStockRequest(input);
      await refresh(["reservations"]);
      return reservation;
    },
    async releaseReservation(reservationId) {
      await releaseReservationRequest(reservationId);
      await refresh(["reservations"]);
    },
    async transferStock(input) {
      const transfer = await transferStockRequest(input);
      await refresh(["transfers", "costLayers"]);
      return transfer;
    },
    async recordExpense(input) {
      const expense = await recordExpenseRequest(input);
      await refresh(["expenses"]);
      return expense;
    },
    async recordCustomerPayment(input) {
      const payment = await recordCustomerPaymentRequest(input);
      await refresh(["customerPayments", "customers", "invoices"]);
      return payment;
    },
    async updateCustomerPayment(paymentId, input) {
      const payment = await updateCustomerPaymentRequest(paymentId, input);
      await refresh(["customerPayments", "customers", "invoices"]);
      return payment;
    },
    async updateCustomer(customerId, input) {
      await updateCustomerRequest(customerId, input);
      await refresh(["customers"]);
    },
    async createCustomer(input) {
      const customer = await createCustomerRequest(input);
      await refresh(["customers"]);
      return customer;
    },
    async createVendor(input) {
      const vendor = await createVendorRequest(input);
      await refresh(["suppliers"]);
      return vendor;
    },
    async updateSalesOrderLineQuantity(orderId, lineId, quantity) {
      await updateSalesOrderLineQuantityRequest(orderId, lineId, quantity);
      await refresh(["orders", "reservations", "customers"]);
    },
    async recordVendorPayment(input) {
      const payment = await recordVendorPaymentRequest(input);
      await refresh(["vendorPayments", "suppliers"]);
      return payment;
    },
    async createSalesReturn(input) {
      const salesReturn = await createSalesReturnRequest(input);
      await refresh(["salesReturns", "creditNotes", "orders", "invoices", "customers"]);
      return salesReturn;
    },
    async createStockAudit(input) {
      const audit = await createStockAuditRequest(input);
      await refresh(["stockAudits", "costLayers"]);
      return audit;
    },
    async updateFiscalSettings(input) {
      const organization = await updateFiscalSettingsRequest(input);
      const user = { ...sessionUser(), organization };
      useSessionStore.getState().setUser(user);
      const snapshot = await loadErpSnapshot(user);
      set({ ...snapshot, ready: true, loadError: null });
    },
    async registerOrganization(input) {
      const response = await registerOrganizationRequest(input);
      useSessionStore.getState().setUser(response.user);
      set({ ...emptyErpSnapshot(response.user), ready: true, loadError: null });
    },
    async createProduct(input) {
      await createProductRequest(input);
      await refresh(["products"]);
    },
    async updateProduct(productId, input) {
      await updateProductRequest(productId, input);
      await refresh(["products"]);
    },
    async createWarehouse(input) {
      await createWarehouseRequest(input);
      await refresh(["warehouses"]);
    },
    async updateWarehouse(warehouseId, input) {
      await updateWarehouseRequest(warehouseId, input);
      await refresh(["warehouses"]);
    },
    async checkoutPos(input) {
      const result = await checkoutPos(input);
      await refresh(["orders", "invoices", "customers", "customerPayments", "reservations"]);
      return result;
    },
    async setActiveRole(role) {
      if (!get().organization.isSandbox) throw new Error("Role switching is available only in the interactive demo. Team roles are managed by your administrator.");
      const response = await switchDemoRole(role);
      useSessionStore.getState().setUser(response.user);
      const snapshot = await loadErpSnapshot(response.user);
      set({ ...snapshot, ready: true, loadError: null });
    },
    async resetDemo() {
      const response = await startDemo();
      useSessionStore.getState().setUser(response.user);
      const snapshot = await loadErpSnapshot(response.user);
      set({ ...snapshot, ready: true, loadError: null });
    },
  };
});
