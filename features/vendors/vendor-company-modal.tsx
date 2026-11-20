"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateVendor } from "@/lib/erp-api";
import { useErpStore } from "@/store/useErpStore";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type Supplier } from "@/types/erp";

export function VendorCompanyModal({ supplier, open, onOpenChange }: { supplier?: Supplier; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useErpStore((state) => state.createVendor);
  const refresh = useErpStore((state) => state.refresh);
  const [code, setCode] = useState(supplier?.code ?? "");
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactName, setContactName] = useState(supplier?.contactName ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const baseCurrency = useErpStore((state) => state.organization.baseCurrency);
  const [currency, setCurrency] = useState<CurrencyCode>(supplier?.currency ?? baseCurrency);
  const [terms, setTerms] = useState(supplier?.paymentTermsDays ?? 30);
  const [countryCode, setCountryCode] = useState(supplier?.countryCode ?? "US");
  const [status, setStatus] = useState(supplier?.status === "On Hold" ? "ON_HOLD" : "ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const input = { code: code.trim().toUpperCase(), name, contactName, email, currency, paymentTermsDays: terms, countryCode: countryCode.toUpperCase(), status: status as "ACTIVE" | "ON_HOLD" };
    try {
      if (supplier) {
        await updateVendor(supplier.id, input);
        await refresh(["suppliers"]);
      } else {
        await create(input);
      }
      toast.success(supplier ? "Supplier updated" : "Supplier created", { description: `${name} is available for procurement and accounts payable workflows.` });
      onOpenChange(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save this supplier."); } finally { setPending(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><div className="flex items-center gap-3"><Building2 className="size-5 text-primary" /><div><DialogTitle>{supplier ? `Edit ${supplier.name}` : "Create supplier"}</DialogTitle><DialogDescription>Supplier identity, currency, payment terms, and purchasing status.</DialogDescription></div></div></DialogHeader><form id="supplier-master-form" onSubmit={(event) => void submit(event)} className="space-y-4 p-5">
      <div className="space-y-2"><Label htmlFor="supplier-code">Supplier code</Label><Input id="supplier-code" required readOnly={Boolean(supplier)} value={code} onChange={(event) => setCode(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="supplier-name">Supplier name</Label><Input id="supplier-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="supplier-contact">Contact name</Label><Input id="supplier-contact" required value={contactName} onChange={(event) => setContactName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="supplier-email">Email</Label><Input id="supplier-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="supplier-currency">Currency</Label><select id="supplier-currency" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></div><div className="space-y-2"><Label htmlFor="supplier-terms">Payment terms · days</Label><Input id="supplier-terms" type="number" min="0" max="365" step="1" required value={terms} onChange={(event) => setTerms(event.target.valueAsNumber)} className="numeric" /></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="supplier-country">Country code</Label><Input id="supplier-country" required maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} className="font-mono" /></div><div className="space-y-2"><Label htmlFor="supplier-status">Status</Label><select id="supplier-status" value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "ON_HOLD")} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option></select></div></div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </form><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="supplier-master-form" disabled={pending}>{pending ? "Saving…" : supplier ? "Save supplier" : "Create supplier"}</Button></DialogFooter></DialogContent></Dialog>
  );
}
