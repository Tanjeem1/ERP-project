"use client";

import { ArrowRight, Check, CheckCircle2, PackageCheck, Ship } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatMoney } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useErpStore } from "@/store/useErpStore";
import type { PurchaseOrder } from "@/types/erp";

export function PurchaseOrderDetail({ order, onReceive, onViewReceipt }: { order: PurchaseOrder; onReceive: () => void; onViewReceipt: (receiptId: string) => void }) {
  const suppliers = useErpStore((state) => state.suppliers);
  const warehouses = useErpStore((state) => state.warehouses);
  const products = useErpStore((state) => state.products);
  const receipts = useErpStore((state) => state.goodsReceipts);
  const approve = useErpStore((state) => state.approvePurchaseOrder);
  const markInTransit = useErpStore((state) => state.markPurchaseOrderInTransit);
  const { can } = usePermissions();
  const supplier = suppliers.find((item) => item.id === order.supplierId);
  const warehouse = warehouses.find((item) => item.id === order.destinationWarehouseId);
  const totalBaseMinor = order.lines.reduce((sum, line) => sum + Math.round(line.orderedQuantity * line.unitCostMinor * order.fxRateToBase), 0);
  const receipt = receipts.find((item) => item.purchaseOrderId === order.id);
  const currentStep = order.status === "Pending Approval" ? 0 : ["Draft", "Approved", "In Transit", "Received"].indexOf(order.status);
  const [pending, setPending] = useState(false);
  const runAction = async (action: "approve" | "transit") => {
    if (pending) return;
    setPending(true);
    try {
      if (action === "approve") { await approve(order.id); toast.success(`${order.number} approved`, { description: "The PO can now be marked in transit or received." }); }
      else { await markInTransit(order.id); toast.success(`${order.number} is in transit`, { description: "Outstanding quantities now appear in inbound warehouse stock." }); }
    } catch (error) { toast.error("Purchase order could not be updated", { description: error instanceof Error ? error.message : "Unknown error" }); } finally { setPending(false); }
  };

  return (
    <><SheetHeader><div className="flex items-center gap-3"><SheetTitle>{order.number}</SheetTitle><StatusBadge status={order.status} /></div><SheetDescription>{supplier?.name} · {order.reference}</SheetDescription></SheetHeader><div className="flex-1 space-y-6 p-5">
      <section className="grid grid-cols-4 gap-2" aria-label="Purchase order lifecycle">{["Draft", "Approved", "In Transit", "Received"].map((step, index) => <div key={step} className="text-center"><div className={cn("mx-auto grid size-7 place-items-center rounded-full border text-[10px]", index < currentStep ? "border-emerald-500 bg-emerald-500 text-white" : index === currentStep ? "border-primary bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{index < currentStep ? <Check className="size-3.5" /> : index + 1}</div><p className={cn("mt-2 text-[9px]", index <= currentStep ? "font-medium text-foreground" : "text-muted-foreground")}>{step}</p></div>)}</section>
      <section className="grid grid-cols-2 gap-3"><div className="rounded-lg border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Base order value</p><p className="numeric mt-2 text-xl font-semibold">{formatMoney(totalBaseMinor)}</p><p className="mt-1 text-[10px] text-muted-foreground">{order.currency} → USD at {order.fxRateToBase}</p></div><div className="rounded-lg border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Expected arrival</p><p className="mt-2 text-sm font-semibold">{new Date(order.expectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p><p className="mt-1 text-[10px] text-muted-foreground">Payment terms {supplier?.paymentTermsDays} days</p></div></section>
      <section><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination</h3><div className="mt-3 flex gap-3 rounded-lg border p-4"><div><p className="text-sm font-medium">{warehouse?.name}</p><p className="mt-1 text-xs text-muted-foreground">{warehouse?.code} · {warehouse?.address.city}, {warehouse?.address.region}</p></div></div></section>
      <section><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Purchase lines</h3><div className="mt-3 overflow-x-auto rounded-lg border"><table className="w-full min-w-[480px] text-left text-xs"><thead className="bg-secondary/40 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">SKU</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Ordered</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Received</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Unit cost</th></tr></thead><tbody>{order.lines.map((line) => { const product = products.find((item) => item.id === line.productId); return <tr key={line.id} className="border-t"><td className="px-4 py-3"><p className="font-mono font-medium text-primary">{product?.sku}</p><p className="mt-1 text-[10px] text-muted-foreground">{product?.name}</p></td><td className="numeric px-3 py-3 text-right">{line.orderedQuantity.toLocaleString()}</td><td className="numeric px-3 py-3 text-right">{line.receivedQuantity.toLocaleString()}</td><td className="numeric px-3 py-3 text-right">{formatMoney(line.unitCostMinor, order.currency)}</td></tr>; })}</tbody></table></div></section>
      {order.approvalReason && order.status === "Pending Approval" ? <section className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4"><p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Approval required</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{order.approvalReason}</p></section> : null}
      {receipt ? <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><div className="flex gap-3"><CheckCircle2 className="size-5 text-emerald-600" /><div><p className="text-sm font-medium">Received as {receipt.number}</p><p className="mt-1 text-xs text-muted-foreground">{formatMoney(receipt.totalLandedCostBaseMinor)} capitalized charges · {formatMoney(receipt.totalInventoryBaseMinor)} inventory value</p></div></div></section> : null}
    </div><SheetFooter>{(order.status === "Draft" || order.status === "Pending Approval") && (can("approveTransactions") || can("manageProcurement")) ? <Button onClick={() => runAction("approve")}>Approve purchase order<ArrowRight /></Button> : null}{order.status === "Approved" && can("manageProcurement") ? <><Button variant="outline" onClick={() => runAction("transit")}><Ship />Mark in transit</Button><Button onClick={onReceive}><PackageCheck />Receive now</Button></> : null}{order.status === "In Transit" && can("manageProcurement") ? <Button onClick={onReceive}><PackageCheck />Open landed cost allocator</Button> : null}{order.status === "Received" && receipt ? <Button onClick={() => onViewReceipt(receipt.id)}>View {receipt.number}<ArrowRight /></Button> : null}</SheetFooter></>
  );
}
