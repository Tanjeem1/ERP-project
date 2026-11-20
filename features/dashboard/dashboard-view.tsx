"use client";

import { ArrowRight, ArrowUpRight, CircleDollarSign, FilePlus2, LockKeyhole, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { JournalEntryContent } from "@/components/erp/record-detail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import { selectErpMetrics, selectInventoryValuation, selectTrialBalance, useErpStore } from "@/store/useErpStore";
import type { ActivityEvent } from "@/types/erp";

const chartTooltip = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", color: "hsl(var(--foreground))", fontSize: "12px", fontVariantNumeric: "tabular-nums" };
const chartColors = ["#2563eb", "#10b981", "#64748b"];
const feedFilters = ["All", "Procurement", "Inventory", "Sales", "Finance"] as const;

function DashboardSkeleton() {
  return <div className="space-y-6"><div className="space-y-3"><Skeleton className="h-8 w-80" /><Skeleton className="h-4 w-[540px] max-w-full" /></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><div className="grid gap-4 xl:grid-cols-3"><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div><Skeleton className="h-96" /></div>;
}

export function DashboardView() {
  const hydrated = useHydrated();
  const state = useErpStore();
  const { can } = usePermissions();
  const [feedFilter, setFeedFilter] = useState<(typeof feedFilters)[number]>("All");
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const metrics = selectErpMetrics(state);
  const selectedJournal = state.journalEntries.find((entry) => entry.id === selectedJournalId);
  const trialBalance = selectTrialBalance(state);
  const totalDebits = state.financialReports?.trialBalance.totalDebitMinor ?? state.journalEntries.filter((entry) => entry.status === "Posted").reduce((sum, entry) => sum + entry.totalDebitMinor, 0);
  const totalCredits = state.financialReports?.trialBalance.totalCreditMinor ?? state.journalEntries.filter((entry) => entry.status === "Posted").reduce((sum, entry) => sum + entry.totalCreditMinor, 0);
  const freightBalance = trialBalance.find((item) => item.account.code === "202000")?.balanceMinor ?? 0;
  const inventoryLedgerBalance = trialBalance.find((item) => item.account.code === "103000")?.balanceMinor ?? 0;
  const inventoryVariance = state.dashboard?.inventoryVarianceMinor ?? inventoryLedgerBalance - selectInventoryValuation(state);
  const warehouseData = (state.dashboard?.warehouseData ?? []).map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name.replace(" Warehouse", "").replace(" Distribution Hub", " Hub").replace(" Fulfillment Center", " Center"),
    fullName: warehouse.name,
    usedCbm: warehouse.usedCbm,
    capacityCbm: warehouse.capacityCbm,
    utilization: warehouse.utilization,
    valueMinor: warehouse.valueMinor ?? 0,
    units: warehouse.units,
  }));
  const agingData = [
    { name: "0–30 days", value: Math.round((state.dashboard?.agingData["0-30"] ?? 0) / 100) },
    { name: "31–60 days", value: Math.round((state.dashboard?.agingData["31-60"] ?? 0) / 100) },
    { name: "61–90 days", value: Math.round((state.dashboard?.agingData["61-90"] ?? 0) / 100) },
    { name: "90+ days", value: Math.round((state.dashboard?.agingData["90+"] ?? 0) / 100) },
  ];
  const marginData = [{ name: "Revenue", value: (metrics.realizedRevenueMinor ?? 0) / 100 }, { name: "FIFO COGS", value: (metrics.realizedCogsMinor ?? 0) / 100 }, { name: "Gross profit", value: ((metrics.realizedRevenueMinor ?? 0) - (metrics.realizedCogsMinor ?? 0)) / 100 }];
  const feed = state.activity.filter((event) => feedFilter === "All" || event.type === feedFilter).slice(0, 7);
  const pendingPurchaseOrders = state.purchaseOrders.filter((order) => order.status === "Approved" || order.status === "In Transit");
  const inboundOrder = state.purchaseOrders.find((order) => order.status === "Approved" || order.status === "In Transit");
  const stockRows = state.inventory.filter((position) => position.onHand > 0).sort((left, right) => right.onHand - left.onHand).slice(0, 6);

  if (!hydrated) return <DashboardSkeleton />;

  const kpis = [
    { label: "Inventory valuation · FIFO", value: can("viewCostPrices") ? formatMoney(metrics.inventoryValuationMinor ?? 0) : "Restricted", detail: can("viewCostPrices") ? `${state.costLayers.filter((layer) => layer.remainingQuantity > 0).length} active cost layers` : "Role permission required", href: "#warehouse-capacity", restricted: !can("viewCostPrices") },
    { label: "Pending landed allocations", value: can("viewCostPrices") ? formatMoney(metrics.pendingLandedCostMinor ?? 0) : "Restricted", detail: can("viewCostPrices") ? `${pendingPurchaseOrders.length} open purchase orders` : "Role permission required", href: "/app/procurement", restricted: !can("viewCostPrices") },
    { label: "Reserved vs. available", value: `${formatNumber(metrics.reservedRatio * 100, 1)}%`, detail: `${metrics.reservedUnits.toLocaleString()} locked · ${metrics.availableUnits.toLocaleString()} ATP`, href: "#stock-control", restricted: false },
    { label: "Real-time gross margin", value: can("viewProfit") ? `${formatNumber(metrics.grossMarginPercent ?? 0, 2)}%` : "Restricted", detail: can("viewProfit") ? `${formatMoney((metrics.realizedRevenueMinor ?? 0) - (metrics.realizedCogsMinor ?? 0))} gross profit` : "Role permission required", href: "#margin-analysis", restricted: !can("viewProfit") },
    { label: "Unreconciled accounts", value: can("viewLedger") ? (metrics.unreconciledAccounts ?? 0).toString() : "Restricted", detail: can("viewLedger") ? `${formatMoney(freightBalance)} in freight clearing` : "Role permission required", href: "#ledger-feed", restricted: !can("viewLedger") },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader title="Executive Command Center" description={`Live operational and financial intelligence across ${state.warehouses.length} warehouses and ${state.products.length} SKUs.`} actions={can("manageProcurement") ? <><Button asChild variant="outline"><Link href="/app/procurement?create=1"><FilePlus2 />New purchase order</Link></Button><Button asChild={Boolean(inboundOrder)} disabled={!inboundOrder}>{inboundOrder ? <Link href={`/app/procurement?po=${inboundOrder.id}&receive=1`}><PackageCheck />Receive {inboundOrder.number}</Link> : <><PackageCheck />No inbound purchase order</>}</Button></> : undefined} />
      <section aria-label="Executive KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map((kpi) => <Link key={kpi.label} href={kpi.href} aria-disabled={kpi.restricted} onClick={(event) => { if (kpi.restricted) event.preventDefault(); }} className={cn("block", kpi.restricted && "cursor-not-allowed")}><MetricCard label={kpi.label} value={kpi.value} detail={kpi.detail} className={cn("h-full transition", kpi.restricted ? "opacity-65" : "hover:border-slate-400 dark:hover:border-white/25")} /></Link>)}</section>

      <section id="warehouse-capacity" className="grid scroll-mt-24 gap-4 xl:grid-cols-3">
        <Card><CardHeader className="border-b"><CardTitle className="text-sm">Warehouse capacity</CardTitle><CardDescription className="mt-1">Tracked SKU volume against total capacity</CardDescription></CardHeader><CardContent className="space-y-5 pt-4">{warehouseData.map((warehouse, index) => <div key={warehouse.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium">{warehouse.fullName}</p><p className="numeric mt-1 text-xs text-muted-foreground">{formatNumber(warehouse.usedCbm)} / {warehouse.capacityCbm.toLocaleString()} CBM · {warehouse.units.toLocaleString()} units</p></div><span className="numeric text-xs font-semibold">{formatNumber(warehouse.utilization, 1)}%</span></div><div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${warehouse.utilization}%`, backgroundColor: chartColors[index % chartColors.length] }} /></div><p className="numeric mt-1.5 text-xs text-muted-foreground">{formatMoney(warehouse.valueMinor)} FIFO value</p></div>)}</CardContent></Card>
        {can("viewCostPrices") ? <><Card><CardHeader className="border-b"><CardTitle className="text-sm">Aging inventory</CardTitle><CardDescription>Residual FIFO value by receipt age</CardDescription></CardHeader><CardContent className="pt-4"><div className="h-[220px]" aria-label="Aging inventory bar chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={agingData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} /><Tooltip contentStyle={chartTooltip} formatter={(value) => [formatMoney(Number(value) * 100), "FIFO value"]} cursor={{ fill: "hsl(var(--accent) / 0.45)" }} /><Bar dataKey="value" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={38} /></BarChart></ResponsiveContainer></div></CardContent></Card>
        <Card><CardHeader className="border-b"><CardTitle className="text-sm">Valuation by warehouse</CardTitle><CardDescription>Current inventory asset distribution</CardDescription></CardHeader><CardContent className="pt-4"><div className="relative h-[145px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={warehouseData} dataKey="valueMinor" nameKey="name" innerRadius={44} outerRadius={64} paddingAngle={3} stroke="none">{warehouseData.map((warehouse, index) => <Cell key={warehouse.id} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip contentStyle={chartTooltip} formatter={(value) => [formatMoney(Number(value)), "FIFO value"]} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-xs text-muted-foreground">Total</p><p className="numeric text-sm font-semibold">{formatMoney(selectInventoryValuation(state))}</p></div></div></div><div className="mt-3 space-y-2">{warehouseData.map((warehouse, index) => <div key={warehouse.id} className="flex items-center gap-2 text-xs"><span className="size-2 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="truncate text-muted-foreground">{warehouse.name}</span><span className="numeric ml-auto font-medium">{formatMoney(warehouse.valueMinor)}</span></div>)}</div></CardContent></Card></> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card id="ledger-feed" className="scroll-mt-24"><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-sm"><span className="size-1.5 rounded-full bg-emerald-500" />Real-Time Automated Ledger Feed</CardTitle><CardDescription className="mt-1">Physical events and their balanced financial entries</CardDescription></div><span className="numeric text-xs text-muted-foreground">{state.journalEntries.length} posted journals</span></div><div className="mt-3 flex flex-wrap gap-1">{feedFilters.map((filter) => <button key={filter} type="button" onClick={() => setFeedFilter(filter)} className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium transition", feedFilter === filter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{filter}</button>)}</div></CardHeader><CardContent className="p-0"><div className="divide-y">{feed.map((event) => <ActivityRow key={event.id} event={event} onOpenJournal={setSelectedJournalId} canViewLedger={can("viewLedger")} />)}</div>{feed.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No {feedFilter.toLowerCase()} events yet. Complete a workflow to create one.</p> : null}</CardContent></Card>
        <div className="space-y-4">
          {can("viewProfit") ? <Card id="margin-analysis" className="scroll-mt-24"><CardHeader className="border-b"><CardTitle className="text-sm">Realized margin</CardTitle><CardDescription>Recognized revenue and actual FIFO COGS</CardDescription></CardHeader><CardContent className="pt-4"><div className="h-[170px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={marginData} layout="vertical" margin={{ left: 12, right: 16 }}><CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} formatter={(value) => [formatMoney(Number(value) * 100), "Amount"]} /><Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={22}>{marginData.map((item, index) => <Cell key={item.name} fill={chartColors[index]} />)}</Bar></BarChart></ResponsiveContainer></div><div className="mt-2 flex items-center justify-between border-t pt-3"><span className="text-xs text-muted-foreground">Gross margin</span><span className="numeric text-lg font-semibold">{formatNumber(metrics.grossMarginPercent ?? 0, 2)}%</span></div></CardContent></Card> : <Card id="margin-analysis"><CardHeader className="border-b"><CardTitle className="text-sm">Realized margin</CardTitle><CardDescription>Restricted by the active role</CardDescription></CardHeader><CardContent className="py-6"><LockKeyhole className="size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Profit data is restricted</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Switch to Super Admin or Accountant to view revenue, COGS, and gross-margin analytics.</p></CardContent></Card>}
          <Card><CardHeader className="border-b"><CardTitle className="text-sm">Workflow shortcuts</CardTitle><CardDescription>Open purchasing tools or compare a landed-cost scenario</CardDescription></CardHeader><CardContent className="space-y-2 pt-4">{can("manageProcurement") ? <><Button asChild={Boolean(inboundOrder)} disabled={!inboundOrder} variant="outline" className="w-full justify-start">{inboundOrder ? <Link href={`/app/procurement?po=${inboundOrder.id}&receive=1`}><PackageCheck /><span className="flex-1 text-left">Allocate {inboundOrder.number} import costs</span><ArrowRight /></Link> : <><PackageCheck /><span className="flex-1 text-left">No open import purchase order</span></>}</Button><Button asChild variant="outline" className="w-full justify-start"><Link href="/app/procurement?create=1"><FilePlus2 /><span className="flex-1 text-left">Create a purchase order</span><ArrowRight /></Link></Button></> : null}<Button asChild variant="outline" className="w-full justify-start"><Link href="/tools/landed-cost-calculator"><CircleDollarSign /><span className="flex-1 text-left">Compare a public scenario</span><ArrowUpRight /></Link></Button></CardContent></Card>
        </div>
      </section>

      <section id="stock-control" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card><CardHeader className="border-b"><CardTitle className="text-sm">Stock control snapshot</CardTitle><CardDescription className="mt-1">Largest on-hand positions after active reservations</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/[0.02] dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">SKU / Warehouse</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">On hand</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Reserved</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">ATP</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">In transit</th></tr></thead><tbody>{stockRows.map((position) => { const product = state.products.find((item) => item.id === position.productId); const warehouse = state.warehouses.find((item) => item.id === position.warehouseId); return <tr key={position.id} className="border-b last:border-0"><td className="px-4 py-3"><Link href={`/app/procurement?sku=${position.productId}`} className="font-mono font-medium text-primary hover:underline">{product?.sku}</Link><p className="mt-1 text-xs text-muted-foreground">{warehouse?.name}</p></td><td className="numeric px-3 py-3 text-right">{position.onHand.toLocaleString()}</td><td className="numeric px-3 py-3 text-right">{position.reserved.toLocaleString()}</td><td className="numeric px-3 py-3 text-right font-medium">{(position.onHand - position.reserved).toLocaleString()}</td><td className="numeric px-3 py-3 text-right text-muted-foreground">{position.inTransit.toLocaleString()}</td></tr>; })}</tbody></table></div></CardContent></Card>
        {can("viewLedger") ? <Card><CardHeader className="border-b"><CardTitle className="text-sm">Ledger integrity</CardTitle><CardDescription>Validated after every operational posting</CardDescription></CardHeader><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Cumulative posted debits</p><p className="numeric mt-2 text-2xl font-semibold">{formatMoney(totalDebits)}</p><dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-xs dark:divide-white/10 dark:border-white/10"><div className="flex justify-between py-3"><dt>Total debits</dt><dd className="numeric font-medium">{formatMoney(totalDebits)}</dd></div><div className="flex justify-between py-3"><dt>Total credits</dt><dd className="numeric font-medium">{formatMoney(totalCredits)}</dd></div><div className="flex justify-between py-3"><dt>FIFO residual value</dt><dd className="numeric">{formatMoney(selectInventoryValuation(state))}</dd></div><div className="flex justify-between py-3"><dt>Inventory Asset balance</dt><dd className="numeric">{formatMoney(inventoryLedgerBalance)}</dd></div></dl><p className="mt-4 flex items-center gap-2 text-xs"><span className="size-1.5 rounded-full bg-emerald-500" />Exact match · <span className="numeric">{formatMoney(inventoryVariance)} variance</span></p></CardContent></Card> : <Card><CardHeader className="border-b"><CardTitle className="text-sm">Ledger integrity</CardTitle><CardDescription>Restricted by the active role</CardDescription></CardHeader><CardContent className="py-6"><LockKeyhole className="size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Financial balances are restricted</p><p className="mt-2 text-xs text-muted-foreground">Operational stock and ATP remain available above.</p></CardContent></Card>}
      </section>

      <Dialog open={Boolean(selectedJournal)} onOpenChange={(open) => { if (!open) setSelectedJournalId(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedJournal?.number}</DialogTitle><DialogDescription>Automatically generated double-entry journal</DialogDescription></DialogHeader>{selectedJournal ? <JournalEntryContent entry={selectedJournal} /> : null}</DialogContent></Dialog>
    </div>
  );
}

function ActivityRow({ event, onOpenJournal, canViewLedger }: { event: ActivityEvent; onOpenJournal: (id: string) => void; canViewLedger: boolean }) {
  const journalId = event.journalEntryIds[0];
  return <article className="p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-medium">{event.title}</h3><span className="font-mono text-xs text-muted-foreground">{event.reference}</span><span className="numeric ml-auto text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{canViewLedger ? event.description : "Financial details are restricted by the active role."}</p>{journalId && canViewLedger ? <Button type="button" variant="ghost" size="sm" onClick={() => onOpenJournal(journalId)} className="mt-2 -ml-2">Inspect journal<ArrowUpRight /></Button> : null}</article>;
}
