"use client";

import { Printer, Scale } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { isValidDateRange } from "@/lib/finance";
import { cn, formatMoney } from "@/lib/utils";
import type { FinancialReports as FinancialReportData } from "@/types/api";
import type { AccountBalance, DateRangeFilter } from "@/types/erp";
import type { ErpSnapshot } from "@/types/api";

const reportTabs = [
  { id: "trial", label: "Trial Balance" },
  { id: "profit", label: "Profit & Loss" },
  { id: "balance", label: "Balance Sheet" },
] as const;

export function FinancialReports({ data, range }: { data: ErpSnapshot; range: DateRangeFilter }) {
  const [reportType, setReportType] = useState<(typeof reportTabs)[number]["id"]>("trial");
  const valid = isValidDateRange(range);
  const report = valid ? data.financialReports : null;
  const balance = (code: string) => report?.trialBalance.rows.find((item) => item.account.code === code)?.balanceMinor ?? 0;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-card dark:border-white/10">
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-card p-1 dark:border-white/10">{reportTabs.map((tab) => <button key={tab.id} type="button" onClick={() => setReportType(tab.id)} className={cn("rounded-md px-3 py-2 text-xs font-medium transition", reportType === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{tab.label}</button>)}</div><Button variant="outline" size="sm" onClick={() => window.print()} disabled={!report}><Printer />Print / PDF view</Button></div>
      <div data-report-print className="p-5 sm:p-6">
        <header className="mb-6 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold tracking-tight">{reportTabs.find((tab) => tab.id === reportType)?.label}</h2><p className="mt-2 text-sm font-medium">{data.organization.legalName}</p><p className="numeric mt-1 text-xs text-muted-foreground">{reportType === "profit" ? `${range.startDate} through ${range.endDate}` : `As of ${range.endDate}`} · Base currency {data.organization.baseCurrency}</p></div>{report ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />Ledger verified</p> : null}</header>
        {!report ? <p className="p-8 text-center text-sm text-muted-foreground">{valid ? "Financial reports are not available for this role or period." : "Select a valid date range to generate this report."}</p> : null}
        {report && reportType === "trial" ? <TrialBalance balances={report.trialBalance.rows} report={report} /> : null}
        {report && reportType === "profit" ? <ProfitLoss report={report} /> : null}
        {report && reportType === "balance" ? <BalanceSheet report={report} balance={balance} /> : null}
      </div>
    </section>
  );
}

function TrialBalance({ balances, report }: { balances: AccountBalance[]; report: FinancialReportData }) {
  const rows = balances.filter((item) => item.account.parentId).map((item) => ({
    ...item,
    debitMinor: Math.max(0, item.balanceMinor),
    creditMinor: Math.max(0, -item.balanceMinor),
  }));
  return (
    <><div className="scrollbar-thin overflow-x-auto rounded-lg border"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/[0.02] dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Code</th><th className="px-4 py-3 font-semibold uppercase tracking-wider">Account</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Debit</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Credit</th></tr></thead><tbody>{rows.map((item) => <tr key={item.account.id} className="border-t"><td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.account.code}</td><td className="px-4 py-2.5">{item.account.name}</td><td className="numeric px-4 py-2.5 text-right">{item.debitMinor ? formatMoney(item.debitMinor) : "-"}</td><td className="numeric px-4 py-2.5 text-right">{item.creditMinor ? formatMoney(item.creditMinor) : "-"}</td></tr>)}</tbody><tfoot className="border-t bg-slate-50 font-semibold dark:bg-white/[0.02]"><tr><td colSpan={2} className="px-4 py-3">Total</td><td className="numeric px-4 py-3 text-right">{formatMoney(report.trialBalance.totalDebitMinor)}</td><td className="numeric px-4 py-3 text-right">{formatMoney(report.trialBalance.totalCreditMinor)}</td></tr></tfoot></table></div><div className={cn("mt-4 flex items-center gap-2 border-t pt-4 text-xs", !report.trialBalance.balanced && "text-destructive")}><Scale className="size-4" />{report.trialBalance.balanced ? `Trial Balance verified: ${formatMoney(report.trialBalance.totalDebitMinor)} debits equal ${formatMoney(report.trialBalance.totalCreditMinor)} credits.` : "Trial Balance variance detected. Review the journal audit feed."}</div></>
  );
}

