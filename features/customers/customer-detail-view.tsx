"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, CheckCircle2, Edit3, FileText, ReceiptText, Save } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { StatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerCompanyModal } from "@/features/customers/customer-company-modal";
import { CustomerPaymentModal } from "@/features/customers/customer-payment-modal";
import { PaymentEditModal } from "@/features/customers/payment-edit-modal";
import { PaymentReceiptDialog } from "@/features/customers/payment-receipt-dialog";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { getCustomerOutstandingMinor, getCustomerTotalPaidMinor, getCustomerTotalPurchasedMinor, getInvoiceOutstandingMinor } from "@/lib/balances";
import { getCustomerHistory } from "@/lib/erp-api";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { SalesOrder, SalesOrderLine } from "@/types/erp";

export function CustomerDetailView() {
  const hydrated = useHydrated();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = useErpStore();
  const { can } = usePermissions();
  const customer = state.customers.find((item) => item.id === params.id);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(searchParams.get("receipt"));
  const editPayment = state.customerPayments.find((payment) => payment.id === editPaymentId);
  const historyQuery = useQuery({
    queryKey: ["customer-history", params.id, state.activeRole],
    queryFn: () => getCustomerHistory(params.id),
    enabled: Boolean(customer),
    retry: false,
  });

  if (!hydrated) return <Skeleton className="h-[640px]" />;
  if (!customer) return <Card><CardContent className="p-10 text-center"><Building2 className="mx-auto size-7 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Customer not found</h1><Button asChild className="mt-5"><Link href="/app/customers">Back to customer directory</Link></Button></CardContent></Card>;
  const purchased = getCustomerTotalPurchasedMinor(state, customer.id);
  const paid = getCustomerTotalPaidMinor(state, customer.id);
  const debt = getCustomerOutstandingMinor(state, customer.id);
  const availableCredit = Math.max(0, customer.creditLimitBaseMinor - debt);
  const creditUsage = customer.creditLimitBaseMinor > 0 ? `${(debt / customer.creditLimitBaseMinor * 100).toFixed(1)}% of credit limit` : "No credit limit configured";
  const payments = state.customerPayments.filter((payment) => payment.customerId === customer.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const history = historyQuery.data ?? [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <Link href="/app/customers" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="size-3.5" />Back to customer directory</Link>
      <PageHeader title={customer.name} description={`${customer.contactName} · ${customer.email} · ${customer.billingAddress.line1}, ${customer.billingAddress.city}, ${customer.billingAddress.region}`} actions={<><Button variant="outline" onClick={() => setCompanyOpen(true)} disabled={!can("postExpenses")}><Edit3 />Edit company / terms</Button><Button onClick={() => setPaymentOpen(true)} disabled={!can("postExpenses")}><ReceiptText />Receive payment</Button></>} />
      <section aria-label="Customer account KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Total purchased", value: formatMoney(purchased), detail: `${history.length} itemized order lines` },
        { label: "Total paid", value: formatMoney(paid), detail: `${payments.filter((payment) => payment.status === "Posted").length} posted collections` },
        { label: "Remaining debt", value: formatMoney(debt), detail: creditUsage },
        { label: "Available credit", value: formatMoney(availableCredit), detail: `${formatMoney(customer.creditLimitBaseMinor)} approved limit` },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>
      <PaymentReceiptDialog receiptId={receiptId} open={Boolean(receiptId)} onOpenChange={(open) => { if (!open) { setReceiptId(null); router.replace(`/app/customers/${customer.id}`); } }} />
      <section className="overflow-hidden rounded-lg border bg-card"><CardHeader className="border-b"><CardTitle className="text-sm">Itemized purchase history</CardTitle><CardDescription>Every product, SKU, quantity, price, and fulfillment status for this company</CardDescription></CardHeader><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-xs"><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Order / Date</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Product / SKU</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Quantity</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Unit price</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Line total</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Status</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Edit</th></tr></thead><tbody>{history.map((line) => {
        const order = state.orders.find((item) => item.id === line.orderId);
        const currency = order?.currency ?? customer.currency;
        const status = order?.status ?? line.status;
        return <tr key={`${line.orderId}-${line.id}`} className="border-b last:border-0"><td className="px-4 py-3"><Link href={`/app/orders?order=${line.orderId}`} className="font-mono font-medium text-primary hover:underline">{line.orderNumber}</Link><p className="mt-1 text-[10px] text-muted-foreground">{new Date(line.createdAt).toLocaleDateString("en-US")}</p></td><td className="px-3 py-3"><p className="font-medium">{line.productName}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{line.sku}</p></td><td className="numeric px-3 py-3 text-right">{line.quantity}</td><td className="numeric px-3 py-3 text-right">{formatMoney(line.unitPriceMinor, currency)}</td><td className="numeric px-3 py-3 text-right font-medium">{formatMoney(line.quantity * line.unitPriceMinor, currency)}</td><td className="px-3 py-3"><StatusBadge status={status} /></td><td className="px-4 py-3 text-right">{order && (status === "Pending Approval" || status === "Order Placed") ? can("createOrders") ? <OrderQuantityEditor key={`${order.id}-${line.id}-${line.quantity}`} order={order} line={line} onUpdated={() => void historyQuery.refetch()} /> : <span className="text-[10px] text-muted-foreground">Read only</span> : <span className="text-[10px] text-muted-foreground">Locked</span>}</td></tr>;
      })}</tbody></table>{historyQuery.isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading itemized purchase history…</p> : null}{historyQuery.isError ? <div role="alert" className="p-8 text-center"><p className="text-sm text-destructive">{historyQuery.error instanceof Error ? historyQuery.error.message : "Unable to load purchase history."}</p><Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void historyQuery.refetch()}>Retry</Button></div> : null}{!historyQuery.isLoading && !historyQuery.isError && history.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">This customer has no order lines yet.</p> : null}</div></section>
      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card><CardHeader className="border-b"><CardTitle className="text-sm">Payment history and receipts</CardTitle><CardDescription>Posted and reversed payment documents with full audit history</CardDescription></CardHeader><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Receipt</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Method</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Amount</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Status</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Actions</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b last:border-0"><td className="px-4 py-3"><button type="button" onClick={() => setReceiptId(payment.id)} className="font-mono font-medium text-primary hover:underline">{payment.number}</button><p className="mt-1 text-[10px] text-muted-foreground">{new Date(payment.receivedAt).toLocaleDateString("en-US")}</p></td><td className="px-3 py-3">{payment.paymentMethod}</td><td className="numeric px-3 py-3 text-right">{formatMoney(payment.amountBaseMinor)}</td><td className="px-3 py-3"><Badge variant={payment.status === "Posted" ? "success" : "secondary"}>{payment.status}</Badge></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setReceiptId(payment.id)}><FileText />Receipt</Button>{payment.status === "Posted" && can("postExpenses") ? <Button size="sm" variant="outline" onClick={() => setEditPaymentId(payment.id)}><Edit3 />Replace</Button> : null}</div></td></tr>)}</tbody></table>{payments.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No payments have been recorded for this customer.</p> : null}</div></Card><Card><CardHeader className="border-b"><CardTitle className="text-sm">Open receivables</CardTitle><CardDescription>Invoice balances after payments and credit notes</CardDescription></CardHeader><CardContent className="space-y-3">{state.invoices.filter((invoice) => invoice.customerId === customer.id).map((invoice) => { const outstanding = getInvoiceOutstandingMinor(state, invoice.id); return <div key={invoice.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><Link href={`/app/orders?invoice=${invoice.id}`} className="font-mono text-xs font-medium text-primary hover:underline">{invoice.number}</Link><Badge variant={outstanding === 0 ? "success" : "warning"}>{outstanding === 0 ? "PAID" : "OPEN"}</Badge></div><div className="mt-3 flex justify-between text-xs"><span className="text-muted-foreground">Invoice total</span><span className="numeric">{formatMoney(invoice.totalBaseMinor)}</span></div><div className="mt-2 flex justify-between text-xs"><span className="text-muted-foreground">Outstanding</span><span className="numeric font-semibold">{formatMoney(outstanding)}</span></div></div>; })}<div className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.05] p-3 text-[10px] text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" />All debt values use posted allocations, not estimated balances.</div></CardContent></Card></section>
      <CustomerPaymentModal customer={customer} open={paymentOpen} onOpenChange={setPaymentOpen} onPosted={(payment) => { setPaymentOpen(false); setReceiptId(payment.id); }} />
      <CustomerCompanyModal customer={customer} open={companyOpen} onOpenChange={setCompanyOpen} />
      {editPayment ? <PaymentEditModal payment={editPayment} open onOpenChange={(open) => { if (!open) setEditPaymentId(null); }} onReplaced={(payment) => { setEditPaymentId(null); setReceiptId(payment.id); }} /> : null}
    </div>
  );
}

function OrderQuantityEditor({ order, line, onUpdated }: { order: SalesOrder; line: SalesOrderLine; onUpdated: () => void }) {
  const updateQuantity = useErpStore((state) => state.updateSalesOrderLineQuantity);
  const [quantity, setQuantity] = useState(line.quantity);
  const [pending, setPending] = useState(false);
  const save = async () => {
    if (pending) return;
    setPending(true);
    try {
      await updateQuantity(order.id, line.id, quantity);
      toast.success(`${order.number} updated`, { description: `Order line changed to ${quantity} units. Reservation and credit controls were revalidated.` });
      onUpdated();
    } catch (error) {
      toast.error("Quantity could not be updated", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setPending(false);
    }
  };
  return <div className="flex items-center justify-end gap-2"><Input aria-label={`Edit quantity for ${line.productId}`} type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.valueAsNumber)} className="numeric h-8 w-20 text-right" /><Button size="sm" variant="outline" onClick={() => void save()} disabled={pending || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity === line.quantity}><Save /><span className="sr-only">{pending ? "Saving quantity" : "Save quantity"}</span></Button></div>;
}
