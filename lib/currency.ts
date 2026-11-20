import type { ErpData } from "@/types/erp";

function scaled(value: number, rate: number) {
  return Math.round(value * rate);
}

export function convertErpDataCurrency(data: ErpData, newCurrency: ErpData["organization"]["baseCurrency"], conversionRate: number): ErpData {
  if (!Number.isFinite(conversionRate) || conversionRate <= 0) throw new Error("Currency conversion rate must be greater than zero.");
  const convert = (value: number) => scaled(value, conversionRate);
  return {
    ...data,
    organization: { ...data.organization, baseCurrency: newCurrency },
    customers: data.customers.map((customer) => ({ ...customer, creditLimitBaseMinor: convert(customer.creditLimitBaseMinor) })),
    purchaseOrders: data.purchaseOrders.map((order) => ({ ...order, fxRateToBase: order.fxRateToBase * conversionRate })),
    orders: data.orders.map((order) => ({ ...order, fxRateToBase: order.fxRateToBase * conversionRate })),
    goodsReceipts: data.goodsReceipts.map((receipt) => ({
      ...receipt,
      landedCosts: { ...receipt.landedCosts, fxRateToBase: receipt.landedCosts.fxRateToBase * conversionRate, base: { freightMinor: convert(receipt.landedCosts.base.freightMinor), customsMinor: convert(receipt.landedCosts.base.customsMinor), portHandlingMinor: convert(receipt.landedCosts.base.portHandlingMinor), insuranceMinor: convert(receipt.landedCosts.base.insuranceMinor) } },
      lines: receipt.lines.map((line) => ({ ...line, baseUnitCostMinor: convert(line.baseUnitCostMinor), baseGoodsCostMinor: convert(line.baseGoodsCostMinor), allocatedFreightMinor: convert(line.allocatedFreightMinor), allocatedCustomsMinor: convert(line.allocatedCustomsMinor), allocatedPortHandlingMinor: convert(line.allocatedPortHandlingMinor), allocatedInsuranceMinor: convert(line.allocatedInsuranceMinor), allocatedLandedCostMinor: convert(line.allocatedLandedCostMinor), trueUnitCostMinor: convert(line.trueUnitCostMinor), trueTotalCostMinor: convert(line.trueTotalCostMinor) })),
      totalGoodsBaseMinor: convert(receipt.totalGoodsBaseMinor),
      totalLandedCostBaseMinor: convert(receipt.totalLandedCostBaseMinor),
      totalInventoryBaseMinor: convert(receipt.totalInventoryBaseMinor),
    })),
    costLayers: data.costLayers.map((layer) => ({ ...layer, unitCostMinor: convert(layer.unitCostMinor), allocatedLandedUnitCostMinor: convert(layer.allocatedLandedUnitCostMinor), remainingValueMinor: convert(layer.remainingValueMinor) })),
    invoices: data.invoices.map((invoice) => ({ ...invoice, fxRateToBase: invoice.fxRateToBase * conversionRate, subtotalBaseMinor: convert(invoice.subtotalBaseMinor), taxBaseMinor: convert(invoice.taxBaseMinor), totalBaseMinor: convert(invoice.totalBaseMinor), cogsBaseMinor: convert(invoice.cogsBaseMinor) })),
    journalEntries: data.journalEntries.map((entry) => ({ ...entry, currency: newCurrency, lines: entry.lines.map((line) => ({ ...line, debitMinor: convert(line.debitMinor), creditMinor: convert(line.creditMinor) })), totalDebitMinor: convert(entry.totalDebitMinor), totalCreditMinor: convert(entry.totalCreditMinor) })),
    expenses: data.expenses.map((expense) => ({ ...expense, fxRateToBase: expense.fxRateToBase * conversionRate, amountBaseMinor: convert(expense.amountBaseMinor) })),
    customerPayments: data.customerPayments.map((payment) => ({ ...payment, fxRateToBase: payment.fxRateToBase * conversionRate, amountBaseMinor: convert(payment.amountBaseMinor), allocations: payment.allocations.map((allocation) => ({ ...allocation, amountBaseMinor: convert(allocation.amountBaseMinor) })) })),
    vendorPayments: data.vendorPayments.map((payment) => ({ ...payment, fxRateToBase: payment.fxRateToBase * conversionRate, amountBaseMinor: convert(payment.amountBaseMinor) })),
    salesReturns: data.salesReturns.map((item) => ({ ...item, restoredValueBaseMinor: convert(item.restoredValueBaseMinor), shrinkageBaseMinor: convert(item.shrinkageBaseMinor), lines: item.lines.map((line) => ({ ...line, unitCostBaseMinor: convert(line.unitCostBaseMinor) })) })),
    creditNotes: data.creditNotes.map((note) => ({ ...note, amountBaseMinor: convert(note.amountBaseMinor) })),
    stockAudits: data.stockAudits.map((audit) => ({ ...audit, valueDeltaBaseMinor: convert(audit.valueDeltaBaseMinor) })),
  };
}
