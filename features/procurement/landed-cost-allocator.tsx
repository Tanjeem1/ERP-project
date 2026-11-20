"use client";

import { Boxes, CheckCircle2, Container, DollarSign, PackageCheck, Scale, Weight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/use-permissions";
import { toMinor } from "@/lib/erp-math";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import { useErpStore, type PostGoodsReceiptResult } from "@/store/useErpStore";
import type { CurrencyCode, LandedCostAllocationMethod, PostGoodsReceiptInput, PurchaseOrder } from "@/types/erp";

type CostField = "freight" | "customs" | "handling" | "insurance";

const methods: Array<{ value: LandedCostAllocationMethod; label: string; detail: string; icon: typeof Weight }> = [
  { value: "weight", label: "By weight", detail: "kg", icon: Weight },
  { value: "volume", label: "By volume", detail: "CBM", icon: Container },
  { value: "value", label: "By value", detail: "USD", icon: DollarSign },
];

export function LandedCostAllocator({ order, open, onOpenChange, onPosted }: { order: PurchaseOrder; open: boolean; onOpenChange: (open: boolean) => void; onPosted: (result: PostGoodsReceiptResult) => void }) {
  const products = useErpStore((state) => state.products);
  const warehouses = useErpStore((state) => state.warehouses);
  const suppliers = useErpStore((state) => state.suppliers);
  const baseCurrency = useErpStore((state) => state.organization.baseCurrency);
  const previewLandedCosts = useErpStore((state) => state.previewLandedCosts);
  const postGoodsReceipt = useErpStore((state) => state.postGoodsReceipt);
  const { can } = usePermissions();
  const [method, setMethod] = useState<LandedCostAllocationMethod>("weight");
  const [costs, setCosts] = useState<Record<CostField, number>>({ freight: 1200.13, customs: 450.07, handling: 150.01, insurance: 50.03 });
  const [costCurrency, setCostCurrency] = useState<CurrencyCode>(baseCurrency);
  const [costFxRate, setCostFxRate] = useState(1);
  const [posting, setPosting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((line) => [line.id, line.orderedQuantity - line.receivedQuantity])));
  const supplier = suppliers.find((item) => item.id === order.supplierId);
  const warehouse = warehouses.find((item) => item.id === order.destinationWarehouseId);
  const request: PostGoodsReceiptInput = {
    purchaseOrderId: order.id,
    warehouseId: order.destinationWarehouseId,
    allocationMethod: method,
    costs: { freightMinor: toMinor(costs.freight), customsMinor: toMinor(costs.customs), portHandlingMinor: toMinor(costs.handling), insuranceMinor: toMinor(costs.insurance), currency: costCurrency, fxRateToBase: costFxRate },
    lines: order.lines.map((line) => ({ purchaseOrderLineId: line.id, quantity: quantities[line.id] ?? 0 })).filter((line) => line.quantity > 0),
  };
  const previewQuery = useQuery({
    queryKey: ["landed-cost-preview", request],
    queryFn: () => previewLandedCosts(request),
    enabled: open && request.lines.length > 0,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const calculation = {
    preview: previewQuery.data ?? null,
    error: previewQuery.error instanceof Error ? previewQuery.error.message : null,
    isFetching: previewQuery.isFetching,
  };
  const post = async () => {
    if (posting || !calculation.preview) return;
    setPosting(true);
    try {
      const result = await postGoodsReceipt(request);
      toast.success("GRN and accounting posted", { description: `${result.goodsReceiptId} added ${formatMoney(result.inventoryValueBaseMinor)} to Inventory Asset.` });
      onPosted(result);
    } catch (error) { toast.error("Goods receipt was not posted", { description: error instanceof Error ? error.message : "Unknown error" }); } finally { setPosting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex h-[92vh] max-h-[92vh] max-w-[1500px] flex-col overflow-hidden p-0"><DialogHeader className="shrink-0 py-4"><DialogTitle>Landed Cost Allocator</DialogTitle><DialogDescription>{order.number} · {supplier?.name} · {warehouse?.name}</DialogDescription></DialogHeader><div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[360px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="scrollbar-thin space-y-6 border-r p-5 lg:overflow-y-auto"><section><div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Goods receipt quantities</h3><span className="font-mono text-[9px] text-muted-foreground">{order.currency} → USD {order.fxRateToBase}</span></div><div className="mt-3 space-y-3">{order.lines.map((line) => { const product = products.find((item) => item.id === line.productId); const outstanding = line.orderedQuantity - line.receivedQuantity; return <article key={line.id} className="rounded-lg border bg-secondary/25 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-medium text-primary">{product?.sku}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{product?.name}</p></div><span className="text-[9px] text-muted-foreground">{outstanding} open</span></div><div className="mt-3 grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor={`receive-${line.id}`} className="text-[10px]">Receive qty</Label><Input id={`receive-${line.id}`} type="number" min="0" max={outstanding} step="1" value={quantities[line.id]} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.valueAsNumber }))} className="numeric h-8 text-right" /></div><div><p className="text-[10px] text-muted-foreground">Source unit cost</p><p className="numeric mt-2 text-xs font-medium">{formatMoney(line.unitCostMinor, order.currency)}</p></div></div><div className="mt-2 flex justify-between text-[9px] text-muted-foreground"><span>{product?.weightKgPerUnit} kg / unit</span><span>{product?.volumeCbmPerUnit} CBM / unit</span></div></article>; })}</div></section>
      <section><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Import charges</h3><div className="mt-3 grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label htmlFor="cost-currency" className="text-[10px]">Charge currency</Label><select id="cost-currency" value={costCurrency} onChange={(event) => { const value = event.target.value as CurrencyCode; setCostCurrency(value); setCostFxRate(value === baseCurrency ? 1 : 0); }} className="h-8 w-full rounded-md border bg-card px-2 text-xs"><option>USD</option><option>EUR</option><option>GBP</option><option>CNY</option><option>AED</option><option>INR</option></select></div><div className="space-y-1.5"><Label htmlFor="cost-fx" className="text-[10px]">FX to {baseCurrency}</Label><Input id="cost-fx" type="number" min="0.000001" step="0.0001" required value={costFxRate} disabled={costCurrency === baseCurrency} onChange={(event) => setCostFxRate(event.target.valueAsNumber)} className="numeric h-8 text-right" /></div></div><div className="mt-3 space-y-3">{(["freight", "customs", "handling", "insurance"] as CostField[]).map((key) => <div key={key} className="space-y-1.5"><Label htmlFor={`cost-${key}`} className="text-[10px]">{{ freight: "Freight", customs: "Customs duties", handling: "Port handling", insurance: "Insurance" }[key]}</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{costCurrency}</span><Input id={`cost-${key}`} type="number" min="0" step="0.01" value={costs[key]} onChange={(event) => setCosts((current) => ({ ...current, [key]: event.target.valueAsNumber }))} className="numeric h-9 pl-12 text-right" /></div></div>)}</div></section>
      <fieldset><legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allocation basis</legend><div className="mt-3 space-y-2">{methods.map((item) => <button key={item.value} type="button" aria-pressed={method === item.value} onClick={() => setMethod(item.value)} className={cn("flex w-full items-center gap-3 rounded-lg border p-3 text-left transition", method === item.value ? "border-primary bg-primary/[0.06]" : "hover:border-primary/35")}><item.icon className={cn("size-4", method === item.value ? "text-primary" : "text-muted-foreground")} /><span className="text-xs font-medium">{item.label}</span><span className="ml-auto font-mono text-[9px] text-muted-foreground">{item.detail}</span></button>)}</div></fieldset></aside>
      <section className="scrollbar-thin min-w-0 bg-secondary/30 p-5 lg:overflow-y-auto"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">Live true-cost preview</h3><p className="mt-1 text-[10px] text-muted-foreground">Independent charge allocation · exact remainder distribution · four-decimal unit costs</p></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3" />Atomic posting</span></div>
      {calculation.error ? <div role="alert" className="mt-5 rounded-lg border border-destructive/25 bg-destructive/[0.06] p-4 text-sm text-destructive">{calculation.error}</div> : null}
      {calculation.preview ? <><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-card p-4"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Base goods value</p><p className="numeric mt-2 text-xl font-semibold">{formatMoney(calculation.preview.totalGoodsBaseMinor)}</p></div><div className="rounded-lg border bg-card p-4"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Capitalized charges</p><p className="numeric mt-2 text-xl font-semibold text-primary">+{formatMoney(calculation.preview.totalAllocatedCostMinor)}</p></div><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Inventory Asset</p><p className="numeric mt-2 text-xl font-semibold text-foreground dark:text-foreground">{formatMoney(calculation.preview.totalInventoryBaseMinor)}</p></div></div><div className="scrollbar-thin mt-4 overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[900px] text-left text-xs"><caption className="sr-only">True landed unit cost preview by SKU</caption><thead className="bg-secondary/45 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">SKU</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Qty</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Base goods</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Basis share</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Allocated</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">True unit cost</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Total value</th></tr></thead><tbody>{calculation.preview.lines.map((line) => <tr key={line.purchaseOrderLineId} className="border-t"><th scope="row" className="px-4 py-3"><span className="font-mono font-medium text-primary">{line.sku}</span><p className="mt-1 max-w-[180px] truncate text-[9px] font-normal text-muted-foreground">{line.productName}</p></th><td className="numeric px-3 py-3 text-right">{line.quantity}</td><td className="numeric px-3 py-3 text-right">{formatMoney(line.baseGoodsCostMinor)}</td><td className="numeric px-3 py-3 text-right text-muted-foreground">{formatNumber(line.basisShare * 100, 2)}%</td><td className="numeric px-3 py-3 text-right text-primary">+{formatMoney(line.allocatedLandedCostMinor)}</td><td className="numeric px-3 py-3 text-right font-semibold">{formatMoney(line.trueUnitCostMinor, "USD", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td><td className="numeric px-3 py-3 text-right">{formatMoney(line.trueTotalCostMinor)}</td></tr>)}</tbody></table></div><div className="mt-4 grid gap-4 xl:grid-cols-2"><article className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2"><Boxes className="size-4 text-primary" /><h4 className="text-xs font-semibold">Warehouse outcome</h4></div><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">Destination</dt><dd>{warehouse?.code}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Receipt lines</dt><dd className="numeric">{calculation.preview.lines.length}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Units received</dt><dd className="numeric">{calculation.preview.lines.reduce((sum, line) => sum + line.quantity, 0)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">New FIFO layers</dt><dd className="numeric">{calculation.preview.lines.length}</dd></div></dl></article><article className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2"><Scale className="size-4 text-primary" /><h4 className="text-xs font-semibold">Balanced journal preview</h4></div><div className="mt-3 space-y-2 font-mono text-[10px]"><div className="flex justify-between gap-3"><span>DR 103000 · Inventory Asset</span><span>{formatMoney(calculation.preview.totalInventoryBaseMinor)}</span></div><div className="flex justify-between gap-3"><span>CR 201000 · Accrued Payables</span><span>{formatMoney(calculation.preview.totalGoodsBaseMinor)}</span></div>{calculation.preview.totalAllocatedCostMinor > 0 ? <div className="flex justify-between gap-3"><span>CR 202000 · Freight Clearing</span><span>{formatMoney(calculation.preview.totalAllocatedCostMinor)}</span></div> : null}</div><div className="mt-3 flex items-center gap-2 border-t pt-3 text-[10px] text-foreground dark:text-foreground"><CheckCircle2 className="size-3.5" />{formatMoney(calculation.preview.totalDebitMinor)} debits = {formatMoney(calculation.preview.totalCreditMinor)} credits</div></article></div></> : null}</section>
      </div><DialogFooter className="shrink-0 items-center py-4"><p className="mr-auto hidden text-[10px] text-muted-foreground sm:block">Posting updates stock, FIFO layers, valuation, inbound quantities, activity, and the general ledger together.</p><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={() => void post()} disabled={!calculation.preview || calculation.isFetching || posting || !can("manageProcurement")} title={!can("manageProcurement") ? "Requires an operational procurement role" : undefined}><PackageCheck />{posting ? "Posting receipt…" : "Post GRN & Generate Accounting"}</Button></DialogFooter></DialogContent></Dialog>
  );
}
