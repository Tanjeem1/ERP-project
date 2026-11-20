"use client";

import { Warehouse } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErpStore } from "@/store/useErpStore";
import type { Warehouse as WarehouseModel } from "@/types/erp";

export function WarehouseForm({ warehouse, open, onOpenChange }: { warehouse?: WarehouseModel; open: boolean; onOpenChange: (open: boolean) => void }) {
  const createWarehouse = useErpStore((state) => state.createWarehouse);
  const updateWarehouse = useErpStore((state) => state.updateWarehouse);
  const [code, setCode] = useState(warehouse?.code ?? "");
  const [name, setName] = useState(warehouse?.name ?? "");
  const [type, setType] = useState<WarehouseModel["type"]>(warehouse?.type ?? "Distribution");
  const [line1, setLine1] = useState(warehouse?.address.line1 ?? "");
  const [city, setCity] = useState(warehouse?.address.city ?? "");
  const [region, setRegion] = useState(warehouse?.address.region ?? "");
  const [postalCode, setPostalCode] = useState(warehouse?.address.postalCode ?? "");
  const [countryCode, setCountryCode] = useState(warehouse?.address.countryCode ?? "US");
  const [capacityCbm, setCapacityCbm] = useState(warehouse?.capacityCbm ?? 1000);
  const [temperatureControlled, setTemperatureControlled] = useState(warehouse?.temperatureControlled ?? false);
  const [status, setStatus] = useState<WarehouseModel["status"]>(warehouse?.status ?? "Active");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const input = { code: code.toUpperCase(), name, type, address: { line1, city, region, postalCode, countryCode }, capacityCbm, temperatureControlled, status };
    try {
      if (warehouse) {
        await updateWarehouse(warehouse.id, input);
        toast.success(`${code.toUpperCase()} updated`, { description: "Warehouse master data was saved without moving stock." });
      } else {
        await createWarehouse(input);
        toast.success(`${code.toUpperCase()} created`, { description: "The new warehouse is ready for stock operations." });
      }
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this warehouse.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><div className="flex items-center gap-3"><Warehouse className="size-5 text-primary" /><div><DialogTitle>{warehouse ? `Edit ${warehouse.code}` : "Create warehouse"}</DialogTitle><DialogDescription>Location, capacity, operating type, and fulfillment settings</DialogDescription></div></div></DialogHeader>
      <form id="warehouse-master-form" onSubmit={(event) => void submit(event)} className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="warehouse-code">Warehouse code</Label><Input id="warehouse-code" required value={code} onChange={(event) => setCode(event.target.value)} placeholder="WH-004" className="font-mono" /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-name">Warehouse name</Label><Input id="warehouse-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-type">Type</Label><select id="warehouse-type" value={type} onChange={(event) => setType(event.target.value as WarehouseModel["type"])} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option>Bonded</option><option>Distribution</option><option>Fulfillment</option></select></div>
        <div className="space-y-2"><Label htmlFor="warehouse-capacity">Capacity · CBM</Label><Input id="warehouse-capacity" type="number" min="1" step="1" required value={capacityCbm} onChange={(event) => setCapacityCbm(event.target.valueAsNumber)} className="numeric" /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="warehouse-address">Street address</Label><Input id="warehouse-address" required value={line1} onChange={(event) => setLine1(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-city">City</Label><Input id="warehouse-city" required value={city} onChange={(event) => setCity(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-region">State / region</Label><Input id="warehouse-region" required value={region} onChange={(event) => setRegion(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-postal">Postal code</Label><Input id="warehouse-postal" required value={postalCode} onChange={(event) => setPostalCode(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-country">Country code</Label><Input id="warehouse-country" required maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} className="font-mono" /></div>
        <div className="space-y-2"><Label htmlFor="warehouse-status">Status</Label><select id="warehouse-status" value={status} onChange={(event) => setStatus(event.target.value as WarehouseModel["status"])} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option>Active</option><option>Inactive</option></select></div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={temperatureControlled} onChange={(event) => setTemperatureControlled(event.target.checked)} className="size-4 accent-primary" />Temperature controlled</label>
        {error ? <p role="alert" className="text-xs text-destructive sm:col-span-2">{error}</p> : null}
      </form>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="warehouse-master-form" disabled={pending}>{pending ? "Saving…" : warehouse ? "Save warehouse" : "Create warehouse"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
