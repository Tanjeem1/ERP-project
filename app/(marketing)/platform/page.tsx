import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { CtaSection } from "@/components/marketing/cta-section";
import { FaqList } from "@/components/marketing/faq-list";
import { SectionHeading } from "@/components/marketing/section-heading";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";
import { industries } from "@/content/industries";
import { createMetadata, faqJsonLd } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Multi-Warehouse Inventory ERP and Accounting Platform",
  description: "Explore multi-warehouse inventory, landed cost allocation, FIFO stock reservations, and automated double-entry accounting in the NexusLedger ERP demo.",
  path: "/platform",
  imageSection: "Inventory, procurement, orders, and finance",
  keywords: ["multi-warehouse inventory ERP", "landed cost allocation ERP", "automated FIFO costing software", "automated double-entry supply chain accounting"],
});

const platformFaqs = [
  { question: "Is NexusLedger a live demo or a static dashboard?", answer: "It is a stateful frontend application. Procurement changes stock and FIFO valuation, reservations change available-to-promise quantities, and shipments generate invoices and balanced accounting. Browser persistence retains your work between visits." },
  { question: "What connects inventory to the general ledger?", answer: "Each operational action runs through a shared transaction engine. A goods receipt creates stock layers and its accounting in the same atomic transition, and validation compares Inventory Asset with the exact residual value of all FIFO layers." },
  { question: "Can I inspect the calculation before posting?", answer: "Yes. The landed cost allocator shows goods value, allocation basis, basis share, capitalized charges, and true unit cost before you commit the goods receipt. The command palette also provides direct access to journal and invoice details." },
  { question: "Does the demo connect to Shopify or my accounting system?", answer: "No external connection is made in this evaluation environment. Shopify Sync and other channels are modeled locally so you can test the workflow without exposing business data or changing production systems." },
];

const architecture = [
  ["Warehouse event", "Physical quantity and source document"],
  ["Cost engine", "Landed allocation and exact FIFO layers"],
  ["Financial engine", "Balanced debit and credit lines"],
  ["Control layer", "Inventory reconciliation and audit links"],
];
const controls = [
  { title: "Source-level audit", text: "Every journal retains a clickable operational source and document number." },
  { title: "Deterministic math", text: "Minor-unit accounting and exact remainder allocation prevent rounding drift." },
  { title: "Explicit currency", text: "Source cost, transaction currency, FX rate, and base value remain distinct." },
  { title: "Inventory reconciliation", text: "Stock, reservations, inbound quantities, layers, and ledger value reconcile." },
];

export default function PlatformPage() {
  return (
    <main>
      <StructuredData data={faqJsonLd(platformFaqs)} />
      <section className="bg-[#07111f] text-white"><div className="mx-auto grid max-w-[1340px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_.75fr] lg:items-center lg:px-10 lg:py-20"><div><h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">One transaction engine for stock, cost, orders, and accounting.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">Explore a multi-warehouse inventory ERP where each purchase, receipt, reservation, and shipment updates its related stock and financial records.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button asChild variant="mint" size="lg"><Link href="/app/dashboard">Open Command Center<ArrowRight /></Link></Button><Button asChild variant="outline-inverse" size="lg"><Link href="/tools/landed-cost-calculator">Try the free calculator<ArrowUpRight /></Link></Button></div></div><section className="rounded-lg border border-white/15 bg-white/[0.02] p-6" aria-label="Transaction architecture"><h2 className="text-sm font-semibold tracking-tight">Shared transaction state</h2><dl className="mt-5 divide-y divide-white/10 border-y border-white/10">{architecture.map(([title, detail]) => <div key={title} className="grid gap-1 py-4 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-sm font-medium">{title}</dt><dd className="text-xs leading-5 text-slate-400">{detail}</dd></div>)}</dl><p className="mt-5 text-xs leading-5 text-slate-400">A goods receipt updates stock, FIFO cost layers, and accounting in one state transition.</p></section></div></section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1340px]"><SectionHeading title="Start with the decision you need to make." description="Each workspace presents the necessary operational detail and connects directly to the next step in the transaction lifecycle." /><div className="mt-10 grid gap-5 lg:grid-cols-2"><article className="rounded-lg border border-slate-200 bg-card p-6 dark:border-white/10"><h2 className="text-2xl font-semibold tracking-tight">Executive Command Center</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Monitor FIFO valuation, pending landed costs, ATP, realized margin, warehouse capacity, aging stock, and the automated ledger feed from one operational view.</p><ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-sm dark:divide-white/10 dark:border-white/10">{["Store-derived financial and inventory KPIs", "Warehouse and aging analytics", "Clickable journal details"].map((item) => <li key={item} className="py-3">{item}</li>)}</ul><Button asChild className="mt-6"><Link href="/app/dashboard">Open dashboard<ArrowRight /></Link></Button></article><article className="rounded-lg border border-slate-200 bg-card p-6 dark:border-white/10"><h2 className="text-2xl font-semibold tracking-tight">Procurement and landed cost</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Create and approve purchase orders, track inbound stock, receive goods, allocate import charges, and generate balanced Inventory Asset and accrual entries.</p><ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-sm dark:divide-white/10 dark:border-white/10">{["Complete PO lifecycle", "Weight, volume, and value allocation", "GRN and automatic journal generation"].map((item) => <li key={item} className="py-3">{item}</li>)}</ul><Button asChild className="mt-6"><Link href="/app/procurement">Open procurement<ArrowRight /></Link></Button></article></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><Link href="/app/inventory" className="group rounded-lg border border-slate-200 bg-card p-5 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.02]"><div className="flex items-center justify-between gap-4"><h3 className="font-semibold tracking-tight">Multi-warehouse WMS and FIFO</h3><ArrowRight className="size-4 text-slate-400" /></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Stock positions, cost-layer inspection, reservations, and transfers.</p></Link><Link href="/app/orders" className="group rounded-lg border border-slate-200 bg-card p-5 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.02]"><div className="flex items-center justify-between gap-4"><h3 className="font-semibold tracking-tight">Omnichannel orders and invoicing</h3><ArrowRight className="size-4 text-slate-400" /></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Stock reservations, fulfillment, shipment accounting, and tax invoices.</p></Link></div></div></section>

      <section id="control" className="scroll-mt-24 border-y bg-slate-50 px-5 py-20 dark:bg-background sm:px-8 lg:px-10"><div className="mx-auto max-w-[1340px]"><SectionHeading title="Control is built into the transaction." description="The same architecture that updates the interface also protects the relationship between physical inventory and financial balances." /><div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">{controls.map((item) => <article key={item.title} className="border-l border-slate-200 pl-5 dark:border-white/10"><h3 className="font-semibold tracking-tight">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p></article>)}</div></div></section>

      <section className="px-5 py-20 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1200px]"><SectionHeading title="Apply the platform to your operating model." /><div className="mt-10 grid border-l border-t border-slate-200 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-4">{industries.map((industry) => <Link key={industry.slug} href={`/solutions/${industry.slug}`} className="group border-b border-r border-slate-200 bg-card p-5 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.02]"><h3 className="font-semibold tracking-tight">{industry.shortName}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{industry.signal}</p><span className="mt-5 flex items-center gap-1.5 text-xs font-medium text-primary">View workflow<ArrowRight className="size-3.5" /></span></Link>)}</div></div></section>

      <section className="border-t px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[960px]"><SectionHeading title="Questions about the working architecture" /><FaqList faqs={platformFaqs} /></div></section>
      <CtaSection />
    </main>
  );
}
