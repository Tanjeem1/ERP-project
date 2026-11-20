import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";

const solutionLinks = [
  ["Wholesale distribution", "/solutions/wholesale-distribution"],
  ["FMCG", "/solutions/fmcg"],
  ["Retail & e-commerce", "/solutions/retail-ecommerce"],
  ["Import & export", "/solutions/import-export"],
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-[#f3f5f4] text-slate-600">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-14 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.15fr] lg:px-10">
        <div>
          <Brand />
          <p className="mt-5 max-w-sm text-sm leading-6">Track purchasing, warehouse stock, order fulfillment, and financial entries in one system. Inspect every quantity, cost layer, and journal line.</p>
          <div className="mt-5 flex items-center gap-2 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-4" />Live demo available · no account required</div>
        </div>
        <nav aria-label="Footer solutions">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-900">Industry solutions</h2>
          <ul className="mt-4 space-y-3 text-sm">{solutionLinks.map(([label, href]) => <li key={href}><Link className="transition hover:text-primary" href={href}>{label}</Link></li>)}</ul>
        </nav>
        <nav aria-label="Footer platform and resources">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-900">Platform + resources</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li><Link className="transition hover:text-primary" href="/platform">Platform architecture</Link></li>
            <li><Link className="transition hover:text-primary" href="/tools/landed-cost-calculator">Landed cost calculator</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/dashboard">Executive dashboard</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/procurement">Procurement workbench</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/inventory">Multi-warehouse inventory</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/orders">Orders + invoicing</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/customers">Customers + collections</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/vendors">Vendors + accounts payable</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/pos">Point of Sale terminal</Link></li>
            <li><Link className="transition hover:text-primary" href="/app/finance">Finance + statements</Link></li>
            <li><Link className="transition hover:text-primary" href="/pricing">Pricing</Link></li>
            <li><Link className="transition hover:text-primary" href="/#faqs">Common questions</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-900">Talk to an ERP architect</h2>
          <p className="mt-4 text-sm leading-6">Map your warehouses, costing policy, and chart of accounts with our enterprise team.</p>
          <Link href="/book-demo" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80">Book an enterprise demo<ArrowUpRight className="size-4" /></Link>
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500">Evaluating the platform? Start with the <Link href="/tools/landed-cost-calculator" className="font-medium text-primary">free calculator</Link>, then open the connected demo.</div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white/55">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p>© 2026 NexusLedger ERP. Operational clarity, down to the last unit.</p>
          <nav aria-label="Legal and contact" className="flex flex-wrap gap-4"><Link href="/terms" className="hover:text-primary">Terms</Link><Link href="/privacy" className="hover:text-primary">Privacy</Link><Link href="/book-demo" className="hover:text-primary">Contact</Link></nav>
        </div>
      </div>
    </footer>
  );
}
