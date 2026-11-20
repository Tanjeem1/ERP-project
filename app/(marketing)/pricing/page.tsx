import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { FaqList } from "@/components/marketing/faq-list";
import { SectionHeading } from "@/components/marketing/section-heading";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";
import { createMetadata, faqJsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata = createMetadata({
  title: "Supply Chain ERP Pricing: Starter, Growth and Enterprise",
  description: "Compare Starter, Growth, and Enterprise ERP plans for warehouse inventory, FIFO accounting, collections, POS, approvals, and financial controls.",
  path: "/pricing",
  imageSection: "ERP plans and operational coverage",
  keywords: ["supply chain ERP pricing", "inventory ERP subscription", "multi-warehouse ERP cost", "FIFO accounting software pricing"],
});

const tiers = [
  { id: "starter", name: "Starter", price: 79, description: "For a focused wholesale or retail operation replacing inventory spreadsheets.", warehouses: "1 warehouse", users: "Up to 5 users", features: ["SKU and barcode management", "FIFO inventory and order fulfillment", "Customer credit and collections", "POS receipts and invoices", "Daily operational dashboard"], cta: "Start with Starter", featured: false },
  { id: "growth", name: "Growth", price: 249, description: "For multi-location teams connecting procurement, stock, and finance.", warehouses: "Up to 5 warehouses", users: "Up to 25 users", features: ["Everything in Starter", "Multi-warehouse transfers", "Landed cost allocation", "Automated double-entry accounting", "Vendor payments and returns", "Approval workflows and audit trail"], cta: "Scale with Growth", featured: true },
  { id: "enterprise", name: "Enterprise", price: 699, description: "For complex supply chains requiring advanced controls and custom rollout.", warehouses: "Unlimited warehouses", users: "Unlimited users", features: ["Everything in Growth", "Role-based financial governance", "Advanced financial statements", "Fiscal currency and timezone controls", "Priority architecture review", "Custom onboarding and API planning"], cta: "Talk to Enterprise", featured: false },
] as const;

const pricingFaqs = [
  { question: "Can I evaluate the complete platform before choosing a plan?", answer: "Yes. The live demo includes procurement, inventory, orders, collections, vendor payments, returns, POS, and financial reporting. No account or credit card is required." },
  { question: "Do plans include implementation and migration support?", answer: "Starter and Growth include standard onboarding guidance. Enterprise includes an architecture review, custom onboarding, and API integration planning for your operational systems." },
  { question: "Can I change my plan as my operation grows?", answer: "Yes. You can move from Starter to Growth as you add warehouses, approval workflows, landed costing, and accounting requirements. Your existing operational data remains available through planned migrations." },
  { question: "Are the prices fixed for every country?", answer: "Displayed prices are illustrative USD subscription references for the frontend evaluation. Final pricing, taxes, billing currency, and regional terms are confirmed with the sales team before provisioning." },
];

export default function PricingPage() {
  return (
    <main>
      <StructuredData data={faqJsonLd(pricingFaqs)} />
      <section className="bg-[#07111f] text-white"><div className="mx-auto max-w-[1100px] px-5 py-16 text-center sm:px-8 lg:py-20"><h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">ERP pricing by warehouse scale and financial control.</h1><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">Every tier includes inventory, customer credit, order fulfillment, and receipts. Add multi-warehouse accounting and governance as your operation requires them.</p><p className="mt-6 text-xs text-slate-400">Full interactive demo available before you choose a plan.</p></div></section>
      <section className="bg-slate-50 px-5 py-16 dark:bg-background sm:px-8 lg:px-10 lg:py-20"><div className="mx-auto grid max-w-[1240px] items-stretch gap-5 lg:grid-cols-3">{tiers.map((tier) => <article key={tier.id} className={cn("flex h-full flex-col rounded-lg border border-slate-200 bg-card p-6 dark:border-white/10", tier.featured && "border-2 border-primary dark:border-primary")}><h2 className="text-lg font-semibold tracking-tight">{tier.name}</h2><div className="mt-4 flex items-end gap-2"><span className="numeric text-4xl font-semibold tracking-tight">${tier.price}</span><span className="pb-1 text-xs text-muted-foreground">USD / month</span></div><p className="mt-4 min-h-16 text-sm leading-6 text-muted-foreground">{tier.description}</p><div className="mt-5 space-y-2 border-y py-4 text-xs"><p className="numeric font-medium">{tier.warehouses}</p><p className="numeric text-muted-foreground">{tier.users}</p></div><ul className="mt-5 flex-1 space-y-3">{tier.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm leading-6"><Check className="mt-1 size-4 shrink-0 text-slate-400" />{feature}</li>)}</ul><Button asChild variant={tier.featured ? "default" : "outline"} size="lg" className="mt-7 w-full"><Link href={tier.id === "enterprise" ? "mailto:enterprise@nexusledger.com?subject=Enterprise%20plan" : `/register?plan=${tier.id}`}>{tier.cta}<ArrowRight /></Link></Button></article>)}</div><p className="mx-auto mt-7 max-w-3xl text-center text-xs leading-5 text-muted-foreground">Subscription references are for product evaluation. Final commercial terms, taxes, and regional billing are confirmed before account provisioning.</p></section>
      <section className="px-5 py-16 sm:px-8 lg:px-10"><div className="mx-auto max-w-[1100px]"><SectionHeading title="Compare operational depth" description="Every plan uses the same inventory and accounting model. Upgrade for additional scale and governance rather than reimplementing your workflow." /><div className="mt-10 overflow-x-auto rounded-lg border border-slate-200 bg-card dark:border-white/10"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/[0.02] dark:text-slate-400"><tr><th className="p-4 font-semibold uppercase tracking-wider">Capability</th><th className="p-4 font-semibold uppercase tracking-wider">Starter</th><th className="p-4 font-semibold uppercase tracking-wider">Growth</th><th className="p-4 font-semibold uppercase tracking-wider">Enterprise</th></tr></thead><tbody>{[["SKU, orders, POS, and customer credit", true, true, true], ["Multi-warehouse and landed cost", false, true, true], ["Double-entry accounting and AP", false, true, true], ["Approvals, roles, and audit governance", false, false, true], ["Custom onboarding and API planning", false, false, true]].map(([label, starter, growth, enterprise]) => <tr key={label as string} className="border-t"><th scope="row" className="p-4 font-medium">{label as string}</th>{[starter, growth, enterprise].map((enabled, index) => <td key={index} className="p-4 text-xs text-muted-foreground">{enabled ? <><Check className="size-4 text-slate-500" /><span className="sr-only">Included</span></> : "Not included"}</td>)}</tr>)}</tbody></table></div></div></section>
      <section className="border-t px-5 py-16 sm:px-8 lg:px-10"><div className="mx-auto max-w-[960px]"><SectionHeading title="Before you choose a plan" /><FaqList faqs={pricingFaqs} /></div></section>
      <section className="border-t bg-slate-50 px-5 py-14 dark:bg-background sm:px-8"><div className="mx-auto max-w-3xl text-center"><h2 className="text-2xl font-semibold tracking-tight">Test the workflows before choosing a subscription.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Create a purchase, collection, return, sale, and financial report in the complete interactive demo.</p><Button asChild size="lg" className="mt-6"><Link href="/app/dashboard">Launch the full demo<ArrowRight /></Link></Button></div></section>
    </main>
  );
}
