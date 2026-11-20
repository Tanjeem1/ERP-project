"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErpStore } from "@/store/useErpStore";
import type { CurrencyCode } from "@/types/erp";

const timezones = ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dhaka", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "UTC"];

export function FiscalSettingsForm() {
  const organization = useErpStore((state) => state.organization);
  const updateFiscalSettings = useErpStore((state) => state.updateFiscalSettings);
  const [legalName, setLegalName] = useState(organization.legalName);
  const [displayName, setDisplayName] = useState(organization.displayName);
  const [taxId, setTaxId] = useState(organization.taxId);
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>(organization.baseCurrency);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [invoiceFooterNote, setInvoiceFooterNote] = useState(organization.invoiceFooterNote);
  const [currencyConversionRate, setCurrencyConversionRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (baseCurrency !== organization.baseCurrency && currencyConversionRate <= 0) {
      setError("Enter a valid conversion rate for the new base currency.");
      return;
    }
    setPending(true);
    try {
      await updateFiscalSettings({ legalName, displayName, taxId, baseCurrency, timezone, invoiceFooterNote, currencyConversionRate });
      toast.success("Fiscal settings saved", { description: `${displayName} now uses ${baseCurrency} and ${timezone} for collection cutoffs. Historical records remain balanced.` });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save fiscal settings."); } finally { setPending(false); }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card><CardHeader className="border-b"><CardTitle className="text-sm">Company fiscal settings</CardTitle><CardDescription>Legal identity, currency, timezone, and document presentation</CardDescription></CardHeader><CardContent><form id="fiscal-settings-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="fiscal-legal-name">Legal company name</Label><Input id="fiscal-legal-name" required value={legalName} onChange={(event) => setLegalName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="fiscal-display-name">Trading name</Label><Input id="fiscal-display-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="fiscal-tax">Tax / VAT ID</Label><Input id="fiscal-tax" required value={taxId} onChange={(event) => setTaxId(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="fiscal-currency">Base currency</Label><select id="fiscal-currency" value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value as CurrencyCode)} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option>USD</option><option>EUR</option><option>GBP</option><option>CNY</option><option>AED</option><option>INR</option></select></div><div className="space-y-2"><Label htmlFor="fiscal-timezone">Local timezone</Label><select id="fiscal-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></div><div className="space-y-2"><Label htmlFor="fiscal-rate">New base units per previous base unit</Label><Input id="fiscal-rate" type="number" min="0.000001" step="0.0001" required value={currencyConversionRate} onChange={(event) => setCurrencyConversionRate(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="fiscal-footer">Invoice footer note</Label><textarea id="fiscal-footer" required maxLength={240} value={invoiceFooterNote} onChange={(event) => setInvoiceFooterNote(event.target.value)} className="min-h-24 w-full rounded-md border bg-card px-3 py-2 text-sm" /></div>{error ? <p role="alert" className="text-xs text-destructive sm:col-span-2">{error}</p> : null}<Button type="submit" className="sm:col-span-2" disabled={pending}><Save />{pending ? "Saving…" : "Save fiscal settings"}</Button></form></CardContent></Card><div className="space-y-5"><Card><CardHeader><CardTitle className="text-sm">Fiscal controls</CardTitle><CardDescription>What changes when you save</CardDescription></CardHeader><CardContent className="space-y-3 text-xs leading-6 text-muted-foreground"><p>Company identity appears on tax invoices, customer payment receipts, POS receipts, and financial statements.</p><p>Local timezone determines the 12:00 AM–11:59:59 PM collection cutoff for Today’s Collection.</p><p>Changing base currency revalues every base-denominated amount and FX rate using your supplied conversion factor. Journals remain balanced.</p></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Current configuration</CardTitle><CardDescription>Active organization profile</CardDescription></CardHeader><CardContent className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Currency</span><span className="font-mono">{organization.baseCurrency}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Timezone</span><span>{organization.timezone}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Tax ID</span><span className="font-mono">{organization.taxId}</span></div></CardContent></Card></div></div>
  );
}
