"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consumeFifoLayers, useErpStore } from "@/store/useErpStore";
import type { InventoryRow } from "@/features/inventory/inventory-table";
import { formatMoney } from "@/lib/utils";

export function StockTransferDialog({ open, onOpenChange, initialRow }: { open: boolean; onOpenChange: (open: boolean) => void; initialRow: InventoryRow | null }) {
  const products = useErpStore((state) => state.products);
  const warehouses = useErpStore((state) => state.warehouses);
  const inventory = useErpStore((state) => state.inventory);
  const costLayers = useErpStore((state) => state.costLayers);
  const transferStock = useErpStore((state) => state.transferStock);
  const [sourceWarehouseId, setSourceWarehouseId] = useState(initialRow?.warehouseId ?? warehouses[0]?.id ?? "");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(warehouses.find((warehouse) => warehouse.id !== (initialRow?.warehouseId ?? warehouses[0]?.id))?.id ?? "");
  const [productId, setProductId] = useState(initialRow?.productId ?? products[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sourcePosition = inventory.find((position) => position.productId === productId && position.warehouseId === sourceWarehouseId);
  const available = (sourcePosition?.onHand ?? 0) - (sourcePosition?.reserved ?? 0);
  const preview = useMemo(() => {
    try {
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > available) return { valueMinor: 0, error: `Enter a whole quantity from 1 to ${available}.` };
      const consumption = consumeFifoLayers(costLayers, productId, sourceWarehouseId, quantity);
      return { valueMinor: consumption.totalCostMinor, error: null };
    } catch (caught) {
      return { valueMinor: 0, error: caught instanceof Error ? caught.message : "Unable to calculate transfer cost." };
    }
  }, [quantity, available, costLayers, productId, sourceWarehouseId]);
  const submit = async () => {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const transfer = await transferStock({ sourceWarehouseId, destinationWarehouseId, lines: [{ productId, quantity }] });
      toast.success(`${transfer.number} completed`, { description: `${quantity} units moved without changing total inventory valuation.` });
      onOpenChange(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to transfer this stock."); } finally { setPending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Inter-warehouse stock transfer</DialogTitle><DialogDescription>Move unreserved units while preserving original FIFO age, batch, and residual cost.</DialogDescription></DialogHeader><div className="space-y-5 p-5"><div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3"><div className="space-y-2"><Label htmlFor="transfer-source">Source warehouse</Label><select id="transfer-source" value={sourceWarehouseId} onChange={(event) => setSourceWarehouseId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-2 text-xs">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div><ArrowRight className="mb-3 size-4 text-muted-foreground" /><div className="space-y-2"><Label htmlFor="transfer-destination">Destination</Label><select id="transfer-destination" value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-2 text-xs">{warehouses.filter((warehouse) => warehouse.id !== sourceWarehouseId).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div></div><div className="space-y-2"><Label htmlFor="transfer-product">SKU</Label><select id="transfer-product" value={productId} onChange={(event) => setProductId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-xs">{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="transfer-quantity">Quantity</Label><Input id="transfer-quantity" type="number" min="1" max={available} step="1" value={quantity} onChange={(event) => setQuantity(event.target.valueAsNumber)} className="numeric" /></div><div className="rounded-lg border bg-secondary/30 p-3"><p className="text-[10px] text-muted-foreground">Unreserved at source</p><p className="numeric mt-1 text-sm font-semibold">{available.toLocaleString()}</p></div></div>{preview.error ? <div role="alert" className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-700 dark:text-amber-400">{preview.error}</div> : <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" />FIFO value preserved</div><p className="numeric mt-2 text-xl font-semibold">{formatMoney(preview.valueMinor)}</p><p className="mt-1 text-[10px] text-muted-foreground">This value moves between warehouses. Total Inventory Asset does not change.</p></div>}{error ? <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-xs text-destructive">{error}</div> : null}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={Boolean(preview.error) || sourceWarehouseId === destinationWarehouseId}>Complete transfer<ArrowRight /></Button></DialogFooter></DialogContent></Dialog>
  );
}
