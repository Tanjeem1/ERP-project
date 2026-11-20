import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { CtaSection } from "@/components/marketing/cta-section";
import { DemoLauncher } from "@/components/marketing/demo-launcher";
import { FaqList } from "@/components/marketing/faq-list";
import { SectionHeading } from "@/components/marketing/section-heading";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";
import { industries } from "@/content/industries";
import { ErpPreview } from "@/features/marketing/erp-preview";
import { RoiCalculator } from "@/features/marketing/roi-calculator";
import { createMetadata, faqJsonLd } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Multi-Warehouse Inventory ERP with Automated FIFO Accounting",
  description: "Multi-warehouse inventory ERP with automated FIFO costing, landed cost allocation, stock reservations, and double-entry accounting. Try the interactive demo.",
  path: "/",
  imageSection: "Multi-warehouse inventory and automated accounting",
  keywords: ["multi-warehouse inventory ERP", "automated FIFO costing software", "landed cost allocation ERP", "automated double-entry supply chain accounting"],
});

const homeFaqs = [
  { question: "What is a multi-warehouse inventory ERP?", answer: "It connects stock positions, purchasing, order fulfillment, and financial accounting across multiple physical warehouses. NexusLedger tracks quantities and cost layers by SKU and warehouse while maintaining one consolidated general ledger." },
  { question: "How does automated FIFO costing work?", answer: "Every goods receipt creates a dated cost layer with quantity and residual value. Shipping consumes the oldest layers in the fulfillment warehouse, splitting quantities across layers when needed and posting the exact resulting COGS." },
  { question: "Can I allocate landed costs by weight, volume, or value?", answer: "Yes. The landed cost workbench distributes freight, customs duties, port handling, and insurance by kilograms, cubic meters, or base-currency value. A preview shows each SKU's true unit cost before posting." },
  { question: "Does shipping create double-entry accounting automatically?", answer: "Yes. Shipping creates two balanced entries: debit COGS and credit Inventory Asset, then debit Accounts Receivable and credit Sales Revenue and Sales Tax Payable. Every line links back to its order or invoice." },
  { question: "Is the live ERP demo really usable without an account?", answer: "Yes. Create purchase orders, receive inventory, lock stock, transfer inventory, ship orders, and inspect the general ledger without registering. Your isolated demo organization is stored in PostgreSQL and expires after 24 hours." },
  { question: "Is the demo connected to my production systems?", answer: "No. Each demo is a separate organization with demonstration records. It does not connect to your production inventory, customers, or accounting data. Creating a registered organization gives you a separate persistent workspace." },
];

const operatingSteps = [
  { title: "Purchase", document: "Purchase order", text: "Approve a multi-currency PO and track inbound units by destination." },
  { title: "Receive", document: "Goods receipt", text: "Post a GRN, allocate import charges, and create exact FIFO layers." },
  { title: "Reserve and ship", document: "Sales order", text: "Lock ATP, fulfill the order, and relieve the oldest warehouse layers." },
  { title: "Recognize", document: "Journal entry", text: "Issue the invoice and post COGS, inventory, AR, revenue, and tax." },
];

