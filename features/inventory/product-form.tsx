"use client";

import { Boxes } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErpStore } from "@/store/useErpStore";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type Product } from "@/types/erp";

export function ProductForm({ product, open, onOpenChange }: { product?: Product; open: boolean; onOpenChange: (open: boolean) => void }) {
  const suppliers = useErpStore((state) => state.suppliers);
  const baseCurrency = useErpStore((state) => state.organization.baseCurrency);
  const createProduct = useErpStore((state) => state.createProduct);
  const updateProduct = useErpStore((state) => state.updateProduct);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "General Merchandise");
  const [description, setDescription] = useState(product?.description ?? "");
  const [unitOfMeasure, setUnitOfMeasure] = useState(product?.unitOfMeasure ?? "unit");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [vatRate, setVatRate] = useState((product?.vatRateBasisPoints ?? 0) / 100);
  const [reorderPoint, setReorderPoint] = useState(product?.reorderPoint ?? 50);
  const [weightKg, setWeightKg] = useState(product?.weightKgPerUnit ?? 1);
  const [volumeCbm, setVolumeCbm] = useState(product?.volumeCbmPerUnit ?? 0.01);
  const [costPrice, setCostPrice] = useState((product?.costPriceMinor ?? 0) / 100);
  const [price, setPrice] = useState((product?.salesPriceMinor ?? 1000) / 100);
  const [currency, setCurrency] = useState<CurrencyCode>(product?.salesCurrency ?? baseCurrency);
  const [supplierId, setSupplierId] = useState(product?.preferredSupplierId ?? suppliers[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const missingText = !sku.trim() || !name.trim() || !category.trim() || !description.trim() || !unitOfMeasure.trim() || !supplierId;
    const invalidNumbers = ![vatRate, reorderPoint, weightKg, volumeCbm, costPrice, price].every(Number.isFinite) || vatRate < 0 || vatRate > 100 || !Number.isSafeInteger(reorderPoint) || reorderPoint < 0 || weightKg <= 0 || volumeCbm <= 0 || costPrice < 0 || price < 0;
    if (missingText || invalidNumbers) {
      setError("Complete the SKU code, name, category, description, unit, supplier, and valid numeric fields.");
      return;
    }
    setError(null);
    setPending(true);
    const input = { sku: sku.trim().toUpperCase(), name, category, description, unitOfMeasure, barcode, vatRateBasisPoints: Math.round(vatRate * 100), reorderPoint, weightKgPerUnit: weightKg, volumeCbmPerUnit: volumeCbm, costPriceMinor: Math.round(costPrice * 100), salesPriceMinor: Math.round(price * 100), salesCurrency: currency, preferredSupplierId: supplierId };
    try {
      if (product) {
        await updateProduct(product.id, input);
        toast.success(`${input.sku} updated`, { description: "Master data changed without altering existing FIFO layers." });
      } else {
        await createProduct(input);
        toast.success(`${input.sku} created`, { description: "The new SKU is ready for procurement and order workflows." });
      }
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this SKU.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><div className="flex items-center gap-3"><Boxes className="size-5 text-primary" /><div><DialogTitle>{product ? `Edit ${product.sku}` : "Create SKU"}</DialogTitle><DialogDescription>Barcode, VAT, reordering, physical dimensions, price, and supplier master data</DialogDescription></div></div></DialogHeader>
      <form id="product-master-form" noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="product-sku">SKU code</Label><Input id="product-sku" required value={sku} onChange={(event) => setSku(event.target.value)} placeholder="WH-SKU-001" className="font-mono" /></div>
        <div className="space-y-2"><Label htmlFor="product-barcode">Barcode</Label><Input id="product-barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="EAN / UPC / internal" className="font-mono" /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="product-name">Product name</Label><Input id="product-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="product-category">Category</Label><Input id="product-category" required value={category} onChange={(event) => setCategory(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="product-unit">Unit of measure</Label><Input id="product-unit" required value={unitOfMeasure} onChange={(event) => setUnitOfMeasure(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="product-description">Description</Label><textarea id="product-description" required value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm" /></div>
        <div className="space-y-2"><Label htmlFor="product-vat">VAT %</Label><Input id="product-vat" type="number" min="0" max="100" step="0.01" required value={vatRate} onChange={(event) => setVatRate(event.target.valueAsNumber)} className="numeric" /></div>
        <div className="space-y-2"><Label htmlFor="product-reorder">Reorder threshold</Label><Input id="product-reorder" type="number" min="0" step="1" required value={reorderPoint} onChange={(event) => setReorderPoint(event.target.valueAsNumber)} className="numeric" /></div>
        <div className="space-y-2"><Label htmlFor="product-weight">Weight / unit · kg</Label><Input id="product-weight" type="number" min="0.0001" step="0.001" required value={weightKg} onChange={(event) => setWeightKg(event.target.valueAsNumber)} className="numeric" /></div>
        <div className="space-y-2"><Label htmlFor="product-volume">Volume / unit · CBM</Label><Input id="product-volume" type="number" min="0.000001" step="0.0001" required value={volumeCbm} onChange={(event) => setVolumeCbm(event.target.valueAsNumber)} className="numeric" /></div>
        <div className="space-y-2"><Label htmlFor="product-cost">Purchase cost · {currency}</Label><Input id="product-cost" type="number" min="0" step="0.01" required value={costPrice} onChange={(event) => setCostPrice(event.target.valueAsNumber)} className="numeric" /></div>
        <div className="space-y-2"><Label htmlFor="product-price">Sales price · {currency}</Label><Input id="product-price" type="number" min="0" step="0.01" required value={price} onChange={(event) => setPrice(event.target.valueAsNumber)} className="numeric" /></div>
        <div className="space-y-2"><Label htmlFor="product-currency">Price currency</Label><select id="product-currency" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="product-supplier">Preferred supplier</Label><select id="product-supplier" required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option value="" disabled>Select a supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
        {suppliers.length === 0 ? <p className="text-xs text-muted-foreground sm:col-span-2">A supplier is required before creating a SKU. <Link href="/app/vendors" className="text-primary hover:underline">Create a supplier</Link>, then return to this form.</p> : null}
        {error ? <p role="alert" className="text-xs text-destructive sm:col-span-2">{error}</p> : null}
      </form>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="product-master-form" disabled={pending || !supplierId}>{pending ? "Saving…" : product ? "Save SKU changes" : "Create SKU"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
