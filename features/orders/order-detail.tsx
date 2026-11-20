"use client";

import { ArrowRight, Check, FileText, LockKeyhole, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatMoney } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useErpStore } from "@/store/useErpStore";
import type { SalesOrder } from "@/types/erp";

export function OrderDetail({ order, onShip, onInvoice }: { order: SalesOrder; onShip: () => void; onInvoice: (invoiceId: string) => void }) {
  const state = useErpStore();
  const { can } = usePermissions();
  const customer = state.customers.find((item) => item.id === order.customerId);
  const warehouse = state.warehouses.find((item) => item.id === order.warehouseId);
  const subtotalMinor = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  const taxMinor = Math.round(subtotalMinor * (customer?.taxRateBasisPoints ?? 0) / 10000);
  const currentStep = order.status === "Pending Approval" || order.status === "Order Placed" ? 0 : order.status === "Pick & Pack" ? 1 : order.status === "Shipped" ? 2 : 3;
  const [pending, setPending] = useState(false);
  const releasePickPack = async () => {
    if (pending) return;
    setPending(true);
    try { await state.moveOrderToPickPack(order.id); toast.success(`${order.number} released to Pick & Pack`, { description: "Stock reservations remain locked." }); }
    catch (error) { toast.error("Unable to release pick wave", { description: error instanceof Error ? error.message : "Unknown error" }); } finally { setPending(false); }
  };

  return (
    <><SheetHeader><div className="flex flex-wrap items-center gap-3"><SheetTitle>{order.number}</SheetTitle><StatusBadge status={order.status} /><Badge variant="outline">{order.channel}</Badge></div><SheetDescription>{customer?.name} · {order.reference}</SheetDescription></SheetHeader><div className="flex-1 space-y-6 p-5"><section className="grid grid-cols-4 gap-2" aria-label="Order fulfillment progress">{["Order Placed", "Pick & Pack", "Shipped", "Invoiced"].map((step, index) => <div key={step} className="text-center"><div className={cn("mx-auto grid size-7 place-items-center rounded-full border text-[10px]", index < currentStep ? "border-emerald-500 bg-emerald-500 text-white" : index === currentStep ? "border-primary bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{index < currentStep ? <Check className="size-3.5" /> : index + 1}</div><p className={cn("mt-2 text-[9px]", index <= currentStep ? "font-medium text-foreground" : "text-muted-foreground")}>{step}</p></div>)}</section><section className="grid grid-cols-2 gap-3"><div className="rounded-lg border bg-secondary/30 p-4"><Truck className="size-4 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fulfillment node</p><p className="mt-1 text-sm font-medium">{warehouse?.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{warehouse?.code}</p></div><div className="rounded-lg border bg-secondary/30 p-4"><ShoppingBag className="size-4 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Order value</p><p className="numeric mt-1 text-xl font-semibold">{formatMoney(subtotalMinor + taxMinor, order.currency)}</p><p className="mt-1 text-[10px] text-muted-foreground">Including {formatMoney(taxMinor, order.currency)} estimated tax</p></div></section><section><div className="flex items-center gap-2"><LockKeyhole className="size-4 text-amber-500" /><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lines and reservation locks</h3></div><div className="mt-3 space-y-3">{order.lines.map((line) => { const product = state.products.find((item) => item.id === line.productId); const reservation = state.reservations.find((item) => item.id === line.reservationId); return <article key={line.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-medium text-primary">{product?.sku}</p><p className="mt-1 text-[10px] text-muted-foreground">{product?.name}</p></div><Badge variant={reservation?.status === "Active" || order.status === "Pending Approval" ? "warning" : "success"}>{reservation?.status ?? "Not Locked"}</Badge></div><div className="mt-3 grid grid-cols-3 gap-3 text-[10px]"><div><p className="text-muted-foreground">Quantity</p><p className="numeric mt-1 font-medium">{line.quantity}</p></div><div><p className="text-muted-foreground">Unit price</p><p className="numeric mt-1 font-medium">{formatMoney(line.unitPriceMinor, order.currency)}</p></div><div><p className="text-muted-foreground">Line total</p><p className="numeric mt-1 font-medium">{formatMoney(line.quantity * line.unitPriceMinor, order.currency)}</p></div></div></article>; })}</div></section>{order.invoiceId ? <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4"><div className="flex gap-3"><FileText className="size-5 text-emerald-600" /><div><p className="text-sm font-medium">Invoice and accounting generated</p><p className="mt-1 text-xs text-muted-foreground">FIFO COGS, Inventory Asset, Accounts Receivable, Sales Revenue, and Tax Payable have been updated.</p></div></div></section> : null}{order.approvalReason && order.status === "Pending Approval" ? <section className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4"><p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Credit approval required</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{order.approvalReason}</p><p className="mt-2 text-[10px] text-muted-foreground">Inventory will not be reserved until an authorized approval is complete.</p></section> : null}</div><SheetFooter>{order.status === "Order Placed" && can("fulfillOrders") ? <><Button variant="outline" onClick={releasePickPack}><PackageCheck />Release pick & pack</Button><Button onClick={onShip}>Ship order<ArrowRight /></Button></> : null}{order.status === "Pick & Pack" && can("fulfillOrders") ? <Button onClick={onShip}>Ship order & generate accounting<ArrowRight /></Button> : null}{order.invoiceId ? <Button onClick={() => onInvoice(order.invoiceId as string)}><FileText />Preview tax invoice<ArrowRight /></Button> : null}</SheetFooter></>
  );
}