export default function HomePage() {
  return (
    <main>
      <StructuredData data={faqJsonLd(homeFaqs)} />
      <section className="bg-[#07111f] text-white">
        <div className="mx-auto grid max-w-[1440px] items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[.88fr_1.12fr] lg:px-10 lg:pb-24 lg:pt-20 xl:gap-20">
          <div className="max-w-[630px]">
            <h1 className="text-balance text-[42px] font-semibold leading-[1.06] tracking-tight sm:text-[54px] xl:text-[60px]">Multi-warehouse inventory ERP with automated FIFO accounting.</h1>
            <p className="mt-6 max-w-xl text-pretty text-[17px] leading-8 text-slate-300">Eliminate stockouts, automate landed costing, and reconcile every shipment with double-entry accounting. From purchase order to journal entry in one system.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <DemoLauncher className="h-12 px-6 text-sm" />
              <Button asChild variant="outline-inverse" size="lg" className="h-12 px-6"><Link href="/book-demo">Book Enterprise Demo<ArrowUpRight /></Link></Button>
            </div>
            <p className="mt-6 text-xs leading-6 text-slate-400">No login required. Isolated PostgreSQL demo records. Expires after 24 hours.</p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-400"><span>Multi-currency</span><span>Warehouse-level stock</span><span>Source-linked audit trail</span></div>
          </div>
          <ErpPreview />
        </div>
        <div className="border-t border-white/10"><div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10"><p className="text-xs text-slate-400">For inventory-led wholesale, retail, and import operations</p><div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400"><span>Shopify-ready</span><span>EDI workflows</span><span>REST API</span><span>Multi-currency</span><span>Double entry</span></div></div></div>
      </section>

      <section id="platform" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-[1340px]">
          <SectionHeading title="Inventory movements and accounting stay in the same state." description="NexusLedger turns each warehouse event into an exact inventory valuation and balanced accounting entry. Finance can inspect the source document behind every value." />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-card dark:border-white/10">
              <div className="p-6"><h3 className="text-xl font-semibold tracking-tight">Landed cost allocation, down to the cent.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Allocate freight, customs, handling, and insurance by weight, volume, or value. Review true unit costs before posting the receipt.</p></div>
              <div className="border-t bg-slate-50/70 p-5 dark:bg-white/[0.02]"><div className="grid grid-cols-[1.4fr_.7fr_.8fr] gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500"><span>Receipt line</span><span>Basis share</span><span className="text-right">True unit cost</span></div>{[["SCN-X2-BT · 500 units", "18.42%", "$28.74"], ["NET-SW-8P · 180 units", "81.58%", "$63.12"]].map((row) => <div key={row[0]} className="grid grid-cols-[1.4fr_.7fr_.8fr] gap-3 border-t py-3 text-xs"><span className="font-mono">{row[0]}</span><span className="numeric text-muted-foreground">{row[1]}</span><span className="numeric text-right font-medium">{row[2]}</span></div>)}</div>
            </article>
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-card dark:border-white/10">
              <div className="p-6"><h3 className="text-xl font-semibold tracking-tight">FIFO costing that shows every layer.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Inspect each batch, quantity, receipt date, and residual value. Simulate a sale to see how COGS splits across the oldest layers.</p></div>
              <div className="space-y-4 border-t bg-slate-50/70 p-5 dark:bg-white/[0.02]"><div className="flex items-center gap-3"><div className="h-1.5 flex-1 rounded-full bg-blue-600" /><span className="numeric text-xs">100 × $10.00</span><span className="text-xs text-muted-foreground">Consumed</span></div><div className="flex items-center gap-3"><div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10"><div className="h-full w-1/2 rounded-full bg-blue-600" /></div><span className="numeric text-xs">50 × $12.50</span><span className="text-xs text-muted-foreground">Split</span></div><div className="flex items-center justify-between border-t pt-3 text-xs"><span className="numeric text-muted-foreground">150 units · FIFO COGS</span><span className="numeric font-semibold">$1,625.00</span></div></div>
            </article>
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-card dark:border-white/10">
              <div className="p-6"><h3 className="text-xl font-semibold tracking-tight">Double-entry accounting from the source event.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Receipts and shipments post balanced entries automatically. Every journal line retains a link to its operational document.</p></div>
              <div className="border-t bg-slate-50/70 p-5 text-xs dark:bg-white/[0.02]"><div className="flex justify-between gap-4 border-b pb-3"><span>103000 · Inventory Asset</span><span className="numeric">DR $14,820.40</span></div><div className="flex justify-between gap-4 border-b py-3"><span>201000 · Accrued Payables</span><span className="numeric">CR $13,250.00</span></div><div className="flex justify-between gap-4 pt-3"><span>202000 · Freight Clearing</span><span className="numeric">CR $1,570.40</span></div></div>
            </article>
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-card dark:border-white/10">
              <div className="p-6"><h3 className="text-xl font-semibold tracking-tight">One available-to-promise quantity across channels.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">B2B orders and digital webhooks reserve the same stock. A reservation either locks available units or returns a clear rejection.</p></div>
              <div className="border-t bg-slate-50/70 p-5 text-xs dark:bg-white/[0.02]"><div className="grid grid-cols-[1fr_auto_1fr] gap-4"><div><p className="font-medium">Shopify webhook</p><p className="numeric mt-2 text-muted-foreground">Request: 1 unit</p></div><span className="text-muted-foreground">vs.</span><div><p className="font-medium">B2B sales order</p><p className="numeric mt-2 text-muted-foreground">Request: 1 unit</p></div></div><div className="mt-5 flex justify-between border-t pt-3"><span className="text-muted-foreground">Available after locking</span><span className="numeric font-medium">0 oversold</span></div></div>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#0a1624] px-5 py-20 text-white sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1340px]"><SectionHeading inverse title="One transaction record from purchase to recognized margin." description="Every handoff preserves the same quantities, costs, source documents, and financial impact." /><div className="mt-10 grid gap-8 md:grid-cols-4 md:gap-0 md:divide-x md:divide-white/10">{operatingSteps.map((item, index) => <article key={item.title} className={index === 0 ? "md:pr-6" : "md:px-6"}><p className="font-mono text-xs text-slate-500">{item.document}</p><h3 className="mt-4 text-lg font-semibold tracking-tight">{item.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{item.text}</p></article>)}</div></div></section>

      <section className="bg-slate-50 px-5 py-20 dark:bg-background sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1340px]"><SectionHeading title="Estimate the time spent on manual reconciliation." description="Model the administrative effort associated with shipments, warehouse maintenance, and catalog updates. The assumptions are shown alongside the result." /><div className="mt-10"><RoiCalculator /></div></div></section>

      <section id="industries" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1340px]"><SectionHeading title="Inventory and finance for four operating models." description="Review the workflows, costing policies, and accounting controls relevant to your business." /><div className="mt-10 grid border-l border-t border-slate-200 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-4">{industries.map((industry) => <Link key={industry.slug} href={`/solutions/${industry.slug}`} className="group flex flex-col border-b border-r border-slate-200 bg-card p-6 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.02]"><h3 className="text-lg font-semibold tracking-tight">{industry.shortName}</h3><p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{industry.intro}</p><span className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-primary">Explore solution<ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span></Link>)}</div></div></section>

      <section id="faqs" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[960px]"><SectionHeading title="Frequently asked questions" description="Details about inventory, costing, accounting, and the local demo environment." /><FaqList faqs={homeFaqs} /></div></section>
      <CtaSection />
    </main>
  );
}
