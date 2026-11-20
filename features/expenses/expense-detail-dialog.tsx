"use client";

import { JournalEntryContent } from "@/components/erp/record-detail";
import { StatusBadge } from "@/components/erp/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";

export function ExpenseDetailDialog({ expenseId, open, onOpenChange }: { expenseId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const expense = useErpStore((state) => state.expenses.find((item) => item.id === expenseId));
  const journal = useErpStore((state) => state.journalEntries.find((entry) => entry.id === expense?.journalEntryId));
  const warehouses = useErpStore((state) => state.warehouses);
  if (!expense) return null;
  const warehouse = warehouses.find((item) => item.id === expense.warehouseId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{expense.number} · {expense.category}</DialogTitle><DialogDescription>{expense.payee} · {expense.reference}</DialogDescription></DialogHeader><div className="p-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Base amount</p><p className="numeric mt-2 text-xl font-semibold">{formatMoney(expense.amountBaseMinor)}</p></div><div className="rounded-lg border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Paid via</p><p className="mt-2 text-sm font-semibold">{expense.paymentMethod}</p></div><div className="rounded-lg border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Expense date</p><p className="mt-2 text-sm font-semibold">{new Date(expense.expenseDate).toLocaleDateString("en-US")}</p></div></div><dl className="mt-4 space-y-3 rounded-lg border p-4 text-xs"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Business purpose</dt><dd className="max-w-md text-right">{expense.notes}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Cost center</dt><dd>{warehouse?.name ?? "Company-wide"}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Source currency</dt><dd className="numeric">{formatMoney(expense.amountMinor, expense.currency)} at {expense.fxRateToBase}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Created by role</dt><dd><StatusBadge status={expense.createdByRole} /></dd></div></dl></div>{journal ? <div className="border-t"><div className="px-5 pt-4"><h3 className="text-sm font-semibold">Balanced payment journal</h3></div><JournalEntryContent entry={journal} showSourceLink={false} /></div> : null}</DialogContent></Dialog>
  );
}
