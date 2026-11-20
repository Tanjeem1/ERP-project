"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Boxes, CalendarDays, CheckCircle2, Scale, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePermissions } from "@/hooks/use-permissions";
import { simulateFifo } from "@/lib/erp-api";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { InventoryRow } from "@/features/inventory/inventory-table";

export function CostLayerInspector({ row, open, onOpenChange }: { row: InventoryRow | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const products = useErpStore((state) => state.products);
  const warehouses = useErpStore((state) => state.warehouses);
  const costLayers = useErpStore((state) => state.costLayers);
  const inventory = useErpStore((state) => state.inventory);
  const { can } = usePermissions();
  const [method, setMethod] = useState<"fifo" | "wac">("fifo");
  const [quantity, setQuantity] = useState(() => row ? Math.min(150, row.atp) : 0);
  const position = inventory.find((item) => item.id === row?.id);
  const product = products.find((item) => item.id === row?.productId);
  const warehouse = warehouses.find((item) => item.id === row?.warehouseId);
  const layers = costLayers.filter((layer) => layer.productId === row?.productId && layer.warehouseId === row?.warehouseId).sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
  const activeLayers = layers.filter((layer) => layer.remainingQuantity > 0);
  const currentValueMinor = activeLayers.reduce((sum, layer) => sum + layer.remainingValueMinor, 0);
  const onHand = position?.onHand ?? 0;
  const atp = onHand - (position?.reserved ?? 0);
  const wacUnitMinor = onHand === 0 ? 0 : currentValueMinor / onHand;
  const firstLayer = activeLayers[0];
  const validQuantity = Boolean(firstLayer && Number.isInteger(quantity) && quantity > 0 && quantity <= atp);
  const simulationQuery = useQuery({
    queryKey: ["fifo-simulation", row?.productId, row?.warehouseId, quantity, firstLayer?.id],
    queryFn: () => simulateFifo(firstLayer!.id, quantity),
    enabled: open && validQuantity,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const simulation = {
    error: validQuantity ? (simulationQuery.error instanceof Error ? simulationQuery.error.message : null) : `Enter a whole quantity from 1 to ${atp} available units.`,
    consumption: simulationQuery.data ?? null,
    wacCogsMinor: simulationQuery.data?.wacComparisonMinor ?? 0,
  };
  if (!row || !product || !warehouse) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="sm:max-w-2xl"><SheetHeader><div><SheetTitle>{product.sku}</SheetTitle><SheetDescription>{product.name} · {warehouse.name}</SheetDescription></div></SheetHeader><div className="flex-1 space-y-6 p-5">
      <section className="grid grid-cols-4 gap-2">{[["On hand", onHand.toLocaleString()], ["Reserved", (position?.reserved ?? 0).toLocaleString()], ["FIFO value", formatMoney(currentValueMinor)], ["WAC / unit", formatMoney(wacUnitMinor, "USD", { minimumFractionDigits: 4, maximumFractionDigits: 4 })]].map(([label, value]) => <div key={label} className="rounded-lg border bg-secondary/30 p-3"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="numeric mt-2 truncate text-sm font-semibold">{value}</p></div>)}</section>
      <section className="rounded-lg border bg-card"><div className="border-b p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">COGS simulation</h3><p className="mt-1 text-[10px] text-muted-foreground">Compare actual layer relief with weighted average cost</p></div><Scale className="size-4 text-muted-foreground" /></div><div className="mt-4 flex rounded-lg bg-secondary p-1">{(["fifo", "wac"] as const).map((item) => <button key={item} type="button" onClick={() => setMethod(item)} className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition", method === item ? "bg-card" : "text-muted-foreground")}>{item === "fifo" ? "FIFO layers" : "WAC comparison"}</button>)}</div><div className="mt-4 flex items-end gap-3"><div className="flex-1 space-y-2"><Label htmlFor="simulation-quantity">Units sold</Label><Input id="simulation-quantity" type="number" min="1" max={atp} step="1" value={quantity} onChange={(event) => setQuantity(event.target.valueAsNumber)} className="numeric" /></div><Button type="button" variant="outline" size="sm" onClick={() => setQuantity(Math.min(150, atp))}>150 units</Button><Button type="button" variant="outline" size="sm" onClick={() => setQuantity(atp)}>All ATP</Button></div><p className="mt-2 text-[10px] text-muted-foreground">Simulation is capped at {atp} unreserved units. Actual shipments in this demo always post FIFO.</p></div><div className="p-4">{simulation.error ? <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/[0.05] p-3 text-xs text-destructive">{simulation.error}</div> : null}{!simulation.error && method === "fifo" && simulation.consumption ? <><div className="mb-4 flex items-center justify-between rounded-lg bg-emerald-500/[0.06] p-3"><span className="text-xs text-muted-foreground">Exact FIFO COGS</span><span className="numeric text-lg font-semibold text-foreground dark:text-foreground">{formatMoney(simulation.consumption.totalCostMinor)}</span></div><div className="space-y-2">{simulation.consumption.layers.map((layer, index) => <div key={layer.layerId} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border p-3"><div><p className="font-mono text-[10px] font-medium text-primary">Layer {index + 1} · {layer.batchCode}</p><p className="numeric mt-1 text-[10px] text-muted-foreground">{layer.quantity} units × {formatMoney(layer.unitCostMinor)} · {layer.remainingQuantity} remaining</p></div><span className="numeric text-xs font-medium">{formatMoney(layer.valueMinor)}</span></div>)}</div></> : null}{!simulation.error && method === "wac" ? <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.05] p-4"><p className="text-xs text-muted-foreground">Weighted average COGS</p><p className="numeric mt-2 text-2xl font-semibold text-violet-600 dark:text-violet-400">{formatMoney(simulation.wacCogsMinor)}</p><p className="numeric mt-3 text-[10px] text-muted-foreground">{quantity} units × {formatMoney(wacUnitMinor, "USD", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} weighted average</p><div className="mt-3 border-t border-violet-500/15 pt-3 text-[10px] text-muted-foreground">FIFO difference: <span className="numeric font-medium">{formatMoney((simulation.consumption?.totalCostMinor ?? 0) - simulation.wacCogsMinor)}</span></div></div> : null}</div></section>
      <section><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Physical cost layers</h3><Badge variant="secondary">{activeLayers.length} active</Badge></div><div className="mt-3 space-y-3">{layers.map((layer, index) => <article key={layer.id} className={cn("rounded-lg border p-4", layer.remainingQuantity === 0 && "opacity-55")}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-medium">Layer {index + 1} · {layer.batchCode}</p><p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground"><CalendarDays className="size-3" />Received {new Date(layer.receivedAt).toLocaleDateString("en-US")}{layer.expiresAt ? ` · Expires ${new Date(layer.expiresAt).toLocaleDateString("en-US")}` : ""}</p></div><Badge variant={layer.remainingQuantity > 0 ? "success" : "secondary"}>{layer.remainingQuantity > 0 ? "ACTIVE" : "CONSUMED"}</Badge></div><div className="mt-3 grid grid-cols-3 gap-3 text-[10px]"><div><p className="text-muted-foreground">Remaining</p><p className="numeric mt-1 font-medium">{layer.remainingQuantity} / {layer.initialQuantity}</p></div><div><p className="text-muted-foreground">True unit cost</p><p className="numeric mt-1 font-medium">{formatMoney(layer.unitCostMinor, "USD", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</p></div><div><p className="text-muted-foreground">Residual value</p><p className="numeric mt-1 font-medium">{formatMoney(layer.remainingValueMinor)}</p></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${(layer.remainingQuantity / layer.initialQuantity) * 100}%` }} /></div><p className="mt-2 text-[9px] text-muted-foreground">Source: {formatMoney(layer.sourceUnitCostMinor, layer.sourceCurrency)} + {formatMoney(layer.allocatedLandedUnitCostMinor)} allocated landed cost / unit</p></article>)}</div></section>
      <div className="flex items-center gap-2 rounded-lg bg-secondary/45 p-3 text-[10px] text-muted-foreground"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" />Layer quantities and residual values reconcile to {formatMoney(currentValueMinor)} across {formatNumber(onHand)} units.</div>
    </div><SheetFooter>{can("createOrders") ? <Button asChild variant="outline"><Link href={`/app/orders?create=1&product=${row.productId}&warehouse=${row.warehouseId}`}><ShoppingCart />Create sales order<ArrowRight /></Link></Button> : null}<Button asChild><Link href="/app/orders"><Boxes />Open order management<ArrowRight /></Link></Button></SheetFooter></SheetContent></Sheet>
  );
}
