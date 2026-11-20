"use client";

import { ArrowRight, CheckCircle2, Landmark } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { Invoice, JournalEntry } from "@/types/erp";

export function JournalEntryContent({ entry, showSourceLink = true }: { entry: JournalEntry; showSourceLink?: boolean }) {
  const accounts = useErpStore((state) => state.accounts);
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-secondary/35 p-4"><div><p className="text-xs text-muted-foreground">{entry.description}</p><p className="mt-2 text-xs text-muted-foreground">Source: <span className="font-medium text-foreground">{entry.source.number}</span> · {new Date(entry.timestamp).toLocaleString("en-US")}</p></div><StatusBadge status={entry.status} /></div>
      <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[540px] text-left text-xs"><caption className="sr-only">Journal lines for {entry.number}</caption><thead className="bg-secondary/50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Account</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Debit</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Credit</th></tr></thead><tbody>{entry.lines.map((line) => { const account = accounts.find((item) => item.id === line.accountId); return <tr key={line.id} className="border-t"><td className="px-4 py-3"><p className="font-medium">{account?.name ?? line.accountId}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{account?.code} · {line.description}</p></td><td className="numeric px-4 py-3 text-right text-foreground dark:text-foreground">{line.debitMinor ? formatMoney(line.debitMinor) : "-"}</td><td className="numeric px-4 py-3 text-right text-blue-600 dark:text-blue-400">{line.creditMinor ? formatMoney(line.creditMinor) : "-"}</td></tr>; })}</tbody><tfoot className="border-t bg-secondary/35 font-medium"><tr><td className="px-4 py-3">Total</td><td className="numeric px-4 py-3 text-right">{formatMoney(entry.totalDebitMinor)}</td><td className="numeric px-4 py-3 text-right">{formatMoney(entry.totalCreditMinor)}</td></tr></tfoot></table></div>
      <div className="mt-4 flex items-center gap-2 text-xs text-foreground dark:text-foreground"><CheckCircle2 className="size-4" />Debits equal credits. This entry passed the store balance invariant.</div>
      {showSourceLink ? <Button asChild variant="outline" size="sm" className="mt-5"><Link href={entry.source.type === "Goods Receipt" ? `/app/procurement?grn=${entry.source.id}` : entry.source.type === "Sales Order" ? `/app/orders?order=${entry.source.id}` : entry.source.type === "Invoice" ? `/app/orders?invoice=${entry.source.id}` : "/app/dashboard#ledger-feed"}>{entry.source.type === "Goods Receipt" ? "Open source goods receipt" : entry.source.type === "Sales Order" ? "Open source sales order" : entry.source.type === "Invoice" ? "Open source tax invoice" : "Open automated ledger feed"}<ArrowRight /></Link></Button> : null}
    </div>
  );
}

export function InvoiceContent({ invoice }: { invoice: Invoice }) {
  const customer = useErpStore((state) => state.customers.find((item) => item.id === invoice.customerId));
  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-secondary/35 p-4"><div><p className="font-semibold">{customer?.name ?? "Customer"}</p><p className="mt-1 text-xs text-muted-foreground">{invoice.orderNumber} · Issued {new Date(invoice.issuedAt).toLocaleDateString("en-US")}</p></div><StatusBadge status={invoice.status} /></div>
      <div className="mt-4 rounded-lg border"><div className="grid grid-cols-[1fr_auto] gap-4 border-b bg-secondary/40 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><span>Description</span><span>Amount</span></div>{invoice.lines.map((line) => <div key={line.productId} className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-3 text-xs last:border-0"><div><p className="font-medium">{line.description}</p><p className="numeric mt-1 text-[10px] text-muted-foreground">{line.quantity} × {formatMoney(line.unitPriceMinor, invoice.currency)}</p></div><span className="numeric">{formatMoney(line.totalMinor, invoice.currency)}</span></div>)}</div>
      <dl className="ml-auto mt-4 max-w-xs space-y-2 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="numeric">{formatMoney(invoice.subtotalMinor, invoice.currency)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Sales tax</dt><dd className="numeric">{formatMoney(invoice.taxMinor, invoice.currency)}</dd></div><div className="flex justify-between border-t pt-3 text-sm font-semibold"><dt>Total</dt><dd className="numeric">{formatMoney(invoice.totalMinor, invoice.currency)}</dd></div><div className="flex justify-between text-muted-foreground"><dt>Actual FIFO COGS</dt><dd className="numeric">{formatMoney(invoice.cogsBaseMinor)}</dd></div></dl>
      <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Landmark className="size-4 text-primary" />{invoice.journalEntryIds.length} linked journal entries · Due {new Date(invoice.dueAt).toLocaleDateString("en-US")}</div>
      <Button asChild variant="outline" size="sm" className="mt-5"><Link href={`/app/orders?invoice=${invoice.id}`}>Open printable invoice<ArrowRight /></Link></Button>
    </div>
  );
}
