"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bookDemo } from "@/lib/erp-api";

const initialForm = { fullName: "", workEmail: "", companyName: "", phone: "", industry: "WHOLESALE_DISTRIBUTION", warehouseCount: "1", monthlyShipments: "", skuCount: "", message: "", consent: false };

export function BookDemoForm() {
  const [form, setForm] = useState(initialForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const update = (field: keyof typeof initialForm, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.fullName.trim() || !form.companyName.trim() || !form.workEmail.includes("@")) {
      setError("Enter your name, company, and work email.");
      return;
    }
    if (Number(form.warehouseCount) < 1 || Number(form.monthlyShipments) < 0 || Number(form.skuCount) < 0) {
      setError("Enter valid warehouse, shipment, and SKU counts.");
      return;
    }
    if (!form.consent) {
      setError("Allow our enterprise team to contact you about this request.");
      return;
    }
    setPending(true);
    try {
      await bookDemo({
        fullName: form.fullName,
        workEmail: form.workEmail,
        companyName: form.companyName,
        phone: form.phone,
        industry: form.industry,
        warehouseCount: Number(form.warehouseCount),
        monthlyShipments: Number(form.monthlyShipments),
        skuCount: Number(form.skuCount),
        message: form.message,
        consent: form.consent,
      });
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit your request. Please try again.");
    } finally {
      setPending(false);
    }
  };
  if (submitted) {
    return <div className="rounded-lg border bg-white p-8 text-center" role="status"><CheckCircle2 className="mx-auto size-8 text-emerald-600" /><h2 className="mt-4 text-2xl font-semibold tracking-tight">Your demo request is registered</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Our enterprise team will review your warehouse, shipment, and SKU requirements and contact you at {form.workEmail}.</p><Button variant="outline" className="mt-6" onClick={() => { setForm(initialForm); setSubmitted(false); }}>Submit another request</Button></div>;
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5 rounded-lg border bg-white p-6 sm:p-8" aria-label="Book an enterprise demo">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="demo-name">Full name</Label><Input id="demo-name" autoComplete="name" required value={form.fullName} onChange={(event) => update("fullName", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="demo-email">Work email</Label><Input id="demo-email" type="email" autoComplete="email" required value={form.workEmail} onChange={(event) => update("workEmail", event.target.value)} /></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="demo-company">Company name</Label><Input id="demo-company" autoComplete="organization" required value={form.companyName} onChange={(event) => update("companyName", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="demo-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="demo-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></div></div>
      <div className="space-y-2"><Label htmlFor="demo-industry">Industry</Label><select id="demo-industry" value={form.industry} onChange={(event) => update("industry", event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="WHOLESALE_DISTRIBUTION">Wholesale distribution</option><option value="FMCG">FMCG</option><option value="RETAIL_ECOMMERCE">Retail and e-commerce</option><option value="IMPORT_EXPORT">Import and export</option><option value="OTHER">Other</option></select></div>
      <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="demo-warehouses">Warehouses</Label><Input id="demo-warehouses" type="number" min="1" step="1" required value={form.warehouseCount} onChange={(event) => update("warehouseCount", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="demo-shipments">Monthly shipments</Label><Input id="demo-shipments" type="number" min="0" step="1" required value={form.monthlyShipments} onChange={(event) => update("monthlyShipments", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="demo-skus">Active SKUs</Label><Input id="demo-skus" type="number" min="0" step="1" required value={form.skuCount} onChange={(event) => update("skuCount", event.target.value)} /></div></div>
      <div className="space-y-2"><Label htmlFor="demo-message">Operational priorities <span className="font-normal text-muted-foreground">(optional)</span></Label><textarea id="demo-message" rows={4} maxLength={2000} value={form.message} onChange={(event) => update("message", event.target.value)} placeholder="Multi-warehouse stock, import landed costs, customer credit, POS, or financial reporting" className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></div>
      <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} className="mt-0.5 size-3.5 accent-primary" />I allow NexusLedger to contact me about this enterprise demo request.</label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Registering request…" : "Book enterprise demo"}<ArrowRight /></Button>
    </form>
  );
}
