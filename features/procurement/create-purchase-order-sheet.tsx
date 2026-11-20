"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useErpStore } from "@/store/useErpStore";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type PurchaseOrder } from "@/types/erp";

interface DraftLine {
  id: string;
  productId: string;
  quantity: number;
  unitCost: number;
}

export function CreatePurchaseOrderSheet({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (order: PurchaseOrder) => void }) {
  const suppliers = useErpStore((state) => state.suppliers);
  const warehouses = useErpStore((state) => state.warehouses);
  const products = useErpStore((state) => state.products);
  const purchaseOrders = useErpStore((state) => state.purchaseOrders);
  const createPurchaseOrder = useErpStore((state) => state.createPurchaseOrder);
  const baseCurrency = useErpStore((state) => state.organization.baseCurrency);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(suppliers[0]?.currency ?? baseCurrency);
  const [fxRate, setFxRate] = useState(suppliers[0]?.currency === baseCurrency ? 1 : 0);
  const [expectedAt, setExpectedAt] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(products[0] ? [{ id: "draft-line-1", productId: products[0].id, quantity: 1, unitCost: (products[0].costPriceMinor ?? products[0].salesPriceMinor) / 100 }] : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canSubmit = Boolean(supplierId && warehouseId && reference.trim() && lines.length > 0 && fxRate > 0 && lines.every((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isFinite(line.unitCost) && line.unitCost >= 0));

  const defaultCost = (productId: string) => {
    const historical = purchaseOrders.flatMap((order) => order.lines).find((line) => line.productId === productId);
    const product = products.find((item) => item.id === productId);
    return historical ? historical.unitCostMinor / 100 : (product?.costPriceMinor ?? product?.salesPriceMinor ?? 1000) / 100;
  };
  const updateLine = (id: string, update: Partial<DraftLine>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...update } : line));
  const addLine = () => {
    const product = products.find((item) => !lines.some((line) => line.productId === item.id)) ?? products[0];
    if (!product || lines.length >= products.length) return;
    setLines((current) => [...current, { id: `draft-${Date.now()}`, productId: product.id, quantity: 100, unitCost: defaultCost(product.id) }]);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const order = await createPurchaseOrder({ supplierId, destinationWarehouseId: warehouseId, currency, fxRateToBase: fxRate, expectedAt: new Date(`${expectedAt}T00:00:00.000Z`).toISOString(), reference, lines: lines.map((line) => ({ productId: line.productId, orderedQuantity: line.quantity, unitCostMinor: Math.round(line.unitCost * 100) })) });
      toast.success(`${order.number} created`, { description: order.status === "Pending Approval" ? "The purchase order requires authorization before supplier execution." : "The purchase order is saved as Draft and ready for approval." });
      onCreated(order);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create this purchase order.");
    } finally { setPending(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="sm:max-w-2xl"><SheetHeader><SheetTitle>Create purchase order</SheetTitle><SheetDescription>Define supplier terms, destination, and exact source-currency costs. The new PO starts in Draft.</SheetDescription></SheetHeader><form id="create-purchase-order" onSubmit={submit} className="flex-1 space-y-6 p-5">
      <section><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier and destination</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="po-supplier">Supplier</Label><select id="po-supplier" value={supplierId} onChange={(event) => { const supplier = suppliers.find((item) => item.id === event.target.value); setSupplierId(event.target.value); if (supplier) { setCurrency(supplier.currency); setFxRate(supplier.currency === baseCurrency ? 1 : 0); } }} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="po-warehouse">Receiving warehouse</Label><select id="po-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="po-currency">PO currency</Label><select id="po-currency" value={currency} onChange={(event) => { const value = event.target.value as CurrencyCode; setCurrency(value); setFxRate(value === baseCurrency ? 1 : 0); }} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></div><div className="space-y-2"><Label htmlFor="po-fx">FX rate to {baseCurrency}</Label><Input id="po-fx" type="number" min="0.000001" step="0.0001" required value={fxRate} disabled={currency === baseCurrency} onChange={(event) => setFxRate(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2"><Label htmlFor="po-expected">Expected arrival</Label><Input id="po-expected" type="date" min={new Date().toISOString().slice(0, 10)} required value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="po-reference">Supplier reference</Label><Input id="po-reference" required maxLength={60} value={reference} onChange={(event) => setReference(event.target.value)} /></div></div></section>
      <section><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Purchase lines</h3><p className="mt-1 text-[11px] text-muted-foreground">Each SKU can appear once. Costs use {currency} minor units on posting.</p></div><Button type="button" variant="outline" size="sm" onClick={addLine} disabled={lines.length >= products.length}><Plus />Add line</Button></div><div className="mt-4 space-y-3">{lines.map((line, index) => { const product = products.find((item) => item.id === line.productId); return <article key={line.id} className="rounded-lg border bg-secondary/25 p-4"><div className="flex items-center gap-3"><span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><div className="flex-1"><Label htmlFor={`${line.id}-product`} className="sr-only">Product</Label><select id={`${line.id}-product`} value={line.productId} onChange={(event) => updateLine(line.id, { productId: event.target.value, unitCost: defaultCost(event.target.value) })} className="h-9 w-full rounded-md border bg-card px-3 text-xs">{products.map((item) => <option key={item.id} value={item.id} disabled={lines.some((other) => other.id !== line.id && other.productId === item.id)}>{item.sku} · {item.name}</option>)}</select></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="text-muted-foreground hover:text-destructive"><Trash2 /></Button></div><div className="mt-3 grid grid-cols-3 gap-3"><div className="space-y-2"><Label htmlFor={`${line.id}-quantity`} className="text-xs">Quantity · {product?.unitOfMeasure}</Label><Input id={`${line.id}-quantity`} type="number" min="1" step="1" required value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.valueAsNumber })} className="numeric" /></div><div className="space-y-2"><Label htmlFor={`${line.id}-cost`} className="text-xs">Unit cost · {currency}</Label><Input id={`${line.id}-cost`} type="number" min="0" step="0.01" required value={line.unitCost} onChange={(event) => updateLine(line.id, { unitCost: event.target.valueAsNumber })} className="numeric" /></div><div className="space-y-2"><Label className="text-xs">Line total</Label><div className="numeric flex h-10 items-center justify-end rounded-md border bg-secondary/50 px-3 text-xs font-medium">{(line.quantity * line.unitCost).toLocaleString("en-US", { style: "currency", currency })}</div></div></div></article>; })}</div></section>
      {!supplierId || !warehouseId || lines.length === 0 ? <p className="text-xs text-muted-foreground">Create a supplier, warehouse, and SKU before creating a purchase order.</p> : null}
      {error ? <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-sm text-destructive">{error}</div> : null}
    </form><SheetFooter><Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="create-purchase-order" disabled={pending || !canSubmit}>{pending ? "Creating purchase order…" : "Create draft PO"}</Button></SheetFooter></SheetContent></Sheet>
  );
}
