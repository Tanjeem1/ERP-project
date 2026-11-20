"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCustomerOutstandingMinor, getInvoiceOutstandingMinor } from "@/lib/balances";
import { DEFAULT_COLLECTION_RANGE } from "@/lib/collections";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { CollectionPaymentMethod, Customer, CustomerPayment } from "@/types/erp";

export function CustomerPaymentModal({ customer, invoiceId, open, onOpenChange, onPosted }: { customer: Customer; invoiceId?: string; open: boolean; onOpenChange: (open: boolean) => void; onPosted: (payment: CustomerPayment) => void }) {
  const state = useErpStore();
  const baseCurrency = state.organization.baseCurrency;
  const outstanding = invoiceId ? getInvoiceOutstandingMinor(state, invoiceId) : getCustomerOutstandingMinor(state, customer.id);
  const [fxRateToBase, setFxRateToBase] = useState(customer.currency === baseCurrency ? 1 : 0);
  const [amount, setAmount] = useState(customer.currency === baseCurrency ? outstanding / 100 : 0);
  const [paymentMethod, setPaymentMethod] = useState<CollectionPaymentMethod>("Bank Transfer");
  const [reference, setReference] = useState(`COL-${customer.code}-${state.customerPayments.filter((payment) => payment.customerId === customer.id).length + 1}`);
  const [notes, setNotes] = useState("Customer payment received");
  const [receivedAt, setReceivedAt] = useState(DEFAULT_COLLECTION_RANGE.endDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const maximumSourceAmount = fxRateToBase > 0 ? outstanding / fxRateToBase / 100 : undefined;
  const valid = Number.isFinite(amount) && amount > 0 && Number.isFinite(fxRateToBase) && fxRateToBase > 0 && (maximumSourceAmount === undefined || amount <= maximumSourceAmount) && reference.trim().length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!valid) {
      setError("Enter a positive payment amount, a valid exchange rate, and a reference that does not exceed open receivables.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const payment = await state.recordCustomerPayment({ customerId: customer.id, invoiceId, paymentMethod, amountMinor: Math.round(amount * 100), currency: customer.currency, fxRateToBase, receivedAt: new Date(`${receivedAt}T12:00:00.000Z`).toISOString(), reference, notes });
      toast.success(`${payment.number} posted`, { description: `${formatMoney(payment.amountBaseMinor)} collected. Accounts Receivable and collection totals are updated.` });
      onPosted(payment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record this payment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Receive customer payment</DialogTitle><DialogDescription>{customer.name} · {formatMoney(outstanding)} remaining debt</DialogDescription></DialogHeader>
      <form id="customer-payment-form" onSubmit={(event) => void submit(event)} className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="payment-amount">Amount · {customer.currency}</Label><Input id="payment-amount" type="number" min="0.01" max={maximumSourceAmount} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2"><Label htmlFor="payment-date">Received date</Label><Input id="payment-date" type="date" required value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></div></div>
        <div className="space-y-2"><Label htmlFor="payment-fx">Exchange rate: {customer.currency} to {baseCurrency}</Label><Input id="payment-fx" type="number" min="0.0001" step="0.0001" required value={fxRateToBase} disabled={customer.currency === baseCurrency} onChange={(event) => setFxRateToBase(event.target.valueAsNumber)} className="numeric" /><p className="text-xs text-muted-foreground">Posted payment value: {formatMoney(Math.round(amount * 100 * fxRateToBase))}. <button type="button" className="text-primary hover:underline" onClick={() => setAmount(maximumSourceAmount ?? 0)}>Apply the full open balance</button></p></div>
        <div className="space-y-2"><Label htmlFor="payment-method">Payment method</Label><div className="grid grid-cols-2 gap-2">{(["Cash", "Bank Transfer", "Cheque", "Mobile Banking"] as CollectionPaymentMethod[]).map((method) => <button key={method} type="button" aria-pressed={paymentMethod === method} onClick={() => setPaymentMethod(method)} className={`rounded-lg border px-3 py-2 text-xs transition ${paymentMethod === method ? "border-primary bg-primary/[0.06] text-primary" : "text-muted-foreground hover:bg-accent"}`}>{method}</button>)}</div></div>
        <div className="space-y-2"><Label htmlFor="payment-reference">Payment reference</Label><Input id="payment-reference" required maxLength={60} value={reference} onChange={(event) => setReference(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="payment-notes">Notes</Label><textarea id="payment-notes" maxLength={200} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm" /></div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs"><div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" />Automatic allocation</div><p className="mt-1 text-muted-foreground">Payment applies to the oldest open invoices first, generates a balanced collection journal, and produces a printable receipt.</p></div>
        {error ? <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-xs text-destructive">{error}</div> : null}
      </form>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="customer-payment-form" disabled={pending || !valid}>{pending ? "Posting payment…" : "Post payment & generate receipt"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
