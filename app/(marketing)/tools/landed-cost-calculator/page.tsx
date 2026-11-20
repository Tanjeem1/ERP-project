import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";

import { CtaSection } from "@/components/marketing/cta-section";
import { FaqList } from "@/components/marketing/faq-list";
import { SectionHeading } from "@/components/marketing/section-heading";
import { StructuredData } from "@/components/structured-data";
import { LandedCostCalculator } from "@/features/marketing/landed-cost-calculator";
import { absoluteUrl, createMetadata, faqJsonLd } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Free Landed Cost and FIFO Margin Calculator",
  description: "Free landed cost calculator for freight, customs, handling, and insurance allocation by weight, volume, or value. Calculate FIFO COGS and gross margin online.",
  path: "/tools/landed-cost-calculator",
  imageSection: "Free landed cost and FIFO margin tool",
  keywords: ["landed cost calculator", "FIFO margin calculator", "landed cost formula", "freight allocation calculator", "customs duty cost calculator", "automated FIFO costing software"],
});

const calculatorFaqs = [
  { question: "What is the landed cost formula?", answer: "True landed unit cost equals the total base goods value plus allocated freight, customs duties, port handling, and insurance, divided by received quantity. This calculator converts every input to integer minor currency units before allocation." },
  { question: "How do I allocate landed cost by weight?", answer: "Multiply each SKU's received quantity by its per-unit weight, then divide that line weight by total receipt weight. Each import charge is multiplied by the same ratio. Exact leftover cents are assigned by the largest-remainder method." },
  { question: "When should I allocate by volume or value?", answer: "Volume is useful when freight is driven by cubic space rather than mass. Value is useful for ad valorem charges such as value-based insurance or duties. Weight is useful for weight-based transport. You can compare all three methods without changing the receipt lines." },
  { question: "How does the FIFO margin simulation work?", answer: "The sale consumes your opening quantity at the opening unit cost first. If the sale exceeds that older layer, the remaining quantity draws from the newly calculated landed-cost layer. FIFO COGS is the sum of both consumed portions." },
  { question: "Does the calculator store or transmit my costs?", answer: "No. All calculations run in your browser. The tool does not require an account or send your inputs to a server. Downloading CSV creates the file locally in your browser." },
  { question: "Can this post to inventory and a general ledger?", answer: "The free tool calculates and exports results. The connected ERP demo additionally creates stock, FIFO layers, Inventory Asset, supplier accrual, and Freight & Duty Clearing entries when you post a goods receipt." },
];

const calculationSteps = [
  { title: "1. Establish base goods value", text: "Multiply received quantity by source unit cost. In the full ERP, a foreign-currency purchase order also stores its explicit FX rate to the organization's base currency.", formula: "Base goods = quantity × unit cost" },
  { title: "2. Allocate every import charge", text: "Calculate each line's share of total weight, volume, or base value. Allocate each charge independently and distribute any remaining cents deterministically.", formula: "Line allocation = charge × line basis ÷ total basis" },
  { title: "3. Consume the oldest cost first", text: "Opening stock is sold before the new receipt layer. If the sale crosses both layers, COGS is the exact sum of the two consumed portions.", formula: "FIFO COGS = old layer portion + new layer portion" },
];
const allocationBases = [
  { title: "Weight", subtitle: "kg", text: "Use for transport charges driven by gross mass, dense commodities, and heavy wholesale goods." },
  { title: "Volume", subtitle: "CBM", text: "Use for lightweight but bulky goods where container or warehouse space is the limiting resource." },
  { title: "Value", subtitle: "$", text: "Use for value-based duties, insurance, and charges proportional to the goods being protected." },
];

export default function LandedCostCalculatorPage() {
  const toolJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "NexusLedger Landed Cost & FIFO Margin Calculator",
    url: absoluteUrl("/tools/landed-cost-calculator"),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any modern web browser",
    browserRequirements: "Requires JavaScript",
    description: "Free online landed cost allocation and FIFO gross-margin calculator.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: ["Allocation by weight, volume, or value", "Freight, customs, handling, and insurance", "FIFO COGS simulation", "CSV export"],
  };
  return (
    <main>
      <StructuredData data={[toolJsonLd, faqJsonLd(calculatorFaqs)]} />
      <section className="bg-[#07111f] text-white"><div className="mx-auto max-w-[1200px] px-5 py-12 text-center sm:px-8 lg:py-16"><nav aria-label="Breadcrumb" className="flex items-center justify-center gap-2 text-xs text-slate-500"><Link href="/" className="hover:text-white">Home</Link><ChevronRight className="size-3" /><span>Free tools</span><ChevronRight className="size-3" /><span className="text-slate-300">Landed cost calculator</span></nav><h1 className="mx-auto mt-8 max-w-4xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Landed Cost and FIFO Margin Calculator</h1><p className="mx-auto mt-5 max-w-3xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">Allocate freight, customs duties, port handling, and insurance by weight, volume, or value. Calculate how older FIFO layers affect COGS and gross margin.</p><p className="mt-6 text-xs text-slate-400">No sign-up. Exact cent allocation. CSV export. Six currencies.</p></div></section>

      <section className="bg-slate-50 px-4 py-10 dark:bg-background sm:px-6 lg:px-8 lg:py-14" aria-label="Interactive landed cost calculator"><div className="mx-auto max-w-[1440px]"><LandedCostCalculator /></div></section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1240px]"><SectionHeading title="From supplier invoice to defensible unit cost." description="The allocation basis should reflect the operational driver of each charge. FIFO preserves the historical cost of stock already on hand." /><div className="mt-10 grid gap-8 lg:grid-cols-3">{calculationSteps.map((item) => <article key={item.title} className="border-t border-slate-200 pt-5 dark:border-white/10"><h3 className="text-lg font-semibold tracking-tight">{item.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{item.text}</p><p className="numeric mt-5 border-l-2 border-slate-300 pl-3 text-xs leading-5 text-slate-600 dark:border-white/15 dark:text-slate-400">{item.formula}</p></article>)}</div></div></section>

      <section className="border-y bg-slate-50 px-5 py-20 dark:bg-background sm:px-8 lg:px-10"><div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><h2 className="text-3xl font-semibold tracking-tight">Choose the basis that matches each charge.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">Use operational judgment when selecting an allocation policy. Apply it consistently and retain the basis for audit.</p><Link href="/solutions/import-export" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">Explore the import and export ERP<ArrowRight className="size-4" /></Link></div><div className="grid border-l border-t border-slate-200 dark:border-white/10 sm:grid-cols-3">{allocationBases.map((item) => <article key={item.title} className="border-b border-r border-slate-200 bg-card p-5 dark:border-white/10"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold tracking-tight">{item.title}</h3><span className="numeric text-xs text-muted-foreground">{item.subtitle}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p></article>)}</div></div></section>

      <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[960px]"><SectionHeading title="Questions about costing and FIFO margin" /><FaqList faqs={calculatorFaqs} /></div></section>
      <CtaSection title="Turn this calculation into a balanced goods receipt." description="The full ERP workbench creates warehouse stock, new FIFO layers, and automatic Inventory Asset, supplier accrual, and freight clearing entries from the same inputs." />
    </main>
  );
}
