"use client";

import { ArrowRight, Building2, PackageCheck, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { JournalEntryContent } from "@/components/erp/record-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VendorCompanyModal } from "@/features/vendors/vendor-company-modal";
import { VendorPaymentModal } from "@/features/vendors/vendor-payment-modal";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { getSupplierOutstandingMinor } from "@/lib/balances";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { Supplier } from "@/types/erp";

export function VendorsView() {
  const hydrated = useHydrated();
  const state = useErpStore();
  const [search, setSearch] = useState("");
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [companySupplier, setCompanySupplier] = useState<Supplier | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const { can } = usePermissions();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const selectedPayment = state.vendorPayments.find((payment) => payment.id === selectedPaymentId);
  const selectedJournal = state.journalEntries.find((entry) => entry.id === selectedPayment?.journalEntryId);
  const suppliers = state.suppliers.filter((supplier) => `${supplier.name} ${supplier.code} ${supplier.contactName}`.toLowerCase().includes(search.toLowerCase()));
  const totalDebt = state.suppliers.reduce((sum, supplier) => sum + getSupplierOutstandingMinor(state, supplier.id), 0);
  const totalPurchased = state.purchaseOrders.flatMap((order) => order.lines.map((line) => Math.round(line.orderedQuantity * line.unitCostMinor * order.fxRateToBase))).reduce((sum, value) => sum + value, 0);
  const totalPaid = state.vendorPayments.reduce((sum, payment) => sum + payment.amountBaseMinor, 0);

  if (!hydrated) return <Skeleton className="h-[600px]" />;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Supplier balances and payment control" description="Track purchase commitments, import shipment references, accrued supplier debt, and actual cash or bank payments through one AP ledger." actions={<>{can("manageProcurement") ? <><Button variant="outline" onClick={() => { setCompanySupplier(null); setCompanyOpen(true); }}><Plus />Add supplier</Button><Button asChild variant="outline"><Link href="/app/procurement?create=1"><PackageCheck />New purchase order<ArrowRight /></Link></Button></> : null}</>} />
      <section aria-label="Accounts payable KPIs" className="grid gap-3 sm:grid-cols-3">{[
        { label: "Total PO commitments", value: formatMoney(totalPurchased), detail: `${state.purchaseOrders.length} purchase orders` },
        { label: "Supplier debt · AP", value: formatMoney(totalDebt), detail: "Accrued received goods less payments" },
        { label: "Vendor payments", value: formatMoney(totalPaid), detail: `${state.vendorPayments.length} posted payments` },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>
      <section className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Vendor and supplier directory</h2><p className="mt-1 text-[10px] text-muted-foreground">Import LC, shipment references, payable balances, and payment actions</p></div><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search suppliers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Supplier, code, or contact…" className="h-9 pl-9 text-xs sm:w-72" /></div></div><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Supplier</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Total PO Value</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Total Paid</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Remaining Payable</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Import LC / Shipment References</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Last Payment</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Action</th></tr></thead><tbody>{suppliers.map((supplier) => { const purchaseOrders = state.purchaseOrders.filter((order) => order.supplierId === supplier.id); const totalPo = purchaseOrders.flatMap((order) => order.lines.map((line) => Math.round(line.orderedQuantity * line.unitCostMinor * order.fxRateToBase))).reduce((sum, value) => sum + value, 0); const paid = state.vendorPayments.filter((payment) => payment.supplierId === supplier.id).reduce((sum, payment) => sum + payment.amountBaseMinor, 0); const debt = getSupplierOutstandingMinor(state, supplier.id); const lastPayment = state.vendorPayments.filter((payment) => payment.supplierId === supplier.id).sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0]; return <tr key={supplier.id} className="border-b align-top last:border-0 hover:bg-accent/30"><td className="px-4 py-3"><div className="flex items-center gap-2 font-medium"><Building2 className="size-4 text-primary" />{supplier.name}</div><p className="mt-1 text-[10px] text-muted-foreground">{supplier.code} · {supplier.countryCode} · {supplier.paymentTermsDays}-day terms</p></td><td className="numeric px-3 py-3 text-right">{formatMoney(totalPo)}</td><td className="numeric px-3 py-3 text-right text-foreground dark:text-foreground">{formatMoney(paid)}</td><td className="px-3 py-3 text-right"><span className={`numeric font-semibold ${debt > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground dark:text-foreground"}`}>{formatMoney(debt)}</span></td><td className="max-w-[240px] px-3 py-3"><div className="flex flex-wrap gap-1.5">{purchaseOrders.map((order) => <Link key={order.id} href={`/app/procurement?po=${order.id}`}><Badge variant="secondary" className="font-mono text-[9px]">{order.reference}</Badge></Link>)}</div></td><td className="px-3 py-3 text-[10px] text-muted-foreground">{lastPayment ? new Date(lastPayment.paidAt).toLocaleDateString("en-US") : "No payments"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{can("manageProcurement") ? <Button size="sm" variant="ghost" onClick={() => { setCompanySupplier(supplier); setCompanyOpen(true); }}>Edit</Button> : null}<Button size="sm" variant="outline" disabled={debt === 0 || !can("postExpenses")} onClick={() => setPaymentSupplier(supplier)}>Record payment</Button>{lastPayment ? <Button size="sm" variant="ghost" onClick={() => setSelectedPaymentId(lastPayment.id)}>Last journal</Button> : null}</div></td></tr>; })}</tbody></table></div><div className="flex justify-between border-t bg-secondary/20 px-4 py-3 text-[10px] text-muted-foreground"><span>{suppliers.length} suppliers</span><span>Payable debt uses received goods accruals, not unshipped PO commitments</span></div></section>
      {companyOpen ? <VendorCompanyModal supplier={companySupplier ?? undefined} open onOpenChange={(open) => { setCompanyOpen(open); if (!open) setCompanySupplier(null); }} /> : null}
      {paymentSupplier ? <VendorPaymentModal supplier={paymentSupplier} open onOpenChange={(open) => { if (!open) setPaymentSupplier(null); }} onPosted={(payment) => { setPaymentSupplier(null); setSelectedPaymentId(payment.id); }} /> : null}
      <Dialog open={Boolean(selectedJournal)} onOpenChange={(open) => { if (!open) setSelectedPaymentId(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedJournal?.number} · Vendor payment journal</DialogTitle><DialogDescription>{selectedPayment?.number} · {selectedPayment?.reference}</DialogDescription></DialogHeader>{selectedJournal ? <JournalEntryContent entry={selectedJournal} showSourceLink={false} /> : null}</DialogContent></Dialog>
    </div>
  );
}
