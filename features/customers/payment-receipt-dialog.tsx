"use client";

import { CheckCircle2, Download, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiDownload, saveBlob } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCustomerOutstandingMinor } from "@/lib/balances";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";

export function PaymentReceiptDialog({ receiptId, open, onOpenChange }: { receiptId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const payment = useErpStore((state) => state.customerPayments.find((item) => item.id === receiptId));
  const customer = useErpStore((state) => state.customers.find((item) => item.id === payment?.customerId));
  const organization = useErpStore((state) => state.organization);
  const invoices = useErpStore((state) => state.invoices);
  const [downloadPending, setDownloadPending] = useState(false);
  const remainingDebt = payment ? getCustomerOutstandingMinor(useErpStore.getState(), payment.customerId) : 0;
  const download = async () => {
    if (!payment || downloadPending) return;
    setDownloadPending(true);
    try {
      const result = await apiDownload(`/customer-payments/${payment.id}/receipt/`);
      saveBlob(result.blob, result.filename);
    } catch (error) {
      toast.error("Unable to download the receipt", { description: error instanceof Error ? error.message : "Try again." });
    } finally { setDownloadPending(false); }
  };
  if (!payment || !customer) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent data-invoice-print className="max-w-2xl"><DialogHeader className="print-hidden"><DialogTitle>{payment.number} · Payment Receipt</DialogTitle><DialogDescription>Posted collection and AR allocation</DialogDescription></DialogHeader><article className="p-6"><div className="flex items-start justify-between border-b pb-5"><div><h2 className="text-xl font-semibold">PAYMENT RECEIPT</h2><p className="mt-1 text-xs text-muted-foreground">{organization.legalName}</p><p className="text-[11px] text-muted-foreground">{organization.address.line1} · {organization.address.city}, {organization.address.region}</p></div><div className="text-right"><p className="font-mono text-lg font-semibold text-primary">{payment.number}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(payment.receivedAt).toLocaleString("en-US")}</p></div></div><dl className="grid gap-4 border-b py-5 text-xs sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Received from</dt><dd className="mt-1 text-sm font-medium">{customer.name}</dd><dd className="mt-1 text-muted-foreground">{customer.billingAddress.line1}, {customer.billingAddress.city}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Payment method</dt><dd className="mt-1 text-sm font-medium">{payment.paymentMethod}</dd><dd className="mt-1 text-muted-foreground">Reference {payment.reference}</dd></div></dl><div className="border-b py-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Amount received</p><p className="numeric mt-2 text-3xl font-semibold text-foreground dark:text-foreground">{formatMoney(payment.amountBaseMinor)}</p><p className="mt-1 text-xs text-muted-foreground">{payment.notes}</p></div><div className="border-b py-5"><h3 className="text-xs font-semibold">Invoice allocation</h3><div className="mt-3 space-y-2">{payment.allocations.map((allocation) => <div key={allocation.invoiceId} className="flex justify-between text-xs"><span className="font-mono">{invoices.find((invoice) => invoice.id === allocation.invoiceId)?.number ?? allocation.invoiceId}</span><span className="numeric">{formatMoney(allocation.amountBaseMinor)}</span></div>)}</div></div><div className="flex items-center justify-between py-4 text-xs"><span className="text-muted-foreground">Remaining customer debt</span><span className="numeric text-lg font-semibold">{formatMoney(remainingDebt)}</span></div><div className="mt-5 border-t pt-4 text-[10px] leading-5 text-muted-foreground"><div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="size-4" />Payment posted and Accounts Receivable reduced</div><p className="mt-3">{organization.invoiceFooterNote}</p></div></article><DialogFooter className="print-hidden"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button onClick={() => window.print()}><Printer />Print receipt</Button><Button variant="outline" onClick={() => void download()} disabled={downloadPending}><Download />{downloadPending ? "Downloading…" : "Download PDF"}</Button></DialogFooter></DialogContent></Dialog>
  );
}
