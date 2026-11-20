"use client";

import { CheckCircle2, Scale } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMoney } from "@/lib/utils";
import { consumeFifoLayers, useErpStore, type ShipOrderResult } from "@/store/useErpStore";
import type { SalesOrder } from "@/types/erp";

export function ShipOrderDialog({ order, open, onOpenChange, onShipped }: { order: SalesOrder; open: boolean; onOpenChange: (open: boolean) => void; onShipped: (result: ShipOrderResult) => void }) {
  const state = useErpStore();
  const { can } = usePermissions();
  const customer = state.customers.find((item) => item.id === order.customerId);
  const previewLines = order.lines.map((line) => {
    const product = state.products.find((item) => item.id === line.productId);
    try {
      return { product, line, consumption: consumeFifoLayers(state.costLayers, line.productId, order.warehouseId, line.quantity), error: null };
    } catch (error) {
      return { product, line, consumption: null, error: error instanceof Error ? error.message : "FIFO preview failed" };
    }
  });
  const cogsMinor = previewLines.reduce((sum, item) => sum + (item.consumption?.totalCostMinor ?? 0), 0);
  const subtotalMinor = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  const taxMinor = Math.round(subtotalMinor * (customer?.taxRateBasisPoints ?? 0) / 10000);
  const totalMinor = subtotalMinor + taxMinor;
  const totalBaseMinor = Math.round(subtotalMinor * order.fxRateToBase) + Math.round(taxMinor * order.fxRateToBase);
  const hasError = previewLines.some((item) => item.error);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ship = async () => {
    if (pending || hasError) return;
    setErrorMessage(null);
    setPending(true);
    try {
      const result = await state.shipOrder(order.id);
      toast.success(`${order.number} shipped and invoiced`, { description: `Two balanced journals posted. Actual FIFO COGS: ${formatMoney(result.cogsBaseMinor)}.` });
      onShipped(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(`${message} Refresh the order before retrying in case the server completed the posting.`);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Ship {order.number}?</DialogTitle><DialogDescription>Consume reservations and oldest FIFO layers, issue the tax invoice, and post two balanced journal entries.</DialogDescription></DialogHeader>
      <div className="p-5">
        <div className="scrollbar-thin overflow-x-auto rounded-lg border"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-secondary/40 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">SKU</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Units</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">FIFO layer split</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">COGS</th></tr></thead><tbody>{previewLines.map((item) => <tr key={item.line.id} className="border-t"><td className="px-4 py-3 font-mono font-medium text-primary">{item.product?.sku}</td><td className="numeric px-3 py-3 text-right">{item.line.quantity}</td><td className="numeric px-3 py-3 text-[10px] text-muted-foreground">{item.consumption?.layers.map((layer) => `${layer.quantity} @ ${formatMoney(layer.unitCostMinor)}`).join(" + ") ?? item.error}</td><td className="numeric px-3 py-3 text-right font-medium">{formatMoney(item.consumption?.totalCostMinor ?? 0)}</td></tr>)}</tbody></table></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Actual FIFO COGS</p><p className="numeric mt-2 text-xl font-semibold">{formatMoney(cogsMinor)}</p></div><div className="rounded-lg border bg-secondary/30 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Invoice incl. tax</p><p className="numeric mt-2 text-xl font-semibold">{formatMoney(totalMinor, order.currency)}</p></div><div className="rounded-lg border border-slate-200 bg-card p-4 dark:border-white/10"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Gross profit</p><p className="numeric mt-2 text-xl font-semibold">{can("viewProfit") ? formatMoney(Math.round(subtotalMinor * order.fxRateToBase) - cogsMinor) : "Restricted"}</p></div></div>
        <div className="mt-4 rounded-lg border bg-card p-4"><div className="flex items-center gap-2"><Scale className="size-4 text-primary" /><h3 className="text-xs font-semibold">Accounting generated on confirmation</h3></div>{can("viewLedger") ? <div className="mt-3 grid gap-2 font-mono text-[10px]"><p>DR FIFO COGS / CR Inventory Asset · {formatMoney(cogsMinor)}</p><p>DR Accounts Receivable / CR Sales Revenue + Tax Payable · {formatMoney(totalBaseMinor)}</p></div> : <p className="mt-3 text-xs text-muted-foreground">The server posts the accounting automatically. Ledger details are restricted by your role.</p>}<div className="mt-3 flex items-center gap-2 border-t pt-3 text-[10px] text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-4" />Both entries are validated and committed atomically by the server.</div></div>
        {hasError ? <p role="alert" className="mt-3 text-xs text-destructive">A FIFO layer shortage was detected. Review inventory before shipping.</p> : null}
        {errorMessage ? <p role="alert" className="mt-3 text-xs leading-5 text-destructive">{errorMessage}</p> : null}
      </div>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void ship()} disabled={hasError || pending}>{pending ? "Posting shipment…" : "Confirm shipment & post accounting"}</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
