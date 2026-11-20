"use client";

import { ArrowRight, PackageCheck, Search, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { StatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateSalesOrderSheet } from "@/features/orders/create-sales-order-sheet";
import { InvoiceDialog } from "@/features/orders/invoice-dialog";
import { OrderDetail } from "@/features/orders/order-detail";
import { ShipOrderDialog } from "@/features/orders/ship-order-dialog";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatMoney } from "@/lib/utils";
import { selectErpMetrics, useErpStore } from "@/store/useErpStore";
import type { OrderChannel } from "@/types/erp";

const channelFilters = ["All", "B2B Wholesale", "Shopify Sync", "Direct Import"] as const;
const channelStyles: Record<OrderChannel, string> = { "B2B Wholesale": "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300", "Shopify Sync": "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300", "Direct Import": "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300", "Point of Sale": "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" };

export function OrdersView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useErpStore();
  const { can } = usePermissions();
  const [channel, setChannel] = useState<(typeof channelFilters)[number]>("All");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const selectedOrder = state.orders.find((order) => order.id === searchParams.get("order"));
  const shipOrder = state.orders.find((order) => order.id === searchParams.get("ship"));
  const selectedInvoiceId = searchParams.get("invoice");
  const createOpen = searchParams.get("create") === "1";
  const metrics = selectErpMetrics(state);
  const filteredOrders = [...state.orders].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).filter((order) => {
    if (channel !== "All" && order.channel !== channel) return false;
    if (status !== "All" && order.status !== status) return false;
    if (!search.trim()) return true;
    const customer = state.customers.find((item) => item.id === order.customerId);
    const products = order.lines.map((line) => state.products.find((product) => product.id === line.productId)?.sku).join(" ");
    return `${order.number} ${order.reference} ${customer?.name} ${products}`.toLowerCase().includes(search.toLowerCase());
  });
  const openOrders = state.orders.filter((order) => order.status === "Order Placed" || order.status === "Pick & Pack");
  const lockedUnits = state.reservations.filter((reservation) => reservation.status === "Active" && state.orders.some((order) => order.lines.some((line) => line.reservationId === reservation.id))).reduce((sum, reservation) => sum + reservation.quantity, 0);
  const readyOrder = state.orders.find((order) => order.status === "Pick & Pack") ?? state.orders.find((order) => order.status === "Order Placed");
  const navigate = (query: string) => router.push(query ? `/app/orders?${query}` : "/app/orders", { scroll: false });

  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[520px]" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Orders, fulfillment, and invoicing" description="Reserve inventory at order capture, fulfill from the oldest warehouse layers, and turn every shipment into a tax invoice and balanced financial entries." actions={<><Button asChild variant="outline"><Link href="/app/inventory"><PackageCheck />Inspect inventory</Link></Button>{can("createOrders") ? <Button onClick={() => navigate("create=1")}><ShoppingCart />New sales order</Button> : null}</>} />
      <section aria-label="Order KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Open orders", value: openOrders.length.toString(), detail: "Awaiting fulfillment or shipment" },
        { label: "Order-locked units", value: lockedUnits.toLocaleString(), detail: `${state.reservations.filter((item) => item.status === "Active").length} active channel locks` },
        { label: "Recognized revenue", value: can("viewProfit") ? formatMoney(metrics.realizedRevenueMinor ?? 0) : "Restricted", detail: can("viewProfit") ? `${state.invoices.length} issued tax invoices` : "Role permission required" },
        { label: "Realized gross margin", value: can("viewProfit") ? `${(metrics.grossMarginPercent ?? 0).toFixed(2)}%` : "Restricted", detail: can("viewProfit") ? `${formatMoney((metrics.realizedRevenueMinor ?? 0) - (metrics.realizedCogsMinor ?? 0))} after actual FIFO COGS` : "Role permission required" },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>

      {readyOrder ? <section className="rounded-lg border border-slate-200 bg-card p-4 dark:border-white/10"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex-1"><h2 className="text-sm font-semibold tracking-tight">{readyOrder.number} is {readyOrder.status === "Pick & Pack" ? "picked and ready to ship" : "placed and ready for pick and pack"}</h2><p className="numeric mt-2 text-xs leading-5 text-muted-foreground">{readyOrder.channel} · {readyOrder.lines.reduce((sum, line) => sum + line.quantity, 0).toLocaleString()} units · {state.warehouses.find((warehouse) => warehouse.id === readyOrder.warehouseId)?.name}. Confirm shipment to generate a tax invoice and two balanced journals.</p></div>{can("fulfillOrders") ? <Button onClick={() => navigate(`ship=${readyOrder.id}`)}>Review shipment<ArrowRight /></Button> : <Badge variant="secondary">Fulfillment restricted</Badge>}</div></section> : null}

      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="orders-grid-heading"><div className="border-b p-4 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h2 id="orders-grid-heading" className="text-sm font-semibold">Unified order grid</h2><p className="mt-1 text-[10px] text-muted-foreground">Every channel shares the same ATP and FIFO transaction engine</p></div><div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Filter orders by status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-card px-3 text-xs"><option>All</option><option>Pending Approval</option><option>Order Placed</option><option>Pick & Pack</option><option>Invoiced</option><option>Cancelled</option></select><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search orders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, reference, SKU…" className="h-9 pl-9 text-xs sm:w-72" /></div></div></div><div className="mt-4 flex flex-wrap gap-1">{channelFilters.map((filter) => <button key={filter} type="button" onClick={() => setChannel(filter)} className={cn("rounded-md px-3 py-1.5 text-[11px] font-medium transition", channel === filter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{filter}</button>)}</div></div><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><caption className="sr-only">Omnichannel sales orders</caption><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-5 py-3 font-semibold uppercase tracking-wider">Order</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Customer</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Channel</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Warehouse</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Fulfillment</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Units</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Total incl. tax</th><th className="px-5 py-3 text-right font-semibold uppercase tracking-wider">Action</th></tr></thead><tbody>{filteredOrders.map((order) => { const customer = state.customers.find((item) => item.id === order.customerId); const warehouse = state.warehouses.find((item) => item.id === order.warehouseId); const subtotal = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0); const tax = Math.round(subtotal * (customer?.taxRateBasisPoints ?? 0) / 10000); const units = order.lines.reduce((sum, line) => sum + line.quantity, 0); return <tr key={order.id} className="border-b transition last:border-0 hover:bg-accent/35"><td className="px-5 py-4"><Link href={`/app/orders?order=${order.id}`} className="font-mono font-semibold text-primary hover:underline">{order.number}</Link><p className="mt-1 text-[10px] text-muted-foreground">{order.reference}</p></td><td className="max-w-[200px] px-3 py-4"><p className="truncate">{customer?.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{customer?.paymentTermsDays}-day terms</p></td><td className="px-3 py-4"><Badge variant="outline" className={channelStyles[order.channel]}>{order.channel}</Badge></td><td className="max-w-[180px] px-3 py-4"><p className="truncate">{warehouse?.name}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{warehouse?.code}</p></td><td className="px-3 py-4"><StatusBadge status={order.status} /></td><td className="numeric px-3 py-4 text-right">{units}</td><td className="numeric px-3 py-4 text-right font-medium">{formatMoney(Math.round((subtotal + tax) * order.fxRateToBase))}</td><td className="px-5 py-4"><div className="flex justify-end gap-2">{(order.status === "Order Placed" || order.status === "Pick & Pack") && can("fulfillOrders") ? <Button variant="outline" size="sm" onClick={() => navigate(`ship=${order.id}`)}>Ship</Button> : null}{order.invoiceId ? <Button variant="outline" size="sm" onClick={() => navigate(`invoice=${order.invoiceId}`)}>Invoice</Button> : null}<Button variant="ghost" size="sm" onClick={() => navigate(`order=${order.id}`)}>View<ArrowRight /></Button></div></td></tr>; })}</tbody></table>{filteredOrders.length === 0 ? <div className="p-12 text-center"><Search className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No orders match these filters</p><Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(""); setStatus("All"); setChannel("All"); }}>Clear filters</Button></div> : null}</div><div className="flex flex-col gap-2 border-t bg-secondary/20 px-5 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Showing {filteredOrders.length} of {state.orders.length} orders</span><span>Order totals converted to {state.organization.baseCurrency} · tax calculated from customer terms</span></div></section>

      {can("createOrders") ? <CreateSalesOrderSheet key={`${createOpen}-${searchParams.get("product") ?? ""}-${searchParams.get("warehouse") ?? ""}`} open={createOpen} onOpenChange={(open) => { if (!open) navigate(""); }} onCreated={(order) => navigate(`order=${order.id}`)} initialProductId={searchParams.get("product") ?? undefined} initialWarehouseId={searchParams.get("warehouse") ?? undefined} /> : null}
      {selectedOrder ? <Sheet open={!shipOrder} onOpenChange={(open) => { if (!open) navigate(""); }}><SheetContent className="sm:max-w-2xl"><OrderDetail order={selectedOrder} onShip={() => navigate(`ship=${selectedOrder.id}`)} onInvoice={(invoiceId) => navigate(`invoice=${invoiceId}`)} /></SheetContent></Sheet> : null}
      {shipOrder && can("fulfillOrders") ? <ShipOrderDialog order={shipOrder} open onOpenChange={(open) => { if (!open) navigate(""); }} onShipped={(result) => navigate(`invoice=${result.invoiceId}`)} /> : null}
      <InvoiceDialog invoiceId={selectedInvoiceId} open={Boolean(selectedInvoiceId)} onOpenChange={(open) => { if (!open) navigate(""); }} />
    </div>
  );
}
