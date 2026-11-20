"use client";

import { CheckCircle2, ClipboardCheck, RotateCcw, ShieldAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { JournalEntryContent } from "@/components/erp/record-detail";
import { PageHeader } from "@/components/erp/page-header";
import { StatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { getCustomerOutstandingMinor } from "@/lib/balances";
import { cn, formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { ReturnCondition } from "@/types/erp";

export function ReturnsView() {
  const hydrated = useHydrated();
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = useErpStore();
  const { can } = usePermissions();
  const [tab, setTab] = useState<"rma" | "audit">("rma");
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<Record<string, ReturnCondition>>({});
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(searchParams.get("return"));
  const [warehouseId, setWarehouseId] = useState(state.warehouses[0]?.id ?? "");
  const [productId, setProductId] = useState(state.products[0]?.id ?? "");
  const [countedQuantity, setCountedQuantity] = useState(0);
  const [auditReason, setAuditReason] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(searchParams.get("audit"));
  const shippedOrders = state.orders.filter((order) => order.status === "Invoiced" || order.status === "Shipped");
  const selectedOrder = shippedOrders.find((order) => order.id === orderId) ?? shippedOrders[0];
  const selectedReturn = state.salesReturns.find((item) => item.id === selectedReturnId);
  const selectedAudit = state.stockAudits.find((item) => item.id === selectedAuditId);
  const auditPosition = state.inventory.find((position) => position.productId === productId && position.warehouseId === warehouseId);
  const auditDelta = countedQuantity - (auditPosition?.onHand ?? 0);
  const submitReturn = async () => {
    if (!selectedOrder || pending) return;
    setPending(true);
    try {
      const lines = selectedOrder.lines.filter((line) => (quantities[line.id] ?? 0) > 0).map((line) => ({ orderLineId: line.id, quantity: quantities[line.id] ?? 0, condition: conditions[line.id] ?? "Restockable" }));
      const result = await state.createSalesReturn({ orderId: selectedOrder.id, reason, lines });
      toast.success(`${result.number} and credit note posted`, { description: "Inventory, shrinkage, customer debt, revenue, tax, and COGS were updated." });
      setSelectedReturnId(result.id);
      router.replace(`/app/returns?return=${result.id}`);
    } catch (error) { toast.error("Return could not be posted", { description: error instanceof Error ? error.message : "Select at least one returned unit." }); } finally { setPending(false); }
  };
  const submitAudit = async () => {
    if (pending) return;
    setPending(true);
    try {
      const audit = await state.createStockAudit({ warehouseId, productId, countedQuantity, reason: auditReason });
      toast.success(`${audit.number} posted`, { description: "Physical and system stock now match. The shrinkage journal is balanced." });
      setSelectedAuditId(audit.id);
      router.replace(`/app/returns?audit=${audit.id}`);
    } catch (error) { toast.error("Stock audit could not be posted", { description: error instanceof Error ? error.message : "Unknown error" }); } finally { setPending(false); }
  };

  if (!hydrated) return <Skeleton className="h-[640px]" />;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Sales returns, credit notes, and stock write-offs" description="Restock sellable units, expense damaged or expired goods, issue customer credit, and reconcile physical warehouse counts with exact ledger adjustments." />
      <div className="flex gap-1 rounded-lg border bg-card p-1"><button type="button" onClick={() => setTab("rma")} className={cn("rounded-md px-3 py-2 text-xs font-medium", tab === "rma" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><RotateCcw className="mr-1.5 inline size-3.5" />Sales Returns (RMA)</button><button type="button" onClick={() => setTab("audit")} className={cn("rounded-md px-3 py-2 text-xs font-medium", tab === "audit" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><ClipboardCheck className="mr-1.5 inline size-3.5" />Stock Audit & Write-Off</button></div>
      {tab === "rma" ? <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card><CardHeader className="border-b"><CardTitle className="text-sm">Create sales return</CardTitle><CardDescription>Select an invoiced order and returned SKU quantities</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="rma-order">Shipped sales order</Label><select id="rma-order" value={selectedOrder?.id} onChange={(event) => { setOrderId(event.target.value); setQuantities({}); setConditions({}); }} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{shippedOrders.map((order) => <option key={order.id} value={order.id}>{order.number} · {state.customers.find((customer) => customer.id === order.customerId)?.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="rma-reason">Return reason</Label><Input id="rma-reason" required value={reason} onChange={(event) => setReason(event.target.value)} /></div><div className="space-y-3">{selectedOrder?.lines.map((line) => { const product = state.products.find((item) => item.id === line.productId); const remaining = line.shippedQuantity - (line.returnedQuantity ?? 0); const condition = conditions[line.id] ?? "Restockable"; return <article key={line.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs font-semibold text-primary">{product?.sku}</p><p className="mt-1 text-[10px] text-muted-foreground">{product?.name} · {remaining} returnable</p></div><Badge variant="secondary">{formatMoney(line.unitPriceMinor)} / unit</Badge></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`rma-qty-${line.id}`} className="text-xs">Return quantity</Label><Input id={`rma-qty-${line.id}`} type="number" min="0" max={remaining} step="1" value={quantities[line.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.valueAsNumber }))} className="numeric" /></div><div className="space-y-2"><Label htmlFor={`rma-condition-${line.id}`} className="text-xs">Condition</Label><select id={`rma-condition-${line.id}`} value={condition} onChange={(event) => setConditions((current) => ({ ...current, [line.id]: event.target.value as ReturnCondition }))} className="h-10 w-full rounded-md border bg-card px-3 text-xs"><option>Restockable</option><option>Damaged/Expired</option></select></div></div></article>; })}</div><Button onClick={submitReturn} disabled={!can("fulfillOrders") || !selectedOrder?.lines.some((line) => (quantities[line.id] ?? 0) > 0)}><RotateCcw />Post return & credit note</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Return accounting logic</CardTitle><CardDescription>Actual shipment cost and customer selling price remain separate</CardDescription></CardHeader><CardContent className="space-y-4 text-xs leading-6 text-muted-foreground"><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><p className="font-medium text-emerald-700 dark:text-emerald-400">Restockable goods</p><p className="mt-1">A restored FIFO layer is created at actual shipment cost. Inventory Asset increases and COGS reverses.</p></div><div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4"><p className="font-medium text-amber-700 dark:text-amber-400">Damaged / expired goods</p><p className="mt-1">No stock is restored. Actual shipment cost posts to Inventory Shrinkage Expense and reverses COGS.</p></div><div className="rounded-lg border bg-secondary/35 p-4"><p className="font-medium">Customer credit note</p><p className="mt-1">Returned selling value plus tax debits Revenue and Tax Payable, and credits Accounts Receivable.</p></div></CardContent></Card></div> : null}
      {tab === "audit" ? <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><Card><CardHeader className="border-b"><CardTitle className="text-sm">Physical stock audit</CardTitle><CardDescription>Compare physical count with the live system position</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="audit-warehouse">Warehouse</Label><select id="audit-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{state.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="audit-product">SKU</Label><select id="audit-product" value={productId} onChange={(event) => setProductId(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{state.products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="audit-count">Physical counted quantity</Label><Input id="audit-count" type="number" min="0" step="1" value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2"><Label htmlFor="audit-reason">Audit reason</Label><Input id="audit-reason" required value={auditReason} onChange={(event) => setAuditReason(event.target.value)} /></div><Button onClick={submitAudit} disabled={!can("manageInventory") || auditDelta === 0}><ClipboardCheck />Post count adjustment</Button></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Adjustment preview</CardTitle><CardDescription>Live system quantity vs. your physical count</CardDescription></CardHeader><CardContent><div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-lg border p-4"><p className="text-[10px] text-muted-foreground">System</p><p className="numeric mt-2 text-2xl font-semibold">{auditPosition?.onHand ?? 0}</p></div><div className="rounded-lg border p-4"><p className="text-[10px] text-muted-foreground">Counted</p><p className="numeric mt-2 text-2xl font-semibold">{countedQuantity}</p></div><div className={cn("rounded-lg border p-4", auditDelta < 0 ? "border-rose-500/20 bg-rose-500/[0.05]" : "border-emerald-500/20 bg-emerald-500/[0.05]")}><p className="text-[10px] text-muted-foreground">Delta</p><p className={cn("numeric mt-2 text-2xl font-semibold", auditDelta < 0 ? "text-rose-600" : "text-foreground")}>{auditDelta > 0 ? `+${auditDelta}` : auditDelta}</p></div></div><div className="mt-4 rounded-lg border bg-secondary/35 p-4 text-xs leading-6 text-muted-foreground">{auditDelta < 0 ? "Debit Inventory Shrinkage Expense and credit Inventory Asset for the shortage." : auditDelta > 0 ? "Debit Inventory Asset and credit Inventory Shrinkage for the surplus." : "No adjustment is required for this count."}</div></CardContent></Card></div> : null}
      <section className="grid gap-5 xl:grid-cols-2"><Card><CardHeader className="border-b"><CardTitle className="text-sm">Recent sales returns</CardTitle><CardDescription>Completed RMA documents and customer credit notes</CardDescription></CardHeader><div className="divide-y">{state.salesReturns.map((item) => <button key={item.id} type="button" onClick={() => setSelectedReturnId(item.id)} className="block w-full p-4 text-left hover:bg-accent/30"><div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold text-primary">{item.number}</span><StatusBadge status={item.status} /></div><p className="mt-1 text-[10px] text-muted-foreground">{item.orderNumber} · {item.reason}</p><div className="mt-2 flex gap-4 text-[10px]"><span>Restored {formatMoney(item.restoredValueBaseMinor)}</span><span>Shrinkage {formatMoney(item.shrinkageBaseMinor)}</span></div></button>)}{state.salesReturns.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No sales returns have been posted.</p> : null}</div></Card><Card><CardHeader className="border-b"><CardTitle className="text-sm">Recent stock adjustments</CardTitle><CardDescription>Physical audit and shrinkage journals</CardDescription></CardHeader><div className="divide-y">{state.stockAudits.map((audit) => <button key={audit.id} type="button" onClick={() => setSelectedAuditId(audit.id)} className="block w-full p-4 text-left hover:bg-accent/30"><div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold text-primary">{audit.number}</span><span className={cn("numeric text-xs font-semibold", audit.deltaQuantity < 0 ? "text-rose-600" : "text-foreground")}>{audit.deltaQuantity > 0 ? `+${audit.deltaQuantity}` : audit.deltaQuantity}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{audit.systemQuantity} system → {audit.countedQuantity} counted · {audit.reason}</p><p className="numeric mt-2 text-[10px]">{formatMoney(audit.valueDeltaBaseMinor)}</p></button>)}{state.stockAudits.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No physical stock adjustments have been posted.</p> : null}</div></Card></section>
      <Dialog open={Boolean(selectedReturn)} onOpenChange={(open) => { if (!open) setSelectedReturnId(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedReturn?.number} · Sales return completed</DialogTitle><DialogDescription>{selectedReturn?.orderNumber} · {selectedReturn?.reason}</DialogDescription></DialogHeader>{selectedReturn ? <ReturnDetail returnId={selectedReturn.id} /> : null}</DialogContent></Dialog>
      <Dialog open={Boolean(selectedAudit)} onOpenChange={(open) => { if (!open) setSelectedAuditId(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedAudit?.number} · Stock audit adjustment</DialogTitle><DialogDescription>{selectedAudit?.reason}</DialogDescription></DialogHeader>{selectedAudit ? <AuditDetail auditId={selectedAudit.id} /> : null}</DialogContent></Dialog>
    </div>
  );
}

function ReturnDetail({ returnId }: { returnId: string }) {
  const state = useErpStore();
  const item = state.salesReturns.find((entry) => entry.id === returnId);
  if (!item) return null;
  const creditNote = state.creditNotes.find((note) => note.id === item.creditNoteId);
  const journals = state.journalEntries.filter((entry) => item.journalEntryIds.includes(entry.id));
  return <div className="p-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><p className="text-[10px] text-muted-foreground">Restocked value</p><p className="numeric mt-2 text-xl font-semibold text-foreground">{formatMoney(item.restoredValueBaseMinor)}</p></div><div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4"><p className="text-[10px] text-muted-foreground">Shrinkage</p><p className="numeric mt-2 text-xl font-semibold text-amber-600">{formatMoney(item.shrinkageBaseMinor)}</p></div><div className="rounded-lg border p-4"><p className="text-[10px] text-muted-foreground">Credit note</p><p className="numeric mt-2 text-xl font-semibold text-primary">{formatMoney(creditNote?.amountBaseMinor ?? 0)}</p></div></div><div className="mt-4 space-y-2">{item.lines.map((line) => { const product = state.products.find((product) => product.id === line.productId); return <div key={line.orderLineId} className="flex justify-between rounded-lg border p-3 text-xs"><span>{product?.sku} · {line.quantity} units · {line.condition}</span><span className="numeric">{formatMoney(line.unitCostBaseMinor)}</span></div>; })}</div><div className="mt-4 rounded-lg bg-secondary/35 p-3 text-xs"><ShieldAlert className="mr-2 inline size-4 text-primary" />Customer debt is now {formatMoney(getCustomerOutstandingMinor(state, item.customerId))}. Revenue, tax, COGS, and inventory were adjusted automatically.</div>{journals.map((entry) => <details key={entry.id} className="mt-3 rounded-lg border px-4" name="return-journal"><summary className="cursor-pointer py-3 text-xs font-semibold">{entry.number} · View balanced journal</summary><JournalEntryContent entry={entry} showSourceLink={false} /></details>)}</div>;
}

function AuditDetail({ auditId }: { auditId: string }) {
  const state = useErpStore();
  const audit = state.stockAudits.find((item) => item.id === auditId);
  const journal = state.journalEntries.find((entry) => entry.id === audit?.journalEntryId);
  if (!audit) return null;
  return <div className="p-5"><div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-lg border p-4"><p className="text-[10px] text-muted-foreground">System</p><p className="numeric mt-2 text-xl font-semibold">{audit.systemQuantity}</p></div><div className="rounded-lg border p-4"><p className="text-[10px] text-muted-foreground">Counted</p><p className="numeric mt-2 text-xl font-semibold">{audit.countedQuantity}</p></div><div className="rounded-lg border p-4"><p className="text-[10px] text-muted-foreground">Value delta</p><p className="numeric mt-2 text-xl font-semibold">{formatMoney(audit.valueDeltaBaseMinor)}</p></div></div>{journal ? <JournalEntryContent entry={journal} showSourceLink={false} /> : null}<div className="flex items-center gap-2 text-xs text-foreground"><CheckCircle2 className="size-4" />Physical count and system stock now match.</div></div>;
}
