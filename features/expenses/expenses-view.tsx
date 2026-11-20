"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Download, FilePlus2, Landmark, Search, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { DateRangeFields } from "@/components/erp/date-range-filter";
import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { StatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseDetailDialog } from "@/features/expenses/expense-detail-dialog";
import { ExpenseForm } from "@/features/expenses/expense-form";
import { useHydrated } from "@/hooks/use-hydrated";
import { apiDownload, saveBlob } from "@/lib/api";
import { getExpenses, getFinancialReports } from "@/lib/erp-api";
import { DEFAULT_REPORT_RANGE, isValidDateRange, timestampWithinRange } from "@/lib/finance";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { PaymentMethod } from "@/types/erp";

const paymentFilters = ["All", "Cash", "Bank", "Mobile Banking"] as const;

export function ExpensesView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useErpStore();
  const [range, setRange] = useState(DEFAULT_REPORT_RANGE);
  const [paymentFilter, setPaymentFilter] = useState<(typeof paymentFilters)[number]>("All");
  const [search, setSearch] = useState("");
  const createOpen = searchParams.get("create") === "1";
  const selectedExpenseId = searchParams.get("expense");
  const valid = isValidDateRange(range);
  const reportQuery = useQuery({ queryKey: ["financial-reports", state.organization.id, range.startDate, range.endDate], queryFn: () => getFinancialReports(range), enabled: valid });
  const expenseQuery = useQuery({ queryKey: ["operating-expenses", state.organization.id, range.startDate, range.endDate, paymentFilter], queryFn: () => getExpenses(range, paymentFilter), enabled: valid });
  useEffect(() => { if (reportQuery.data) useErpStore.setState({ financialReports: reportQuery.data }); }, [reportQuery.data]);
  useEffect(() => { if (expenseQuery.data) useErpStore.setState({ expenses: expenseQuery.data }); }, [expenseQuery.data]);
  const report = valid && reportQuery.data?.profitLoss.startDate === range.startDate && reportQuery.data.trialBalance.endDate === range.endDate ? reportQuery.data : null;
  const balances = report?.trialBalance.rows ?? [];
  const expenses = state.expenses.filter((expense) => {
    if (valid && !timestampWithinRange(expense.expenseDate, range)) return false;
    if (paymentFilter !== "All" && expense.paymentMethod !== paymentFilter) return false;
    if (!search.trim()) return true;
    return `${expense.number} ${expense.category} ${expense.payee} ${expense.reference}`.toLowerCase().includes(search.toLowerCase());
  });
  const paymentTotal = (method: PaymentMethod) => expenses.filter((expense) => expense.paymentMethod === method).reduce((sum, expense) => sum + expense.amountBaseMinor, 0);
  const accountBalance = (code: string) => balances.find((item) => item.account.code === code)?.balanceMinor ?? 0;
  const navigate = (query: string) => router.push(query ? `/app/expenses?${query}` : "/app/expenses", { scroll: false });
  const exportCsv = async () => {
    const result = await apiDownload(`/finance/expenses/export/?startDate=${range.startDate}&endDate=${range.endDate}`);
    saveBlob(result.blob, result.filename);
  };

  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[520px]" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Business expenses and payment control" description="Record real operating payments, preserve their business purpose and payment method, and update expense accounts, cash balances, and financial statements in one posting." actions={<><Button asChild variant="outline"><Link href="/app/finance"><Landmark />Financial reports<ArrowUpRight /></Link></Button><Button onClick={() => navigate("create=1")}><FilePlus2 />Record expense</Button></>} />
      <section aria-label="Expense KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Expenses · selected period", value: formatMoney(report?.profitLoss.totalExpensesMinor ?? 0), detail: `${expenses.length} payment documents` },
        { label: "Bank payments", value: formatMoney(paymentTotal("Bank")), detail: "Operating account outflows" },
        { label: "Cash payments", value: formatMoney(paymentTotal("Cash")), detail: "Petty cash outflows" },
        { label: "Mobile Banking payments", value: formatMoney(paymentTotal("Mobile Banking")), detail: "Mobile wallet outflows" },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>
      <section aria-label="Payment account balances" className="grid gap-3 md:grid-cols-3">{[
        { id: "101000", name: "Cash & Petty Cash", detail: "Physical cash and small operational payments" },
        { id: "101100", name: "Bank Operating Account", detail: "Primary business banking balance" },
        { id: "101200", name: "Mobile Banking Wallet", detail: "Digital payment wallet balance" },
      ].map((account) => <Card key={account.id}><CardHeader><CardTitle className="text-sm">{account.name}</CardTitle><CardDescription className="mt-1">{account.detail}</CardDescription></CardHeader><CardContent><p className="numeric text-2xl font-semibold tracking-tight">{formatMoney(accountBalance(account.id))}</p><p className="numeric mt-1.5 text-xs text-muted-foreground">Balance as of {range.endDate}</p></CardContent></Card>)}</section>
      <div className="flex justify-end"><DateRangeFields value={range} onChange={setRange} idPrefix="expenses" /></div>
      <section className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-sm font-semibold">Expense payment register</h2><p className="mt-1 text-[10px] text-muted-foreground">Actual payment records with source journals and immutable audit history</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search expenses" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Payee, category, reference…" className="h-9 pl-9 text-xs sm:w-60" /></div><select aria-label="Filter by payment method" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as (typeof paymentFilters)[number])} className="h-9 rounded-md border bg-card px-3 text-xs">{paymentFilters.map((filter) => <option key={filter}>{filter}</option>)}</select><Button variant="outline" size="sm" onClick={exportCsv} disabled={expenses.length === 0}><Download />Export CSV</Button></div></div><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Expense</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Date</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Payee</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Category</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Payment</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Base amount</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Posted by</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Action</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-b last:border-0 hover:bg-accent/30"><td className="px-4 py-3"><button type="button" onClick={() => navigate(`expense=${expense.id}`)} className="font-mono font-semibold text-primary hover:underline">{expense.number}</button><p className="mt-1 text-[10px] text-muted-foreground">{expense.reference}</p></td><td className="px-3 py-3 text-[10px]">{new Date(expense.expenseDate).toLocaleDateString("en-US")}</td><td className="max-w-[210px] px-3 py-3"><p className="truncate">{expense.payee}</p></td><td className="px-3 py-3"><Badge variant="secondary">{expense.category}</Badge></td><td className="px-3 py-3"><span className="text-xs">{expense.paymentMethod}</span></td><td className="numeric px-3 py-3 text-right font-medium">{formatMoney(expense.amountBaseMinor)}</td><td className="px-3 py-3"><StatusBadge status={expense.createdByRole} /></td><td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => navigate(`expense=${expense.id}`)}>View journal</Button></td></tr>)}</tbody></table>{expenses.length === 0 ? <div className="p-12 text-center"><WalletCards className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No expenses match this period and filter</p><p className="mt-1 text-xs text-muted-foreground">Record a business payment or broaden the selected date range.</p><Button className="mt-4" onClick={() => navigate("create=1")}><FilePlus2 />Record expense</Button></div> : null}</div><div className="flex justify-between border-t bg-secondary/20 px-4 py-3 text-[10px] text-muted-foreground"><span>{expenses.length} payment records</span><span className="numeric">Total {formatMoney(expenses.reduce((sum, expense) => sum + expense.amountBaseMinor, 0))}</span></div></section>
      <ExpenseForm open={createOpen} onOpenChange={(open) => { if (!open) navigate(""); }} onCreated={(expense) => navigate(`expense=${expense.id}`)} />
      <ExpenseDetailDialog expenseId={selectedExpenseId} open={Boolean(selectedExpenseId)} onOpenChange={(open) => { if (!open) navigate(""); }} />
    </div>
  );
}