function ProfitLoss({ report }: { report: FinancialReportData }) {
  const profit = report.profitLoss;
  const margin = profit.revenueMinor === 0 ? 0 : (profit.grossProfitMinor / profit.revenueMinor) * 100;
  const netMargin = profit.revenueMinor === 0 ? 0 : (profit.netProfitMinor / profit.revenueMinor) * 100;
  return (
    <div className="mx-auto max-w-4xl"><div className="mb-5 flex items-end justify-between gap-4 border-b pb-5"><div><p className="text-xs text-muted-foreground">Net profit for the period</p><p className={cn("numeric mt-2 text-3xl font-semibold tracking-tight", profit.netProfitMinor < 0 && "text-destructive")}>{formatMoney(profit.netProfitMinor)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Net margin</p><p className="numeric mt-2 text-lg font-semibold">{netMargin.toFixed(2)}%</p></div></div><div className="rounded-lg border"><ReportLine label="Product Sales Revenue" value={profit.revenueMinor} /><ReportLine label="FIFO Cost of Goods Sold" value={-profit.cogsMinor} /><ReportLine label="Gross Profit" value={profit.grossProfitMinor} strong subtotal detail={`Gross margin ${margin.toFixed(2)}%`} /><ReportLine label="Operating Expenses" value={-profit.operatingExpensesMinor} /><ReportLine label="Inventory Shrinkage" value={-profit.shrinkageMinor} /><ReportLine label="Total Operating Expenses & Shrinkage" value={-profit.totalExpensesMinor} strong subtotal /><ReportLine label="Net Profit" value={profit.netProfitMinor} strong highlight /></div><p className="mt-4 text-xs leading-5 text-muted-foreground">Revenue and COGS are recognized from shipment accounting. Operating expenses and shrinkage are recognized from posted expense documents in the selected period.</p></div>
  );
}

function BalanceSheet({ report, balance }: { report: FinancialReportData; balance: (code: string) => number }) {
  const statement = report.balanceSheet;
  const assetAccounts = [["101000", "Cash & Cash Equivalents"], ["101100", "Bank Operating Account"], ["101200", "Mobile Banking Wallet"], ["102000", "Accounts Receivable"], ["103000", "Inventory Asset"]] as const;
  const liabilityAccounts = [["201000", "Accrued Accounts Payable"], ["202000", "Freight & Duty Clearing"], ["203000", "Sales Tax Payable"]] as const;
  return (
    <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-lg border p-5"><h3 className="text-sm font-semibold">Assets</h3><div className="mt-4">{assetAccounts.map(([code, name]) => <ReportLine key={code} label={name} value={balance(code)} />)}<ReportLine label="Total Assets" value={statement.assetsMinor} strong subtotal /></div></div><div className="space-y-5"><div className="rounded-lg border p-5"><h3 className="text-sm font-semibold">Liabilities</h3><div className="mt-4">{liabilityAccounts.map(([code, name]) => <ReportLine key={code} label={name} value={balance(code)} />)}<ReportLine label="Total Liabilities" value={statement.liabilitiesMinor} strong subtotal /></div></div><div className="rounded-lg border p-5"><h3 className="text-sm font-semibold">Equity</h3><div className="mt-4"><ReportLine label="Opening Balance Equity" value={statement.ledgerEquityMinor} /><ReportLine label="Current Earnings" value={statement.currentEarningsMinor} /><ReportLine label="Total Equity" value={statement.equityMinor} strong subtotal /></div></div></div><div className="lg:col-span-2"><ReportLine label="Total Liabilities + Equity" value={statement.liabilitiesAndEquityMinor} strong subtotal /><div className={cn("mt-4 flex items-center gap-2 border-t pt-4 text-xs", statement.varianceMinor !== 0 && "text-destructive")}><Scale className="size-4" />{statement.varianceMinor === 0 ? `Balanced: ${formatMoney(statement.assetsMinor)} Assets = ${formatMoney(statement.liabilitiesAndEquityMinor)} Liabilities + Equity.` : `Balance Sheet variance: ${formatMoney(statement.varianceMinor)}.`}</div></div></div>
  );
}

function ReportLine({ label, value, strong = false, subtotal = false, highlight = false, detail }: { label: string; value: number; strong?: boolean; subtotal?: boolean; highlight?: boolean; detail?: string }) {
  return <div className={cn("flex items-center justify-between gap-4 border-b px-3 py-3 text-xs last:border-0", subtotal && "border-t-2", highlight && "bg-slate-50 font-semibold dark:bg-white/[0.03]", strong && "font-semibold")}><div><span>{label}</span>{detail ? <span className="numeric ml-2 text-xs font-normal text-muted-foreground">{detail}</span> : null}</div><span className={cn("numeric whitespace-nowrap", value < 0 && "text-destructive")}>{formatMoney(value)}</span></div>;
}
