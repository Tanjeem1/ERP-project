import type { ErpData, PaymentAllocation } from "@/types/erp";

export function getInvoiceOutstandingMinor(data: ErpData, invoiceId: string) {
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice || invoice.status === "Void") return 0;
  const paidMinor = data.customerPayments
    .filter((payment) => payment.status === "Posted")
    .flatMap((payment) => payment.allocations)
    .filter((allocation) => allocation.invoiceId === invoiceId)
    .reduce((sum, allocation) => sum + allocation.amountBaseMinor, 0);
  const creditMinor = data.creditNotes
    .filter((note) => note.status === "Issued" && note.invoiceId === invoiceId)
    .reduce((sum, note) => sum + note.amountBaseMinor, 0);
  return Math.max(0, invoice.totalBaseMinor - paidMinor - creditMinor);
}

export function getCustomerOutstandingMinor(data: ErpData, customerId: string) {
  const customer = data.customers.find((item) => item.id === customerId);
  if (customer?.remainingDebtMinor !== undefined) return customer.remainingDebtMinor;
  return data.invoices.filter((invoice) => invoice.customerId === customerId).reduce((sum, invoice) => sum + getInvoiceOutstandingMinor(data, invoice.id), 0);
}

export function getCustomerTotalPaidMinor(data: ErpData, customerId: string) {
  const customer = data.customers.find((item) => item.id === customerId);
  if (customer?.totalPaidMinor !== undefined) return customer.totalPaidMinor;
  return data.customerPayments.filter((payment) => payment.customerId === customerId && payment.status === "Posted").reduce((sum, payment) => sum + payment.amountBaseMinor, 0);
}

export function getCustomerTotalPurchasedMinor(data: ErpData, customerId: string) {
  const customer = data.customers.find((item) => item.id === customerId);
  if (customer?.totalPurchasedMinor !== undefined) return customer.totalPurchasedMinor;
  return data.orders.filter((order) => order.customerId === customerId).reduce((sum, order) => {
    const customer = data.customers.find((item) => item.id === customerId);
    const subtotalMinor = order.lines.reduce((lineSum, line) => lineSum + line.quantity * line.unitPriceMinor, 0);
    const subtotalBaseMinor = Math.round(subtotalMinor * order.fxRateToBase);
    const taxBaseMinor = Math.round(subtotalMinor * (customer?.taxRateBasisPoints ?? 0) / 10000 * order.fxRateToBase);
    return sum + subtotalBaseMinor + taxBaseMinor;
  }, 0);
}

export function getSupplierOutstandingMinor(data: ErpData, supplierId: string) {
  const supplier = data.suppliers.find((item) => item.id === supplierId);
  if (supplier?.payableBalanceMinor !== undefined) return supplier.payableBalanceMinor;
  const accruedMinor = data.goodsReceipts.filter((receipt) => {
    const order = data.purchaseOrders.find((item) => item.id === receipt.purchaseOrderId);
    return order?.supplierId === supplierId;
  }).reduce((sum, receipt) => sum + receipt.totalGoodsBaseMinor, 0);
  const paidMinor = data.vendorPayments.filter((payment) => payment.supplierId === supplierId).reduce((sum, payment) => sum + payment.amountBaseMinor, 0);
  return Math.max(0, accruedMinor - paidMinor);
}

export function reconcileInvoiceStatuses(data: ErpData, customerId: string) {
  for (const invoice of data.invoices.filter((item) => item.customerId === customerId && item.status !== "Void")) {
    invoice.status = getInvoiceOutstandingMinor(data, invoice.id) <= 0 ? "Paid" : "Issued";
  }
}

export function allocatePaymentToInvoices(data: ErpData, customerId: string, amountBaseMinor: number, invoiceId?: string): PaymentAllocation[] {
  const invoices = data.invoices
    .filter((invoice) => invoice.customerId === customerId && (invoiceId ? invoice.id === invoiceId : invoice.status === "Issued"))
    .sort((left, right) => left.issuedAt.localeCompare(right.issuedAt));
  if (invoiceId && invoices.length === 0) throw new Error("The selected invoice is not open for payment or does not belong to this customer.");
  let remaining = amountBaseMinor;
  const allocations: PaymentAllocation[] = [];
  for (const invoice of invoices) {
    if (remaining === 0) break;
    const outstanding = getInvoiceOutstandingMinor(data, invoice.id);
    const allocated = Math.min(remaining, outstanding);
    if (allocated > 0) {
      allocations.push({ invoiceId: invoice.id, amountBaseMinor: allocated });
      remaining -= allocated;
    }
  }
  if (remaining > 0) throw new Error(`Payment exceeds open customer debt by ${remaining} base minor units.`);
  return allocations;
}
