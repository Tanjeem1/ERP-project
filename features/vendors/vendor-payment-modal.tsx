"use client";

import { Landmark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupplierOutstandingMinor } from "@/lib/balances";
import { DEFAULT_COLLECTION_RANGE } from "@/lib/collections";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { PaymentMethod, Supplier, VendorPayment } from "@/types/erp";

export function VendorPaymentModal({ supplier, open, onOpenChange, onPosted }: { supplier: Supplier; open: boolean; onOpenChange: (open: boolean) => void; onPosted: (payment: VendorPayment) => void }) {
  const state = useErpStore();
  const baseCurrency = state.organization.baseCurrency;
  const outstanding = getSupplierOutstandingMinor(state, supplier.id);
  const [fxRateToBase, setFxRateToBase] = useState(supplier.currency === baseCurrency ? 1 : 0);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [amount, setAmount] = useState(supplier.currency === baseCurrency ? outstanding / 100 : 0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Bank");
  const [reference, setReference] = useState(`PAY-${supplier.code}-${state.vendorPayments.filter((payment) => payment.supplierId === supplier.id).length + 1}`);
  const [notes, setNotes] = useState("Supplier payment against accrued import invoice");
  const [paidAt, setPaidAt] = useState(DEFAULT_COLLECTION_RANGE.endDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const maximumSourceAmount = fxRateToBase > 0 ? outstanding / fxRateToBase / 100 : undefined;
  const valid = Number.isFinite(amount) && amount > 0 && fxRateToBase > 0 && (maximumSourceAmount === undefined || amount <= maximumSourceAmount) && reference.trim().length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!valid) {
      setError("Enter a positive payment amount, a valid exchange rate, and a reference that does not exceed the payable balance.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const payment = await state.recordVendorPayment({ supplierId: supplier.id, purchaseOrderId: purchaseOrderId || undefined, paymentMethod, amountMinor: Math.round(amount * 100), currency: supplier.currency, fxRateToBase, paidAt: new Date(`${paidAt}T12:00:00.000Z`).toISOString(), reference, notes });
      toast.success(`${payment.number} posted`, { description: `${formatMoney(payment.amountBaseMinor)} paid to ${supplier.name}. Accounts Payable is reduced.` });
      onPosted(payment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record vendor payment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><div className="flex items-center gap-3"><Landmark className="size-5 text-primary" /><div><DialogTitle>Record vendor payment</DialogTitle><DialogDescription>{supplier.name} · {formatMoney(outstanding)} remaining payable</DialogDescription></div></div></DialogHeader>
      <form id="vendor-payment-form" onSubmit={(event) => void submit(event)} className="space-y-5 p-5">
        <div className="space-y-2"><Label htmlFor="vendor-po">Apply to shipment / PO (optional)</Label><select id="vendor-po" value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-xs"><option value="">Oldest supplier accruals</option>{state.purchaseOrders.filter((order) => order.supplierId === supplier.id).map((order) => <option key={order.id} value={order.id}>{order.number} · {order.reference}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="vendor-amount">Amount · {supplier.currency}</Label><Input id="vendor-amount" type="number" min="0.01" max={maximumSourceAmount} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2"><Label htmlFor="vendor-date">Payment date</Label><Input id="vendor-date" type="date" required value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></div></div>
        <div className="space-y-2"><Label htmlFor="vendor-fx">Exchange rate: {supplier.currency} to {baseCurrency}</Label><Input id="vendor-fx" type="number" min="0.0001" step="0.0001" required value={fxRateToBase} disabled={supplier.currency === baseCurrency} onChange={(event) => setFxRateToBase(event.target.valueAsNumber)} className="numeric" /><p className="text-xs text-muted-foreground">Posted payment value: {formatMoney(Math.round(amount * 100 * fxRateToBase))}. <button type="button" className="text-primary hover:underline" onClick={() => setAmount(maximumSourceAmount ?? 0)}>Apply the full payable balance</button></p></div>
        <div className="space-y-2"><Label htmlFor="vendor-method">Payment method</Label><select id="vendor-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option>Bank</option><option>Cash</option><option>Mobile Banking</option></select></div>
        <div className="space-y-2"><Label htmlFor="vendor-reference">Payment reference</Label><Input id="vendor-reference" required value={reference} onChange={(event) => setReference(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="vendor-notes">Notes</Label><textarea id="vendor-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm" /></div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </form>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="vendor-payment-form" disabled={pending || !valid}>{pending ? "Posting payment…" : "Post vendor payment"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
