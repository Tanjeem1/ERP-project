"use client";

import { useMemo, useState } from "react";

import { DemoLauncher } from "@/components/marketing/demo-launcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";

export function RoiCalculator() {
  const [shipments, setShipments] = useState(1200);
  const [warehouses, setWarehouses] = useState(3);
  const [skus, setSkus] = useState(1800);
  const [hourlyCost, setHourlyCost] = useState(42);
  const result = useMemo(() => {
    const shipmentHours = (shipments * 5.5) / 60;
    const warehouseHours = warehouses * 12;
    const catalogHours = (skus / 750) * 6;
    const monthlyHoursSaved = Math.round((shipmentHours + warehouseHours + catalogHours) * 0.78);
    return {
      monthlyHoursSaved,
      annualSavings: monthlyHoursSaved * 12 * hourlyCost,
      daysReclaimed: Math.round((monthlyHoursSaved / 8) * 10) / 10,
      baselineHours: Math.round(shipmentHours + warehouseHours + catalogHours),
    };
  }, [shipments, warehouses, skus, hourlyCost]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-card dark:border-white/10">
      <div className="grid lg:grid-cols-[1.15fr_.85fr]">
        <div className="p-6 sm:p-8">
          <h3 className="font-semibold tracking-tight">Operational savings inputs</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Adjust the inputs to match your monthly operating volumes.</p>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            {[
              { label: "Monthly shipments", value: shipments, set: setShipments, min: 50, max: 10000, step: 50 },
              { label: "Active warehouses", value: warehouses, set: setWarehouses, min: 1, max: 50, step: 1 },
              { label: "Active SKUs", value: skus, set: setSkus, min: 50, max: 25000, step: 50 },
              { label: "Fully loaded hourly cost", value: hourlyCost, set: setHourlyCost, min: 15, max: 200, step: 1, prefix: "$" },
            ].map((field) => (
              <div key={field.label}>
                <div className="flex items-center justify-between gap-3"><Label htmlFor={`roi-${field.label}`}>{field.label}</Label><div className="relative w-24"><Input id={`roi-${field.label}`} type="number" min={field.min} max={field.max} step={field.step} value={field.value} onChange={(event) => field.set(Math.max(field.min, Math.min(field.max, Number(event.target.value) || field.min)))} className="numeric h-8 px-2 text-right text-xs" /></div></div>
                <input aria-label={`${field.label} slider`} type="range" min={field.min} max={field.max} step={field.step} value={field.value} onChange={(event) => field.set(Number(event.target.value))} className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary" />
                <div className="numeric mt-1.5 flex justify-between text-xs text-muted-foreground"><span>{field.prefix ?? ""}{field.min.toLocaleString()}</span><span>{field.prefix ?? ""}{field.max.toLocaleString()}</span></div>
              </div>
            ))}
          </div>
          <p className="numeric mt-7 border-t pt-4 text-xs leading-5 text-muted-foreground">Model: 5.5 minutes per shipment, 12 admin hours per warehouse, and 6 catalog hours per 750 SKUs monthly, with a 78% automation rate. Illustrative only; actual savings depend on your workflows.</p>
        </div>
        <div className="flex flex-col border-t border-white/10 bg-[#0a1928] p-6 text-white sm:p-8 lg:border-l lg:border-t-0">
          <h3 className="text-sm font-semibold tracking-tight">Estimated operational impact</h3>
          <div className="mt-8"><p className="text-sm text-slate-400">Accounting hours saved per month</p><p className="numeric mt-3 text-5xl font-semibold tracking-tight text-white">{result.monthlyHoursSaved.toLocaleString()}<span className="ml-2 text-xl text-slate-500">hrs</span></p></div>
          <div className="my-7 h-px bg-white/10" />
          <div><p className="text-sm text-slate-400">Potential annual capacity value</p><p className="numeric mt-3 text-4xl font-semibold tracking-tight text-white">{formatMoney(result.annualSavings * 100).replace(".00", "")}</p></div>
          <dl className="mt-7 grid grid-cols-2 border-l border-t border-white/10"><div className="border-b border-r border-white/10 p-3"><dt className="text-xs text-slate-500">Workdays reclaimed / month</dt><dd className="numeric mt-2 text-xl text-white">{result.daysReclaimed}</dd></div><div className="border-b border-r border-white/10 p-3"><dt className="text-xs text-slate-500">Manual baseline hours</dt><dd className="numeric mt-2 text-xl text-white">{result.baselineHours}</dd></div></dl>
          <DemoLauncher className="mt-auto h-11 w-full px-5 text-sm lg:mt-8">Explore your interactive demo</DemoLauncher>
        </div>
      </div>
    </div>
  );
}
