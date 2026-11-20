"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErpStore } from "@/store/useErpStore";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type Customer } from "@/types/erp";

export function CustomerCompanyModal({ customer, open, onOpenChange }: { customer?: Customer; open: boolean; onOpenChange: (open: boolean) => void }) {
  const organization = useErpStore((state) => state.organization);
  const updateCustomer = useErpStore((state) => state.updateCustomer);
  const createCustomer = useErpStore((state) => state.createCustomer);
  const [code, setCode] = useState(customer?.code ?? "");
  const [name, setName] = useState(customer?.name ?? "");
  const [contactName, setContactName] = useState(customer?.contactName ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [terms, setTerms] = useState(customer?.paymentTermsDays ?? 30);
  const [taxRate, setTaxRate] = useState((customer?.taxRateBasisPoints ?? 0) / 100);
  const [creditLimit, setCreditLimit] = useState((customer?.creditLimitBaseMinor ?? 0) / 100);
  const [currency, setCurrency] = useState<CurrencyCode>(customer?.currency ?? organization.baseCurrency);
  const [line1, setLine1] = useState(customer?.billingAddress.line1 ?? "");
  const [line2, setLine2] = useState(customer?.billingAddress.line2 ?? "");
  const [city, setCity] = useState(customer?.billingAddress.city ?? "");
  const [region, setRegion] = useState(customer?.billingAddress.region ?? "");
  const [postalCode, setPostalCode] = useState(customer?.billingAddress.postalCode ?? "");
  const [countryCode, setCountryCode] = useState(customer?.billingAddress.countryCode ?? "US");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const billingAddress = { line1, line2, city, region, postalCode, countryCode: countryCode.toUpperCase() };
    try {
      if (customer) {
        await updateCustomer(customer.id, { name, contactName, email, paymentTermsDays: terms, taxRateBasisPoints: Math.round(taxRate * 100), creditLimitBaseMinor: Math.round(creditLimit * 100), currency, billingAddress });
      } else {
        await createCustomer({ code: code.trim().toUpperCase(), name, contactName, email, currency, paymentTermsDays: terms, taxRateBasisPoints: Math.round(taxRate * 100), creditLimitBaseMinor: Math.round(creditLimit * 100), billingAddress });
      }
      toast.success(customer ? "Company terms updated" : "Company created", { description: `${name} is saved with ${terms}-day terms and a ${creditLimit.toLocaleString()} credit limit.` });
      onOpenChange(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save this company."); } finally { setPending(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><div className="flex items-center gap-3"><Building2 className="size-5 text-primary" /><div><DialogTitle>{customer ? "Edit company and credit terms" : "Create company"}</DialogTitle><DialogDescription>Billing identity, payment terms, credit limit, and address.</DialogDescription></div></div></DialogHeader><form id="company-edit-form" onSubmit={(event) => void submit(event)} className="grid gap-4 p-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="company-code">Company code</Label><Input id="company-code" required readOnly={Boolean(customer)} value={code} onChange={(event) => setCode(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-name">Company name</Label><Input id="company-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-contact">Contact name</Label><Input id="company-contact" required value={contactName} onChange={(event) => setContactName(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-email">Billing email</Label><Input id="company-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-currency">Billing currency</Label><select id="company-currency" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="company-terms">Payment terms · days</Label><Input id="company-terms" type="number" min="0" max="365" step="1" required value={terms} onChange={(event) => setTerms(event.target.valueAsNumber)} className="numeric" /></div>
      <div className="space-y-2"><Label htmlFor="company-tax">VAT / sales tax %</Label><Input id="company-tax" type="number" min="0" max="100" step="0.01" required value={taxRate} onChange={(event) => setTaxRate(event.target.valueAsNumber)} className="numeric" /></div>
      <div className="space-y-2"><Label htmlFor="company-limit">Credit limit · {organization.baseCurrency}</Label><Input id="company-limit" type="number" min="0" step="0.01" required value={creditLimit} onChange={(event) => setCreditLimit(event.target.valueAsNumber)} className="numeric" /></div>
      <div className="space-y-2"><Label htmlFor="company-address">Billing address</Label><Input id="company-address" required value={line1} onChange={(event) => setLine1(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-address-2">Address line 2 <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="company-address-2" value={line2} onChange={(event) => setLine2(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-city">City</Label><Input id="company-city" required value={city} onChange={(event) => setCity(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-region">State / region</Label><Input id="company-region" required value={region} onChange={(event) => setRegion(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-postal">Postal code</Label><Input id="company-postal" required value={postalCode} onChange={(event) => setPostalCode(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="company-country">Country code</Label><Input id="company-country" required maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} className="font-mono" /></div>
      {error ? <p role="alert" className="text-xs text-destructive sm:col-span-2">{error}</p> : null}
    </form><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="company-edit-form" disabled={pending}>{pending ? "Saving…" : customer ? "Save company terms" : "Create company"}</Button></DialogFooter></DialogContent></Dialog>
  );
}
