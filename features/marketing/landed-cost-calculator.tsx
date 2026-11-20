"use client";

import { ArrowRight, CheckCircle2, Download, Layers3, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { allocateMinor, fromMinor, toMinor } from "@/lib/erp-math";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import type { CurrencyCode, LandedCostAllocationMethod } from "@/types/erp";

interface CalculatorLine {
  id: string;
  sku: string;
  receiptQuantity: number;
  unitCost: number;
  weightKg: number;
  volumeCbm: number;
  openingQuantity: number;
  openingUnitCost: number;
  saleQuantity: number;
  salePrice: number;
}

interface CalculatedRow {
  id: string;
  sku: string;
  receiptQuantity: number;
  baseGoodsMinor: number;
  basisShare: number;
  allocatedCostMinor: number;
  trueTotalMinor: number;
  trueUnitMinor: number;
  openingConsumed: number;
  receiptConsumed: number;
  cogsMinor: number;
  revenueMinor: number;
  grossProfitMinor: number;
  marginPercent: number;
  remainingQuantity: number;
  remainingValueMinor: number;
}

type CostKey = "freight" | "customs" | "handling" | "insurance";

const defaultLines: CalculatorLine[] = [
  { id: "line-coffee", sku: "CF-ARB-25", receiptQuantity: 100, unitCost: 12.5, weightKg: 25, volumeCbm: 0.082, openingQuantity: 40, openingUnitCost: 11.8, saleQuantity: 65, salePrice: 24.95 },
  { id: "line-olive", sku: "OLV-EVO-12", receiptQuantity: 80, unitCost: 8.5, weightKg: 12.6, volumeCbm: 0.021, openingQuantity: 20, openingUnitCost: 8.1, saleQuantity: 50, salePrice: 17.95 },
];

const methodLabels: Array<{ value: LandedCostAllocationMethod; label: string; detail: string }> = [
  { value: "weight", label: "By weight", detail: "kilograms" },
  { value: "volume", label: "By volume", detail: "cubic meters" },
  { value: "value", label: "By value", detail: "goods cost" },
];

function NumberField({ id, label, value, onChange, min = 0, step = "0.01", prefix }: { id: string; label: string; value: number; onChange: (value: number) => void; min?: number; step?: string; prefix?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">{prefix ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span> : null}<Input id={id} type="number" inputMode="decimal" min={min} step={step} value={value} onChange={(event) => onChange(event.target.valueAsNumber)} className={cn("numeric h-9 bg-background text-right text-xs", prefix && "pl-7")} /></div>
    </div>
  );
}

export function LandedCostCalculator() {
  const [lines, setLines] = useState<CalculatorLine[]>(structuredClone(defaultLines));
  const [method, setMethod] = useState<LandedCostAllocationMethod>("weight");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [costs, setCosts] = useState<Record<CostKey, number>>({ freight: 1250, customs: 480, handling: 185, insurance: 95 });

  const calculation = useMemo(() => {
    try {
      if (lines.length === 0) throw new Error("Add at least one SKU line.");
      const prepared = lines.map((line) => {
        if (!line.sku.trim()) throw new Error("Every line needs a SKU or product name.");
        if (!Number.isInteger(line.receiptQuantity) || line.receiptQuantity <= 0) throw new Error(`${line.sku}: receipt quantity must be a positive whole number.`);
        if (!Number.isInteger(line.openingQuantity) || line.openingQuantity < 0) throw new Error(`${line.sku}: opening quantity must be a non-negative whole number.`);
        if (!Number.isInteger(line.saleQuantity) || line.saleQuantity <= 0) throw new Error(`${line.sku}: sale quantity must be a positive whole number.`);
        if (line.saleQuantity > line.openingQuantity + line.receiptQuantity) throw new Error(`${line.sku}: sale quantity exceeds opening plus received stock.`);
        for (const [label, value] of [["unit cost", line.unitCost], ["opening cost", line.openingUnitCost], ["sale price", line.salePrice], ["weight", line.weightKg], ["volume", line.volumeCbm]] as const) {
          if (!Number.isFinite(value) || value < 0) throw new Error(`${line.sku}: ${label} must be a non-negative number.`);
        }
        return { ...line, unitCostMinor: toMinor(line.unitCost), openingUnitCostMinor: toMinor(line.openingUnitCost), salePriceMinor: toMinor(line.salePrice) };
      });
      const costsMinor = Object.fromEntries(Object.entries(costs).map(([key, value]) => {
        if (!Number.isFinite(value) || value < 0) throw new Error("Import charges must be non-negative numbers.");
        return [key, toMinor(value)];
      })) as Record<CostKey, number>;
      const basisValues = prepared.map((line) => method === "weight" ? line.weightKg * line.receiptQuantity : method === "volume" ? line.volumeCbm * line.receiptQuantity : line.unitCostMinor * line.receiptQuantity);
      const basisTotal = basisValues.reduce((sum, value) => sum + value, 0);
      const allocations = Object.fromEntries((Object.keys(costsMinor) as CostKey[]).map((key) => [key, allocateMinor(costsMinor[key], basisValues)])) as Record<CostKey, number[]>;
      const rows: CalculatedRow[] = prepared.map((line, index) => {
        const baseGoodsMinor = line.unitCostMinor * line.receiptQuantity;
        const allocatedCostMinor = (Object.keys(allocations) as CostKey[]).reduce((sum, key) => sum + (allocations[key][index] ?? 0), 0);
        const trueTotalMinor = baseGoodsMinor + allocatedCostMinor;
        const trueUnitMinor = trueTotalMinor / line.receiptQuantity;
        const openingTotalMinor = line.openingUnitCostMinor * line.openingQuantity;
        const openingConsumed = Math.min(line.saleQuantity, line.openingQuantity);
        const receiptConsumed = line.saleQuantity - openingConsumed;
        const openingCogsMinor = openingConsumed === line.openingQuantity ? openingTotalMinor : Math.round(line.openingUnitCostMinor * openingConsumed);
        const receiptCogsMinor = receiptConsumed === line.receiptQuantity ? trueTotalMinor : Math.round(trueUnitMinor * receiptConsumed);
        const cogsMinor = openingCogsMinor + receiptCogsMinor;
        const revenueMinor = line.salePriceMinor * line.saleQuantity;
        const grossProfitMinor = revenueMinor - cogsMinor;
        return {
          id: line.id,
          sku: line.sku,
          receiptQuantity: line.receiptQuantity,
          baseGoodsMinor,
          basisShare: basisTotal === 0 ? 0 : (basisValues[index] ?? 0) / basisTotal,
          allocatedCostMinor,
          trueTotalMinor,
          trueUnitMinor,
          openingConsumed,
          receiptConsumed,
          cogsMinor,
          revenueMinor,
          grossProfitMinor,
          marginPercent: revenueMinor === 0 ? 0 : (grossProfitMinor / revenueMinor) * 100,
          remainingQuantity: line.openingQuantity + line.receiptQuantity - line.saleQuantity,
          remainingValueMinor: openingTotalMinor + trueTotalMinor - cogsMinor,
        };
      });
      const totals = rows.reduce((sum, row) => ({
        baseGoodsMinor: sum.baseGoodsMinor + row.baseGoodsMinor,
        allocatedCostMinor: sum.allocatedCostMinor + row.allocatedCostMinor,
        trueTotalMinor: sum.trueTotalMinor + row.trueTotalMinor,
        cogsMinor: sum.cogsMinor + row.cogsMinor,
        revenueMinor: sum.revenueMinor + row.revenueMinor,
        grossProfitMinor: sum.grossProfitMinor + row.grossProfitMinor,
        remainingValueMinor: sum.remainingValueMinor + row.remainingValueMinor,
      }), { baseGoodsMinor: 0, allocatedCostMinor: 0, trueTotalMinor: 0, cogsMinor: 0, revenueMinor: 0, grossProfitMinor: 0, remainingValueMinor: 0 });
      return { rows, totals, error: null };
    } catch (error) {
      return { rows: [], totals: null, error: error instanceof Error ? error.message : "Unable to calculate this scenario." };
    }
  }, [lines, method, costs]);

  const money = (minor: number, digits = 2) => formatMoney(minor, currency, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const updateLine = <Key extends keyof CalculatorLine>(id: string, key: Key, value: CalculatorLine[Key]) => setLines((current) => current.map((line) => line.id === id ? { ...line, [key]: value } : line));
  const reset = () => { setLines(structuredClone(defaultLines)); setMethod("weight"); setCurrency("USD"); setCosts({ freight: 1250, customs: 480, handling: 185, insurance: 95 }); };
  const addLine = () => setLines((current) => [...current, { id: `line-${Date.now()}`, sku: `NEW-SKU-${current.length + 1}`, receiptQuantity: 100, unitCost: 10, weightKg: 1, volumeCbm: 0.01, openingQuantity: 0, openingUnitCost: 0, saleQuantity: 10, salePrice: 20 }]);
  const downloadCsv = () => {
    if (!calculation.totals) return;
    const header = "SKU,Received Qty,Base Goods,Allocated Cost,True Unit Cost,Opening Units Consumed,Receipt Units Consumed,FIFO COGS,Revenue,Gross Profit,Margin %,Remaining Qty,Remaining Value";
    const rows = calculation.rows.map((row) => [row.sku, row.receiptQuantity, fromMinor(row.baseGoodsMinor).toFixed(2), fromMinor(row.allocatedCostMinor).toFixed(2), fromMinor(row.trueUnitMinor).toFixed(4), row.openingConsumed, row.receiptConsumed, fromMinor(row.cogsMinor).toFixed(2), fromMinor(row.revenueMinor).toFixed(2), fromMinor(row.grossProfitMinor).toFixed(2), row.marginPercent.toFixed(2), row.remainingQuantity, fromMinor(row.remainingValueMinor).toFixed(2)].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexusledger-landed-cost-${method}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-card dark:border-white/10">
      <div className="flex flex-col gap-5 border-b p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="font-semibold tracking-tight">Landed Cost and FIFO Margin Workbench</h2><p className="mt-1 text-xs text-muted-foreground">All calculations run locally in your browser.</p></div>
        <div className="flex flex-wrap items-center gap-2"><label htmlFor="calculator-currency" className="text-xs text-muted-foreground">Currency</label><select id="calculator-currency" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="h-9 rounded-md border bg-background px-3 text-sm"><option>USD</option><option>EUR</option><option>GBP</option><option>CNY</option><option>AED</option><option>INR</option></select><Button type="button" variant="outline" size="sm" onClick={reset}><RotateCcw />Reset</Button></div>
      </div>
      <div className="grid xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 p-5 sm:p-6 xl:border-r">
          <section aria-labelledby="receipt-lines-heading">
            <div className="flex items-center justify-between"><div><h3 id="receipt-lines-heading" className="text-sm font-semibold">1. Receipt lines, opening layers, and sales</h3><p className="mt-1 text-xs text-muted-foreground">Enter per-unit weights and volumes for the selected allocation basis.</p></div><Button type="button" variant="outline" size="sm" onClick={addLine} disabled={lines.length >= 6}><Plus />Add SKU</Button></div>
            <div className="mt-5 space-y-4">
              {lines.map((line, index) => (
                <article key={line.id} className="rounded-lg border bg-secondary/25 p-4">
                  <div className="flex items-center gap-3"><span className="numeric text-xs text-muted-foreground">Line {index + 1}</span><Label htmlFor={`${line.id}-sku`} className="sr-only">SKU or product name</Label><Input id={`${line.id}-sku`} value={line.sku} onChange={(event) => updateLine(line.id, "sku", event.target.value)} className="h-8 max-w-xs bg-background font-mono text-xs font-medium" /><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${line.sku}`} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} disabled={lines.length === 1} className="ml-auto size-8 text-muted-foreground hover:text-destructive"><Trash2 /></Button></div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <fieldset className="rounded-lg border bg-card p-3"><legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">New receipt layer</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><NumberField id={`${line.id}-qty`} label="Receipt qty" value={line.receiptQuantity} min={1} step="1" onChange={(value) => updateLine(line.id, "receiptQuantity", value)} /><NumberField id={`${line.id}-cost`} label="Base unit cost" value={line.unitCost} prefix={currency} onChange={(value) => updateLine(line.id, "unitCost", value)} /><NumberField id={`${line.id}-weight`} label="Weight / unit (kg)" value={line.weightKg} step="0.001" onChange={(value) => updateLine(line.id, "weightKg", value)} /><NumberField id={`${line.id}-volume`} label="Volume / unit (CBM)" value={line.volumeCbm} step="0.001" onChange={(value) => updateLine(line.id, "volumeCbm", value)} /></div></fieldset>
                    <fieldset className="rounded-lg border bg-card p-3"><legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Older FIFO layer + sale</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><NumberField id={`${line.id}-opening-qty`} label="Opening qty" value={line.openingQuantity} step="1" onChange={(value) => updateLine(line.id, "openingQuantity", value)} /><NumberField id={`${line.id}-opening-cost`} label="Opening cost" value={line.openingUnitCost} prefix={currency} onChange={(value) => updateLine(line.id, "openingUnitCost", value)} /><NumberField id={`${line.id}-sale-qty`} label="Sale qty" value={line.saleQuantity} min={1} step="1" onChange={(value) => updateLine(line.id, "saleQuantity", value)} /><NumberField id={`${line.id}-sale-price`} label="Sale price" value={line.salePrice} prefix={currency} onChange={(value) => updateLine(line.id, "salePrice", value)} /></div></fieldset>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        <aside className="border-t bg-secondary/30 p-5 sm:p-6 xl:border-t-0">
          <h3 className="text-sm font-semibold">2. Import charges</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Each charge is allocated independently to preserve exact totals.</p>
          <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-1">{(["freight", "customs", "handling", "insurance"] as CostKey[]).map((key) => <NumberField key={key} id={`charge-${key}`} label={{ freight: "Freight", customs: "Customs duties", handling: "Port handling", insurance: "Insurance" }[key]} value={costs[key]} prefix={currency} onChange={(value) => setCosts((current) => ({ ...current, [key]: value }))} />)}</div>
          <fieldset className="mt-7"><legend className="text-sm font-semibold">3. Allocation method</legend><div className="mt-3 space-y-2">{methodLabels.map((item) => <button key={item.value} type="button" aria-pressed={method === item.value} onClick={() => setMethod(item.value)} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition", method === item.value ? "border-primary bg-primary/[0.06]" : "bg-card hover:border-primary/40")}><span className="text-sm font-medium">{item.label}</span><span className="text-[10px] text-muted-foreground">{item.detail}</span></button>)}</div></fieldset>
          <div className="mt-6 rounded-lg border border-primary/20 bg-primary/[0.05] p-4"><div className="flex gap-2"><Layers3 className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-xs leading-5 text-muted-foreground">The sale consumes the opening layer first. Only the remaining sale quantity draws from the new true landed-cost layer.</p></div></div>
        </aside>
      </div>
      <section className="border-t bg-[#0a1624] p-5 text-white sm:p-6" aria-labelledby="calculator-results-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 id="calculator-results-heading" className="font-semibold">Live landed cost + FIFO margin preview</h3><p className="mt-1 text-xs text-slate-500">Exact currency allocation · four-decimal unit costs · oldest layer first</p></div><Button type="button" variant="outline-inverse" size="sm" onClick={downloadCsv} disabled={!calculation.totals}><Download />Download CSV</Button></div>
        {calculation.error ? <div role="alert" className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">{calculation.error}</div> : null}
        {calculation.totals ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
              ["Landed inventory value", money(calculation.totals.trueTotalMinor), "Goods + capitalized charges"],
              ["Charges capitalized", money(calculation.totals.allocatedCostMinor), "100% allocated, no remainder"],
              ["FIFO cost of sales", money(calculation.totals.cogsMinor), "Opening layers consumed first"],
              ["Realized gross margin", `${calculation.totals.revenueMinor === 0 ? "0.00" : ((calculation.totals.grossProfitMinor / calculation.totals.revenueMinor) * 100).toFixed(2)}%`, money(calculation.totals.grossProfitMinor) + " gross profit"],
            ].map(([label, value, detail]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p><p className="numeric mt-3 text-2xl font-semibold tracking-tight text-slate-200">{value}</p><p className="mt-2 text-[10px] text-slate-500">{detail}</p></div>)}</div>
            <div className="scrollbar-thin mt-5 overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[1050px] border-collapse text-left text-xs"><caption className="sr-only">Calculated landed cost and FIFO margin by SKU</caption><thead className="bg-white/[0.04] text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th scope="col" className="px-4 py-3 font-semibold uppercase tracking-wider">SKU</th><th scope="col" className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Base goods</th><th scope="col" className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Basis share</th><th scope="col" className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Allocated cost</th><th scope="col" className="px-3 py-3 text-right font-semibold uppercase tracking-wider">True unit cost</th><th scope="col" className="px-3 py-3 text-right font-semibold uppercase tracking-wider">FIFO split</th><th scope="col" className="px-3 py-3 text-right font-semibold uppercase tracking-wider">COGS</th><th scope="col" className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Gross margin</th></tr></thead><tbody>{calculation.rows.map((row) => <tr key={row.id} className="border-t border-white/10"><th scope="row" className="px-4 py-3 font-mono font-medium text-slate-200">{row.sku}</th><td className="numeric px-3 py-3 text-right text-slate-300">{money(row.baseGoodsMinor)}</td><td className="numeric px-3 py-3 text-right text-slate-400">{formatNumber(row.basisShare * 100)}%</td><td className="numeric px-3 py-3 text-right text-slate-300">{money(row.allocatedCostMinor)}</td><td className="numeric px-3 py-3 text-right font-medium text-white">{money(row.trueUnitMinor, 4)}</td><td className="numeric px-3 py-3 text-right text-slate-400">{row.openingConsumed} old + {row.receiptConsumed} new</td><td className="numeric px-3 py-3 text-right text-slate-300">{money(row.cogsMinor)}</td><td className={cn("numeric px-3 py-3 text-right font-medium", row.marginPercent >= 0 ? "text-slate-200" : "text-red-400")}>{row.marginPercent.toFixed(2)}%</td></tr>)}</tbody></table></div>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-200"><CheckCircle2 className="size-4" />Charges allocated: {money(calculation.totals.allocatedCostMinor)} · Remaining inventory value: {money(calculation.totals.remainingValueMinor)}</div>
          </>
        ) : null}
      </section>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="text-sm font-semibold">Need this to post to stock and the general ledger?</p><p className="mt-1 text-xs text-muted-foreground">Use the full workbench to create FIFO layers and balanced accounting automatically.</p></div><Button asChild><Link href="/app/procurement">Open Landed Cost Workbench<ArrowRight /></Link></Button></div>
    </div>
  );
}
