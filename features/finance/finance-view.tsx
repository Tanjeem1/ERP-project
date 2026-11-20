"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpenCheck, FileText, Landmark, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DateRangeFields } from "@/components/erp/date-range-filter";
import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CoaTree } from "@/features/finance/coa-tree";
import { FinancialReports } from "@/features/finance/financial-reports";
import { JournalLedger } from "@/features/finance/journal-ledger";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { getFinancialReports } from "@/lib/erp-api";
import { DEFAULT_REPORT_RANGE, isValidDateRange, journalWithinRange } from "@/lib/finance";
import { cn, formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";

const views = [
  { id: "coa", label: "Chart of Accounts", icon: BookOpenCheck },
  { id: "journals", label: "Journal Entries", icon: FileText },
  { id: "reports", label: "Financial Reports", icon: Landmark },
] as const;

export function FinanceView() {
  const hydrated = useHydrated();
  const state = useErpStore();
  const [view, setView] = useState<(typeof views)[number]["id"]>("coa");
  const [range, setRange] = useState(DEFAULT_REPORT_RANGE);
  const [accountFilter, setAccountFilter] = useState("All");
  const valid = isValidDateRange(range);
  const { can } = usePermissions();
  const reportQuery = useQuery({ queryKey: ["financial-reports", state.organization.id, range.startDate, range.endDate], queryFn: () => getFinancialReports(range), enabled: valid && can("viewLedger") });
  useEffect(() => { if (reportQuery.data) useErpStore.setState({ financialReports: reportQuery.data }); }, [reportQuery.data]);
  const report = valid && reportQuery.data?.trialBalance.endDate === range.endDate && reportQuery.data.profitLoss.startDate === range.startDate ? reportQuery.data : null;
  const balances = report?.trialBalance.rows ?? [];
  const journalEntries = valid ? state.journalEntries.filter((entry) => entry.status === "Posted" && journalWithinRange(entry, range)) : [];
  const postedEntries = { length: report?.periodEntries ?? 0 };
  const totalDebits = report?.trialBalance.totalDebitMinor ?? 0;
  const totalCredits = report?.trialBalance.totalCreditMinor ?? 0;
  const selectAccount = (accountId: string) => { setAccountFilter(accountId); setView("journals"); };

  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[520px]" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="General Ledger and Financial Statements" description="Trace every balance to its source event, verify debits against credits, and generate live Trial Balance, Profit & Loss, and Balance Sheet reports for any period." actions={<><Button asChild variant="outline"><Link href="/app/expenses"><WalletCards />Record expense<ArrowUpRight /></Link></Button><Button asChild><Link href="/app/settings">Approval queue<ArrowUpRight /></Link></Button></>} />
      <section aria-label="Finance KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Cumulative debits", value: formatMoney(totalDebits), detail: `${postedEntries.length} posted journals in the selected period` },
        { label: "Cumulative credits", value: formatMoney(totalCredits), detail: `${formatMoney(totalDebits - totalCredits)} variance` },
        { label: "Net profit · selected period", value: formatMoney(report?.profitLoss.netProfitMinor ?? 0), detail: "Revenue - COGS - operating expenses" },
        { label: "Balance sheet variance", value: formatMoney(report?.balanceSheet.varianceMinor ?? 0), detail: "Assets = Liabilities + Equity" },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">{views.map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition", view === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}><item.icon className="size-3.5" />{item.label}</button>)}</div><DateRangeFields value={range} onChange={setRange} idPrefix={`finance-${view}`} /></div>
      {view === "coa" ? <section aria-labelledby="coa-heading"><div className="mb-4 flex items-center justify-between"><div><h2 id="coa-heading" className="text-sm font-semibold">Chart of Accounts tree</h2><p className="mt-1 text-[10px] text-muted-foreground">Select any account to open its source journal lines</p></div><span className="text-[10px] text-muted-foreground">As of {range.endDate}</span></div><CoaTree balances={balances} onSelectAccount={selectAccount} /></section> : null}
      {view === "journals" ? <JournalLedger entries={journalEntries} accounts={state.accounts} accountFilter={accountFilter} onAccountFilterChange={setAccountFilter} range={range} /> : null}
      {view === "reports" ? <FinancialReports data={{ ...state, financialReports: report }} range={range} /> : null}
    </div>
  );
}
