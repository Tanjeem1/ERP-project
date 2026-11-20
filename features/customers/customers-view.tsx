"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, ChevronRight, FilePlus2, ReceiptText, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DateRangeFields } from "@/components/erp/date-range-filter";
import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerCompanyModal } from "@/features/customers/customer-company-modal";
import { CustomerPaymentModal } from "@/features/customers/customer-payment-modal";
import { PaymentReceiptDialog } from "@/features/customers/payment-receipt-dialog";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { getCustomerOutstandingMinor, getCustomerTotalPaidMinor, getCustomerTotalPurchasedMinor } from "@/lib/balances";
import { getCollectionSummary } from "@/lib/erp-api";
import { DEFAULT_COLLECTION_RANGE, getArAging } from "@/lib/collections";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { Customer } from "@/types/erp";

export function CustomersView() {
  const hydrated = useHydrated();
  const state = useErpStore();
  const { can } = usePermissions();
  const [range, setRange] = useState(DEFAULT_COLLECTION_RANGE);
  const [search, setSearch] = useState("");
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [companyCustomer, setCompanyCustomer] = useState<Customer | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const timezone = state.organization.timezone;
  const collectionQuery = useQuery({ queryKey: ["collection-summary", state.organization.id, range.startDate, range.endDate], queryFn: () => getCollectionSummary(range) });
  useEffect(() => { if (collectionQuery.data) useErpStore.setState({ collectionSummary: collectionQuery.data }); }, [collectionQuery.data]);
  const summary = state.collectionSummary;
  const collectedToday = summary?.collectedTodayMinor ?? 0;
  const collectedMonth = summary?.collectedThisMonthMinor ?? 0;
  const collectedRange = summary?.collectedRangeMinor ?? 0;
  const salesRange = summary?.salesRangeMinor ?? 0;
  const marketDebt = summary?.totalMarketDebtMinor ?? 0;
  const aging = summary ? { current: summary.aging["0-30"], days31To60: summary.aging["31-60"], days61Plus: summary.aging["61+"] } : getArAging(state, Date.parse(`${range.endDate}T23:59:59.999Z`));
  const customers = state.customers.filter((customer) => `${customer.name} ${customer.code} ${customer.contactName}`.toLowerCase().includes(search.toLowerCase()));

  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[520px]" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Customer credit and daily collections" description="Track market debt, receive full or partial payments, and reconcile every customer transaction from local midnight cutoffs to detailed purchase history." actions={<>{can("postExpenses") ? <Button variant="outline" onClick={() => { setCompanyCustomer(null); setCompanyOpen(true); }}><Building2 />Add company</Button> : null}<Button asChild variant="outline"><Link href="/app/orders?create=1"><FilePlus2 />New sales order<ArrowRight /></Link></Button></>} />
      <section aria-label="Collection KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Collected today", value: formatMoney(collectedToday), detail: `00:00–23:59 · ${timezone}` },
        { label: "Collected this month", value: formatMoney(collectedMonth), detail: "Month-to-date collections" },
        { label: "Collected · selected range", value: formatMoney(collectedRange), detail: `${range.startDate} → ${range.endDate}` },
        { label: "Total market debt · AR", value: formatMoney(marketDebt), detail: `${state.customers.length} customer accounts` },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle className="text-sm">AR aging breakdown</CardTitle><CardDescription>Outstanding receivables by invoice age as of {range.endDate}</CardDescription></CardHeader><CardContent className="grid grid-cols-3 gap-3">{[["0–30 days", aging.current, "bg-emerald-500"], ["31–60 days", aging.days31To60, "bg-amber-500"], ["61+ days", aging.days61Plus, "bg-rose-500"]].map(([label, value, color]) => <div key={label as string} className="rounded-lg border bg-secondary/30 p-4"><div className={`h-1.5 w-10 rounded-full ${color}`} /><p className="mt-3 text-[10px] text-muted-foreground">{label}</p><p className="numeric mt-1 text-lg font-semibold">{formatMoney(value as number)}</p></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Sales · selected range</CardTitle><CardDescription>Order value incl. tax across all customers</CardDescription></CardHeader><CardContent><p className="numeric text-3xl font-semibold tracking-tight">{formatMoney(salesRange)}</p><div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground"><span>Collections</span><span className="numeric">{formatMoney(collectedRange)}</span></div><div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>Net sales / collections</span><span className="numeric">{formatMoney(salesRange - collectedRange)}</span></div></CardContent></Card></section>
      <div className="flex justify-end"><DateRangeFields value={range} onChange={setRange} idPrefix="customers" /></div>
      <section className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Company and customer directory</h2><p className="mt-1 text-[10px] text-muted-foreground">Credit limits, purchases, payments, remaining debt, and collection actions</p></div><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Company, code, or contact…" className="h-9 pl-9 text-xs sm:w-72" /></div></div><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-xs"><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Company</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Credit Limit</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Total Purchased</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Total Paid</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Remaining Debt</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Last Payment</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Actions</th></tr></thead><tbody>{customers.map((customer) => { const debt = getCustomerOutstandingMinor(state, customer.id); const paid = getCustomerTotalPaidMinor(state, customer.id); const purchased = getCustomerTotalPurchasedMinor(state, customer.id); const lastPayment = state.customerPayments.filter((payment) => payment.customerId === customer.id && payment.status === "Posted").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]; const exposure = (debt / customer.creditLimitBaseMinor) * 100; return <tr key={customer.id} className="border-b last:border-0 hover:bg-accent/30"><td className="px-4 py-3"><Link href={`/app/customers/${customer.id}`} className="flex items-center gap-2 font-medium text-primary hover:underline"><Building2 className="size-4" />{customer.name}<ChevronRight className="size-3" /></Link><p className="mt-1 text-[10px] text-muted-foreground">{customer.code} · {customer.paymentTermsDays}-day terms</p></td><td className="px-3 py-3 text-right"><p className="numeric">{formatMoney(customer.creditLimitBaseMinor)}</p><p className="numeric mt-1 text-[9px] text-muted-foreground">{exposure.toFixed(0)}% utilized</p></td><td className="numeric px-3 py-3 text-right">{formatMoney(purchased)}</td><td className="numeric px-3 py-3 text-right text-foreground dark:text-foreground">{formatMoney(paid)}</td><td className="px-3 py-3 text-right"><span className={`numeric font-semibold ${debt > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground dark:text-foreground"}`}>{formatMoney(debt)}</span></td><td className="px-3 py-3 text-[10px] text-muted-foreground">{lastPayment ? new Date(lastPayment.receivedAt).toLocaleDateString("en-US") : "No collections"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{can("postExpenses") ? <><Button size="sm" variant="outline" onClick={() => setPaymentCustomer(customer)}><ReceiptText />Receive payment</Button><Button size="sm" variant="ghost" onClick={() => setCompanyCustomer(customer)}>Edit terms</Button></> : <Button asChild size="sm" variant="outline"><Link href={`/app/customers/${customer.id}`}>View account<ArrowRight /></Link></Button>}</div></td></tr>; })}</tbody></table></div><div className="flex justify-between border-t bg-secondary/20 px-4 py-3 text-[10px] text-muted-foreground"><span>{customers.length} companies</span><span>Debt includes open invoices minus posted collections and credit notes</span></div></section>
      {paymentCustomer ? <CustomerPaymentModal customer={paymentCustomer} open onOpenChange={(open) => { if (!open) setPaymentCustomer(null); }} onPosted={(payment) => { setPaymentCustomer(null); setReceiptId(payment.id); }} /> : null}
      {companyOpen ? <CustomerCompanyModal customer={companyCustomer ?? undefined} open onOpenChange={(open) => { setCompanyOpen(open); if (!open) setCompanyCustomer(null); }} /> : null}
      <PaymentReceiptDialog receiptId={receiptId} open={Boolean(receiptId)} onOpenChange={(open) => { if (!open) setReceiptId(null); }} />
    </div>
  );
}
