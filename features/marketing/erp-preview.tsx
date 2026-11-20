"use client";

import { Boxes, Landmark, Layers3, RefreshCw, ShoppingCart, TrendingUp, Warehouse } from "lucide-react";
import { useState } from "react";

import { cn, formatMoney } from "@/lib/utils";

const views = ["Command", "Inventory", "Ledger"] as const;
type PreviewView = (typeof views)[number];
const navigation = [TrendingUp, Boxes, ShoppingCart, Warehouse, Landmark];
const feed = [
  { reference: "GRN-0059", detail: "Inventory Asset debited", value: "+$14,820.40" },
  { reference: "SO-882", detail: "Oldest FIFO layers relieved", value: "$1,642.00" },
  { reference: "INV-2082", detail: "AR and revenue balanced", value: "$3,418.20" },
];

export function ErpPreview() {
  const [view, setView] = useState<PreviewView>("Command");
  const [cycle, setCycle] = useState(0);
  const valuation = 37725 + cycle * 14820.4;

  return (
    <div className="mx-auto w-full max-w-[680px] lg:ml-auto">
      <div className="overflow-hidden rounded-lg border border-white/15 bg-[#0b1624]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-xs font-medium text-slate-300">NexusLedger <span className="text-slate-600">/</span> Operations</p>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="size-1.5 rounded-full bg-emerald-400" />Illustrative preview</span>
        </div>
        <div className="flex">
          <aside className="hidden w-12 shrink-0 flex-col items-center border-r border-white/10 py-4 sm:flex" aria-label="Preview modules">
            <Layers3 className="size-4 text-slate-400" />
            <div className="mt-6 flex flex-col gap-4">{navigation.map((Icon, index) => <Icon key={index} className={cn("size-4", index === views.indexOf(view) ? "text-slate-200" : "text-slate-600")} />)}</div>
          </aside>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div><p className="text-xs font-medium text-white">Executive Command Center</p><p className="mt-1 text-[10px] text-slate-500">NexusLedger Industries · USD</p></div>
              <p className="numeric text-[10px] text-slate-500">17 Nov 2026</p>
            </div>
            <div className="flex gap-5 border-b border-white/10 px-4" role="tablist" aria-label="ERP preview">
              {views.map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} className={cn("border-b-2 py-2.5 text-[11px] font-medium transition", view === item ? "border-white text-white" : "border-transparent text-slate-500 hover:text-slate-300")}>{item}</button>)}
            </div>
            <div className="p-4">
              {view === "Command" ? (
                <>
                  <div className="grid grid-cols-2 border-l border-t border-white/10 lg:grid-cols-4">
                    {[
                      ["FIFO valuation", formatMoney(Math.round(valuation * 100)), "11 cost layers"],
                      ["Gross margin", "45.60%", "$415.00 profit"],
                      ["Available units", (4008 + cycle * 320).toLocaleString(), "96.6% ATP"],
                      ["Open accruals", "$1,560.40", "1 to review"],
                    ].map(([label, value, detail]) => <div key={label} className="border-b border-r border-white/10 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="numeric mt-2 text-sm font-medium text-white">{value}</p><p className="numeric mt-1 text-[9px] text-slate-500">{detail}</p></div>)}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-[1.25fr_1fr]">
                    <section>
                      <div className="flex items-center justify-between"><h3 className="text-[11px] font-medium text-slate-200">Inventory valuation</h3><p className="numeric text-[9px] text-slate-500">6 months</p></div>
                      <div className="mt-4 flex h-[116px] items-end gap-2 border-b border-white/10">
                        {[35, 43, 39, 56, 52, 66, 63, 78, 74, 88, 82, 96].map((height, index) => <div key={index} className={cn("flex-1 rounded-t-sm", index >= 9 ? "bg-emerald-400" : "bg-white/15")} style={{ height: `${height}%` }} />)}
                      </div>
                      <div className="numeric mt-2 flex justify-between text-[8px] text-slate-600"><span>JUN</span><span>JUL</span><span>AUG</span><span>SEP</span><span>OCT</span><span>NOV</span></div>
                    </section>
                    <section>
                      <h3 className="text-[11px] font-medium text-slate-200">Automated ledger feed</h3>
                      <div className="mt-2 divide-y divide-white/10">
                        {feed.map((item) => <div key={item.reference} className="flex items-center gap-3 py-2.5"><div className="min-w-0 flex-1"><p className="font-mono text-[10px] text-slate-300">{item.reference}</p><p className="mt-1 truncate text-[9px] text-slate-500">{item.detail}</p></div><span className="numeric text-[10px] text-slate-300">{item.value}</span></div>)}
                      </div>
                    </section>
                  </div>
                </>
              ) : null}
              {view === "Inventory" ? (
                <section className="min-h-[294px]">
                  <h3 className="text-xs font-medium text-white">Stock positions by warehouse</h3><p className="mt-1 text-[10px] text-slate-500">Available to promise after order reservations</p>
                  <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[400px] text-left text-[10px]"><thead className="border-y border-white/10 text-slate-500 font-semibold uppercase tracking-wider"><tr><th className="py-2 font-semibold uppercase tracking-wider">SKU</th><th className="font-semibold uppercase tracking-wider">On hand</th><th className="font-semibold uppercase tracking-wider">Locked</th><th className="text-right font-semibold uppercase tracking-wider">FIFO value</th></tr></thead><tbody className="divide-y divide-white/10">{[
                    ["CF-ARB-25", "420", "80", "$5,966.00"], ["OLV-EVO-12", "650", "40", "$6,080.00"], ["SCN-X2-BT", "350", "12", "$9,800.00"], ["TEA-JAS-24", "650", "0", "$4,265.00"], ["NET-SW-8P", "120", "10", "$7,320.00"],
                  ].map((row) => <tr key={row[0]}><th scope="row" className="py-3 font-mono font-medium text-slate-300">{row[0]}</th><td className="numeric text-slate-400">{row[1]}</td><td className="numeric text-slate-400">{row[2]}</td><td className="numeric text-right text-slate-300">{row[3]}</td></tr>)}</tbody></table></div>
                </section>
              ) : null}
              {view === "Ledger" ? (
                <section className="min-h-[294px]">
                  <h3 className="text-xs font-medium text-white">JE-000005 · Goods receipt</h3><p className="mt-1 text-[10px] text-slate-500">GRN-0059 · Automatically generated</p>
                  <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[400px] text-left text-[10px]"><thead className="border-y border-white/10 text-slate-500 font-semibold uppercase tracking-wider"><tr><th className="py-2 font-semibold uppercase tracking-wider">Account</th><th className="text-right font-semibold uppercase tracking-wider">Debit</th><th className="text-right font-semibold uppercase tracking-wider">Credit</th></tr></thead><tbody className="divide-y divide-white/10">{[
                    ["103000 · Inventory Asset", "$14,820.40", "-"], ["201000 · Accrued Payables", "-", "$13,250.00"], ["202000 · Freight Clearing", "-", "$1,570.40"],
                  ].map((row) => <tr key={row[0]}><th scope="row" className="py-3 font-medium text-slate-300">{row[0]}</th><td className="numeric text-right text-slate-300">{row[1]}</td><td className="numeric text-right text-slate-300">{row[2]}</td></tr>)}</tbody><tfoot><tr className="border-t border-white/10"><th scope="row" className="py-3 font-medium text-white">Balanced total</th><td className="numeric text-right font-medium text-white">$14,820.40</td><td className="numeric text-right font-medium text-white">$14,820.40</td></tr></tfoot></table></div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3"><p className="text-[10px] text-slate-500">Inventory, orders, and accounting share one state.</p><button type="button" onClick={() => setCycle((value) => (value + 1) % 3)} className="flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-[10px] font-medium text-slate-200 transition hover:bg-white/5"><RefreshCw className="size-3" />Simulate activity<span className="numeric text-slate-500">0{cycle + 1}</span></button></div>
      </div>
    </div>
  );
}
