"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErpStore } from "@/store/useErpStore";
import type { CollectionPaymentMethod, CustomerPayment } from "@/types/erp";

export function PaymentEditModal({ payment, open, onOpenChange, onReplaced }: { payment: CustomerPayment; open: boolean; onOpenChange: (open: boolean) => void; onReplaced: (payment: CustomerPayment) => void }) {
  const updateCustomerPayment = useErpStore((state) => state.updateCustomerPayment);
  const [amount, setAmount] = useState(payment.amountMinor / 100);
  const [paymentMethod, setPaymentMethod] = useState<CollectionPaymentMethod>(payment.paymentMethod);
  const [reference, setReference] = useState(payment.reference);
  const [notes, setNotes] = useState(payment.notes);
  const [receivedAt, setReceivedAt] = useState(payment.receivedAt.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const replacement = await updateCustomerPayment(payment.id, { paymentMethod, amountMinor: Math.round(amount * 100), currency: payment.currency, fxRateToBase: payment.fxRateToBase, receivedAt: new Date(`${receivedAt}T12:00:00.000Z`).toISOString(), reference, notes });
      toast.success(`${replacement.number} created`, { description: `${payment.number} was reversed, preserving a complete audit trail.` });
      onReplaced(replacement);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to replace this payment."); } finally { setPending(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Replace customer payment</DialogTitle><DialogDescription>{payment.number} will be reversed by a dedicated journal and replaced with an updated receipt.</DialogDescription></DialogHeader><form id="payment-edit-form" onSubmit={submit} className="space-y-5 p-5"><div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="size-4 shrink-0" /><p>The original document remains immutable. Reversal and replacement journals are both posted.</p></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="edit-payment-amount">Amount</Label><Input id="edit-payment-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2"><Label htmlFor="edit-payment-date">Received date</Label><Input id="edit-payment-date" type="date" required value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="edit-payment-method">Payment method</Label><select id="edit-payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as CollectionPaymentMethod)} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>Mobile Banking</option></select></div><div className="space-y-2"><Label htmlFor="edit-payment-reference">Reference</Label><Input id="edit-payment-reference" required value={reference} onChange={(event) => setReference(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="edit-payment-notes">Notes</Label><textarea id="edit-payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm" /></div>{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}</form><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="payment-edit-form">Reverse & replace payment</Button></DialogFooter></DialogContent></Dialog>
  );
}
