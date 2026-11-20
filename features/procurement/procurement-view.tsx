"use client";

import { ArrowRight, ArrowUpRight, Calculator, FilePlus2, Search } from "lucide-react";
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
import { CreatePurchaseOrderSheet } from "@/features/procurement/create-purchase-order-sheet";
import { GoodsReceiptDialog } from "@/features/procurement/goods-receipt-dialog";
import { LandedCostAllocator } from "@/features/procurement/landed-cost-allocator";
import { PurchaseOrderDetail } from "@/features/procurement/purchase-order-detail";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { PurchaseOrderStatus } from "@/types/erp";

const statusFilters = ["All", "Draft", "Pending Approval", "Approved", "In Transit", "Received"] as const;

export function ProcurementView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useErpStore();
  const { can } = usePermissions();
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("All");
  const [searchOverride, setSearchOverride] = useState<string | null>(null);
  const skuProduct = state.products.find((product) => product.id === searchParams.get("sku"));
  const search = searchOverride ?? skuProduct?.sku ?? "";
  const selectedOrder = state.purchaseOrders.find((order) => order.id === searchParams.get("po"));
  const createOpen = searchParams.get("create") === "1";
  const receiveOpen = Boolean(selectedOrder && searchParams.get("receive") === "1");
  const selectedReceiptId = searchParams.get("grn");
  const filteredOrders = [...state.purchaseOrders].sort((left, right) => right.number.localeCompare(left.number, undefined, { numeric: true })).filter((order) => {
    if (status !== "All" && order.status !== status) return false;
    if (!search.trim()) return true;
    const supplier = state.suppliers.find((item) => item.id === order.supplierId);
    const products = order.lines.map((line) => state.products.find((product) => product.id === line.productId)?.sku).join(" ");
    return `${order.number} ${order.reference} ${supplier?.name ?? ""} ${products}`.toLowerCase().includes(search.toLowerCase());
  });
  const openOrders = state.purchaseOrders.filter((order) => order.status === "Approved" || order.status === "In Transit");
  const openValueMinor = openOrders.flatMap((order) => order.lines.map((line) => Math.round((line.orderedQuantity - line.receivedQuantity) * line.unitCostMinor * order.fxRateToBase))).reduce((sum, value) => sum + value, 0);
  const inboundUnits = state.inventory.reduce((sum, position) => sum + position.inTransit, 0);
  const receivedValueMinor = state.goodsReceipts.reduce((sum, receipt) => sum + receipt.totalInventoryBaseMinor, 0);
  const navigate = (query: string) => router.push(query ? `/app/procurement?${query}` : "/app/procurement", { scroll: false });

  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[480px]" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Purchase orders and inbound inventory" description="Control the complete source-to-receipt lifecycle, capitalize true import costs, and generate balanced accrual accounting from the same goods receipt." actions={<><Button asChild variant="outline"><Link href="/tools/landed-cost-calculator"><Calculator />Free calculator<ArrowUpRight /></Link></Button>{can("manageProcurement") ? <Button onClick={() => navigate("create=1")}><FilePlus2 />New purchase order</Button> : null}</>} />
      <section aria-label="Procurement KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Open order value", value: formatMoney(openValueMinor), detail: `${openOrders.length} approved or in-transit POs` },
        { label: "Units in transit", value: inboundUnits.toLocaleString(), detail: "Across receiving warehouses" },
        { label: "Awaiting receipt", value: openOrders.length.toString(), detail: "Ready for GRN allocation" },
        { label: "Received inventory", value: formatMoney(receivedValueMinor), detail: `${state.goodsReceipts.length} posted goods receipts` },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>

      {openOrders[0] ? (() => { const order = openOrders[0]; const outstanding = order.lines.reduce((sum, line) => sum + line.orderedQuantity - line.receivedQuantity, 0); return <section className="rounded-lg border border-slate-200 bg-card p-4 dark:border-white/10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="text-sm font-semibold tracking-tight">{order.number} is ready for landed cost allocation</h2><Badge variant="secondary">{order.lines.length} SKUs · {order.currency}</Badge></div><p className="numeric mt-2 text-xs leading-5 text-muted-foreground">Receive {outstanding.toLocaleString()} units at {state.warehouses.find((warehouse) => warehouse.id === order.destinationWarehouseId)?.name}, then allocate freight, customs, handling, and insurance.</p></div>{can("manageProcurement") ? <Button onClick={() => navigate(`po=${order.id}&receive=1`)}>Open allocator<ArrowRight /></Button> : null}</div></section>; })() : null}

      <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="purchase-orders-heading"><div className="border-b p-4 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h2 id="purchase-orders-heading" className="text-sm font-semibold">Purchase order lifecycle</h2><p className="mt-1 text-[11px] text-muted-foreground">Draft → Approved → In Transit → Received</p></div><div className="relative w-full xl:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search purchase orders" placeholder="Search PO, supplier, reference, or SKU…" value={search} onChange={(event) => setSearchOverride(event.target.value)} className="h-9 pl-9 text-xs" /></div></div><div className="mt-4 flex flex-wrap gap-1">{statusFilters.map((filter) => { const count = filter === "All" ? state.purchaseOrders.length : state.purchaseOrders.filter((order) => order.status === filter).length; return <button key={filter} type="button" onClick={() => setStatus(filter)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition", status === filter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{filter}<span className={cn("numeric rounded px-1.5 py-0.5 text-[9px]", status === filter ? "bg-white/15" : "bg-secondary")}>{count}</span></button>; })}</div></div><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1060px] text-left text-xs"><caption className="sr-only">Purchase orders filtered by {status}</caption><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-5 py-3 font-semibold uppercase tracking-wider">Purchase order</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Supplier</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Destination</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Status</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Lines</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Base value</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Received</th><th className="px-5 py-3 text-right font-semibold uppercase tracking-wider">Action</th></tr></thead><tbody>{filteredOrders.map((order) => { const supplier = state.suppliers.find((item) => item.id === order.supplierId); const warehouse = state.warehouses.find((item) => item.id === order.destinationWarehouseId); const total = order.lines.reduce((sum, line) => sum + Math.round(line.orderedQuantity * line.unitCostMinor * order.fxRateToBase), 0); const ordered = order.lines.reduce((sum, line) => sum + line.orderedQuantity, 0); const received = order.lines.reduce((sum, line) => sum + line.receivedQuantity, 0); return <tr key={order.id} className="border-b transition last:border-0 hover:bg-accent/35"><td className="px-5 py-4"><Link href={`/app/procurement?po=${order.id}`} className="font-mono font-semibold text-primary hover:underline">{order.number}</Link><p className="mt-1 text-[10px] text-muted-foreground">{order.reference}</p></td><td className="max-w-[210px] px-3 py-4"><p className="truncate">{supplier?.name}</p><p className="numeric mt-1 text-[10px] text-muted-foreground">{order.currency} @ {order.fxRateToBase}</p></td><td className="max-w-[190px] px-3 py-4"><p className="truncate">{warehouse?.name}</p><p className="mt-1 text-[10px] text-muted-foreground">ETA {new Date(order.expectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p></td><td className="px-3 py-4"><StatusBadge status={order.status as PurchaseOrderStatus} /></td><td className="numeric px-3 py-4 text-right">{order.lines.length}</td><td className="numeric px-3 py-4 text-right font-medium">{formatMoney(total)}</td><td className="px-3 py-4 text-right"><p className="numeric">{ordered ? Math.round((received / ordered) * 100) : 0}%</p><div className="ml-auto mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${ordered ? (received / ordered) * 100 : 0}%` }} /></div></td><td className="px-5 py-4 text-right"><Button variant="outline" size="sm" onClick={() => navigate(`po=${order.id}`)}>View<ArrowRight /></Button></td></tr>; })}</tbody></table>{filteredOrders.length === 0 ? <div className="p-12 text-center"><Search className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No purchase orders match these filters</p><Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearchOverride(""); setStatus("All"); }}>Clear filters</Button></div> : null}</div><div className="flex flex-col gap-2 border-t bg-secondary/20 px-5 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Showing {filteredOrders.length} of {state.purchaseOrders.length} purchase orders</span><span>All values converted to {state.organization.baseCurrency} · numeric columns use exact minor-unit totals</span></div></section>

      {can("manageProcurement") ? <CreatePurchaseOrderSheet key={createOpen ? "create-purchase-order" : "closed-purchase-order"} open={createOpen} onOpenChange={(open) => { if (!open) navigate(""); }} onCreated={(order) => navigate(`po=${order.id}`)} /> : null}
      {selectedOrder ? <Sheet open={!receiveOpen} onOpenChange={(open) => { if (!open) navigate(""); }}><SheetContent className="sm:max-w-2xl"><PurchaseOrderDetail order={selectedOrder} onReceive={() => navigate(`po=${selectedOrder.id}&receive=1`)} onViewReceipt={(receiptId) => navigate(`grn=${receiptId}`)} /></SheetContent></Sheet> : null}
      {selectedOrder ? <LandedCostAllocator key={selectedOrder.id} order={selectedOrder} open={receiveOpen} onOpenChange={(open) => { if (!open) navigate(`po=${selectedOrder.id}`); }} onPosted={(result) => navigate(`grn=${result.goodsReceiptId}`)} /> : null}
      <GoodsReceiptDialog receiptId={selectedReceiptId} open={Boolean(selectedReceiptId)} onOpenChange={(open) => { if (!open) navigate(""); }} />
    </div>
  );
}
