"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useErpStore } from "@/store/useErpStore";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type ExpenseCategory, type ExpenseRecord, type PaymentMethod } from "@/types/erp";

const categories: ExpenseCategory[] = ["Warehouse Rent", "Delivery Fuel", "Freight/Port Misc", "Staff Payroll", "Utilities", "Inventory Shrinkage"];

export function ExpenseForm({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (expense: ExpenseRecord) => void }) {
  const recordExpense = useErpStore((state) => state.recordExpense);
  const warehouses = useErpStore((state) => state.warehouses);
  const organization = useErpStore((state) => state.organization);
  const [category, setCategory] = useState<ExpenseCategory>("Warehouse Rent");
  const [payee, setPayee] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Bank");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState<CurrencyCode>(organization.baseCurrency);
  const [fxRate, setFxRate] = useState(1);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!payee.trim() || !reference.trim() || !notes.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(fxRate) || fxRate <= 0) {
      setError("Enter a payee, reference, business purpose, positive amount, and valid exchange rate.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const expense = await recordExpense({ category, payee, reference, notes, warehouseId: warehouseId || undefined, paymentMethod, amountMinor: Math.round(amount * 100), currency, fxRateToBase: fxRate, expenseDate: new Date(`${expenseDate}T12:00:00.000Z`).toISOString() });
      toast.success(`${expense.number} posted`, { description: `${category} was debited and ${paymentMethod} was credited. The financial statements are updated.` });
      onCreated(expense);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to record this expense."); } finally { setPending(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}><SheetContent><SheetHeader><SheetTitle>Record operating expense</SheetTitle><SheetDescription>Post an actual payment with automatic expense and cash/bank accounting.</SheetDescription></SheetHeader><form id="expense-form" onSubmit={submit} className="flex-1 space-y-5 p-5"><div className="space-y-2"><Label htmlFor="expense-category">Expense category</Label><select id="expense-category" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="space-y-2"><Label htmlFor="expense-payee">Payee / vendor</Label><Input id="expense-payee" required maxLength={80} value={payee} onChange={(event) => setPayee(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="expense-reference">Reference / document number</Label><Input id="expense-reference" required maxLength={60} value={reference} onChange={(event) => setReference(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="expense-notes">Business purpose</Label><textarea id="expense-notes" required maxLength={240} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm" /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="expense-warehouse">Cost center</Label><select id="expense-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-xs"><option value="">Company-wide</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="expense-date">Expense date</Label><Input id="expense-date" type="date" required value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="expense-payment">Paid via</Label><div className="grid grid-cols-3 gap-2">{(["Cash", "Bank", "Mobile Banking"] as PaymentMethod[]).map((method) => <button key={method} type="button" aria-pressed={paymentMethod === method} onClick={() => setPaymentMethod(method)} className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${paymentMethod === method ? "border-primary bg-primary/[0.06] text-primary" : "text-muted-foreground hover:bg-accent"}`}>{method}</button>)}</div></div><div className="grid grid-cols-3 gap-3"><div className="col-span-2 space-y-2"><Label htmlFor="expense-amount">Amount</Label><Input id="expense-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2"><Label htmlFor="expense-currency">Currency</Label><select id="expense-currency" value={currency} onChange={(event) => { const value = event.target.value as CurrencyCode; setCurrency(value); setFxRate(value === organization.baseCurrency ? 1 : 0); }} className="h-10 w-full rounded-md border bg-card px-2 text-xs">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></div></div><div className="space-y-2"><Label htmlFor="expense-fx">FX rate to {organization.baseCurrency}</Label><Input id="expense-fx" type="number" min="0.000001" step="0.0001" required disabled={currency === organization.baseCurrency} value={fxRate} onChange={(event) => setFxRate(event.target.valueAsNumber)} className="numeric" /></div><div className="rounded-lg border bg-secondary/35 p-4 font-mono text-[10px] leading-5 text-muted-foreground"><p>DR {category} · {amount.toLocaleString("en-US", { style: "currency", currency })}</p><p>CR {paymentMethod} · {amount.toLocaleString("en-US", { style: "currency", currency })}</p><p className="mt-2 text-primary">Base value: {(amount * fxRate).toLocaleString("en-US", { style: "currency", currency: organization.baseCurrency })}</p></div>{error ? <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-xs text-destructive">{error}</div> : null}</form><SheetFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="expense-form" disabled={pending}>{pending ? "Posting expense…" : "Post expense & accounting"}</Button></SheetFooter></SheetContent></Sheet>
  );
}
