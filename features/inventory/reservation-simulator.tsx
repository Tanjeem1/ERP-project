"use client";

import { CheckCircle2, Play, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import type { InventoryRow } from "@/features/inventory/inventory-table";

interface SimulationLog {
  id: number;
  channel: string;
  success: boolean;
  message: string;
  time: string;
}

export function ReservationSimulator({ rows }: { rows: InventoryRow[] }) {
  const state = useErpStore();
  const [positionId, setPositionId] = useState(rows[0]?.id ?? "");
  const [lockId, setLockId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [logs, setLogs] = useState<SimulationLog[]>([]);
  const selected = rows.find((row) => row.id === positionId) ?? rows.find((row) => row.atp > 0) ?? rows[0];
  const activeLock = state.reservations.find((reservation) => reservation.id === lockId && reservation.status === "Active");
  const addLog = (channel: string, success: boolean, message: string) => setLogs((current) => [...current, { id: Date.now() + current.length, channel, success, message, time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }]);
  const runSimulation = async () => {
    if (!selected || selected.atp <= 0 || activeLock || pending) return;
    setPending(true);
    setLogs([]);
    try {
      const lock = await state.reserveStock({ productId: selected.productId, warehouseId: selected.warehouseId, channel: "B2B Wholesale", reference: `SIM-B2B-${selected.sku}`, quantity: selected.atp, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
      setLockId(lock.id);
      addLog("B2B Wholesale", true, `${selected.atp} units locked atomically. ATP is now zero.`);
      try {
        await state.reserveStock({ productId: selected.productId, warehouseId: selected.warehouseId, channel: "Shopify Sync", reference: `SIM-WEBHOOK-${selected.sku}`, quantity: 1, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
        addLog("Shopify Webhook", true, "The webhook acquired a lock after the first reservation was released.");
      } catch (error) {
        addLog("Shopify Webhook", false, error instanceof Error ? error.message : "Request rejected because no ATP remains.");
      }
    } catch (error) {
      addLog("B2B Wholesale", false, error instanceof Error ? error.message : "B2B reservation failed.");
    } finally { setPending(false); }
  };
  const releaseLock = async () => {
    if (!activeLock || pending) return;
    setPending(true);
    try {
      await state.releaseReservation(activeLock.id);
      addLog("Stock controller", true, `${activeLock.quantity} units released back to Available to Promise.`);
      setLockId(null);
      toast.success("Simulation lock released", { description: "Available to Promise has been restored." });
    } catch (error) { toast.error("Unable to release lock", { description: error instanceof Error ? error.message : "Unknown error" }); } finally { setPending(false); }
  };
  if (!selected) return null;
  const b2bResult = logs.find((log) => log.channel === "B2B Wholesale");
  const shopifyResult = logs.find((log) => log.channel === "Shopify Webhook");

  return (
    <Card id="reservation-simulator" className="scroll-mt-24"><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-sm">Stock Reservation Simulator</CardTitle><CardDescription className="mt-1">Two channels compete for the same live ATP. Only one reservation can succeed.</CardDescription></div><Badge variant={activeLock ? "warning" : "secondary"}>{activeLock ? "LOCK ACTIVE" : "READY"}</Badge></div></CardHeader><CardContent className="pt-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end"><div className="flex-1 space-y-2"><label htmlFor="simulation-position" className="text-xs font-medium">Inventory position</label><select id="simulation-position" value={selected.id} disabled={Boolean(activeLock)} onChange={(event) => { setPositionId(event.target.value); setLogs([]); setLockId(null); }} className="h-10 w-full rounded-md border bg-card px-3 text-xs">{rows.map((row) => <option key={row.id} value={row.id}>{row.sku} · {row.warehouse} · {row.atp} ATP</option>)}</select></div><Button onClick={runSimulation} disabled={selected.atp <= 0 || Boolean(activeLock)}><Play />Run concurrency simulation</Button>{activeLock ? <Button variant="outline" onClick={releaseLock}><RotateCcw />Release lock</Button> : null}</div><div className="mt-5 grid gap-4 border-y py-5 lg:grid-cols-2 lg:divide-x lg:divide-slate-200 dark:lg:divide-white/10"><ChannelCard title="B2B Sales Order" request={`Lock all ${selected.atp} ATP`} result={b2bResult?.success ? "STOCK LOCKED" : b2bResult ? "REJECTED" : "WAITING"} success={b2bResult?.success} /><ChannelCard title="E-commerce Webhook" request="Request 1 more unit" result={shopifyResult ? "SAFELY REJECTED" : "WAITING"} success={shopifyResult ? false : undefined} /></div><div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]"><section><h3 className="text-xs font-semibold">Live stock state</h3><dl className="mt-4 grid grid-cols-3 border-l border-t border-slate-200 dark:border-white/10"><div className="border-b border-r border-slate-200 p-3 dark:border-white/10"><dt className="text-xs text-muted-foreground">On hand</dt><dd className="numeric mt-2 text-xl font-semibold">{selected.onHand}</dd></div><div className="border-b border-r border-slate-200 p-3 dark:border-white/10"><dt className="text-xs text-muted-foreground">Locked</dt><dd className="numeric mt-2 text-xl font-semibold">{selected.reserved}</dd></div><div className="border-b border-r border-slate-200 p-3 dark:border-white/10"><dt className="text-xs text-muted-foreground">ATP</dt><dd className={cn("numeric mt-2 text-xl font-semibold", selected.atp === 0 && "text-destructive")}>{selected.atp}</dd></div></dl><p className="numeric mt-4 border-t pt-3 text-xs text-muted-foreground">ATP = {selected.onHand} on hand - {selected.reserved} active reservations</p></section><section className="rounded-lg border border-white/15 bg-[#0b1726] p-4 text-white"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Reservation event log</h3><span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="size-1.5 rounded-full bg-emerald-400" />Live events</span></div><div className="mt-3 max-h-44 divide-y divide-white/10 overflow-y-auto">{logs.length === 0 ? <p className="py-6 text-center text-xs text-slate-500">Run the simulation to see actual reservation results.</p> : logs.map((log) => <div key={log.id} className="flex gap-2.5 py-3"><div className={cn("mt-0.5", log.success ? "text-emerald-400" : "text-amber-400")}>{log.success ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}</div><div><p className="text-xs font-medium">{log.channel}<span className="numeric ml-2 text-[10px] font-normal text-slate-500">{log.time}</span></p><p className="mt-1 text-xs leading-5 text-slate-400">{log.message}</p></div></div>)}</div></section></div></CardContent></Card>
  );
}

function ChannelCard({ title, request, result, success }: { title: string; request: string; result: string; success?: boolean }) {
  return <article className="lg:px-5 lg:first:pl-0"><div className="flex items-center justify-between gap-4"><h3 className="text-sm font-semibold tracking-tight">{title}</h3><span className={cn("text-xs font-medium", success === false ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{result}</span></div><p className="numeric mt-2 text-xs text-muted-foreground">{request}</p></article>;
}
