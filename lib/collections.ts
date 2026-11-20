import { getDefaultReportRange } from "@/lib/erp-api";
import type { ErpData } from "@/types/erp";

export const DEFAULT_COLLECTION_RANGE = getDefaultReportRange();

export function zonedDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function isCollectionToday(timestamp: string, timezone: string, now = new Date()) {
  return zonedDateKey(new Date(timestamp), timezone) === zonedDateKey(now, timezone);
}

export function isCollectionMonthToDate(timestamp: string, timezone: string, now = new Date()) {
  return zonedDateKey(new Date(timestamp), timezone).slice(0, 7) === zonedDateKey(now, timezone).slice(0, 7);
}

export function getArAging(data: ErpData, evaluationTime: number) {
  const aging = { current: 0, days31To60: 0, days61Plus: 0 };
  for (const invoice of data.invoices) {
    const outstanding = data.invoices.find((item) => item.id === invoice.id);
    if (!outstanding) continue;
    const paid = data.customerPayments.filter((payment) => payment.status === "Posted").flatMap((payment) => payment.allocations).filter((allocation) => allocation.invoiceId === invoice.id).reduce((sum, allocation) => sum + allocation.amountBaseMinor, 0);
    const credits = data.creditNotes.filter((note) => note.status === "Issued" && note.invoiceId === invoice.id).reduce((sum, note) => sum + note.amountBaseMinor, 0);
    const debt = Math.max(0, invoice.totalBaseMinor - paid - credits);
    if (debt === 0) continue;
    const days = Math.max(0, Math.floor((evaluationTime - Date.parse(invoice.issuedAt)) / 86400000));
    if (days <= 30) aging.current += debt;
    else if (days <= 60) aging.days31To60 += debt;
    else aging.days61Plus += debt;
  }
  return aging;
}
