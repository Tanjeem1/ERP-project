import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaSection } from "@/components/marketing/cta-section";
import { DemoLauncher } from "@/components/marketing/demo-launcher";
import { FaqList } from "@/components/marketing/faq-list";
import { SectionHeading } from "@/components/marketing/section-heading";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";
import { getIndustry, industries } from "@/content/industries";
import { absoluteUrl, createMetadata, faqJsonLd, siteConfig } from "@/lib/seo";

interface IndustryPageProps {
  params: Promise<{ industry: string }>;
}

export function generateStaticParams() {
  return industries.map((industry) => ({ industry: industry.slug }));
}

export async function generateMetadata({ params }: IndustryPageProps): Promise<Metadata> {
  const { industry: slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) return {};
  return createMetadata({ title: industry.metadataTitle, description: industry.description, path: `/solutions/${industry.slug}`, imageSection: industry.eyebrow, keywords: [industry.primaryKeyword, `${industry.shortName} inventory software`, `${industry.shortName} ERP`] });
}

export default async function IndustryPage({ params }: IndustryPageProps) {
  const { industry: slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) notFound();
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "Industry solutions", item: absoluteUrl("/#industries") },
      { "@type": "ListItem", position: 3, name: industry.shortName, item: absoluteUrl(`/solutions/${industry.slug}`) },
    ],
  };

  return (
    <main>
      <StructuredData data={[faqJsonLd(industry.faqs), breadcrumbJsonLd]} />
      <article>
        <section className="bg-[#07111f] text-white">
          <div className="mx-auto max-w-[1340px] px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500"><Link href="/" className="hover:text-white">Home</Link><ChevronRight className="size-3" /><Link href="/#industries" className="hover:text-white">Solutions</Link><ChevronRight className="size-3" /><span className="text-slate-300">{industry.shortName}</span></nav>
            <div className="mt-12 grid items-center gap-14 lg:grid-cols-[1fr_.8fr]">
              <div>
                <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[54px]">{industry.headline}</h1>
                <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-400">{industry.intro}</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row"><DemoLauncher className="h-11 px-5 text-sm">Launch your industry demo</DemoLauncher><Button asChild variant="outline-inverse" size="lg"><Link href={`/book-demo?industry=${industry.slug}`}>Book Enterprise Demo<ArrowUpRight /></Link></Button></div>
              </div>
              <section className="rounded-lg border border-white/15 bg-[#0c1928] p-6" aria-label={`${industry.shortName} operating metrics`}>
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4"><h2 className="text-sm font-semibold tracking-tight">{industry.shortName} operating model</h2><span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="size-1.5 rounded-full bg-emerald-400" />Live demo</span></div>
                <dl className="grid grid-cols-2 border-l border-white/10">{industry.stats.map((stat, index) => <div key={stat.label} className={index === 0 ? "col-span-2 border-b border-r border-white/10 py-5" : "border-b border-r border-white/10 py-5 pr-3"}><dd className="numeric text-2xl font-semibold tracking-tight text-white">{stat.value}</dd><dt className="mt-2 text-xs leading-5 text-slate-500">{stat.label}</dt></div>)}</dl>
                <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs text-slate-400">Inventory Asset equals residual FIFO value</p><p className="mt-2 text-xs leading-5 text-slate-500">Every operational event has a balanced financial result that can be traced to its source document.</p></div>
              </section>
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1340px]"><SectionHeading title={`Operational requirements for ${industry.shortName.toLowerCase()}.`} description={industry.description} /><div className="mt-10 grid gap-8 lg:grid-cols-3">{industry.challenges.map((challenge) => <article key={challenge.title} className="border-t border-slate-200 pt-5 dark:border-white/10"><h3 className="text-lg font-semibold tracking-tight">{challenge.title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{challenge.description}</p></article>)}</div></div></section>

        <section className="bg-[#0a1624] px-5 py-20 text-white sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1340px]"><SectionHeading inverse title="From source document to settlement." /><div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-white/10">{industry.workflow.map((step, index) => <article key={step.step} className={index === 0 ? "lg:pr-6" : "lg:px-6"}><h3 className="text-lg font-semibold tracking-tight">{step.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{step.description}</p></article>)}</div></div></section>

        <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[1340px]"><SectionHeading title={`${industry.shortName} workflows with visible costs and accounting.`} description="Open each workflow in the demo and inspect the operational and financial state it changes." /><div className="mt-10 grid gap-5 lg:grid-cols-3">{industry.modules.map((module) => <article key={module.title} className="flex flex-col rounded-lg border border-slate-200 bg-card p-6 dark:border-white/10"><h3 className="text-xl font-semibold tracking-tight">{module.title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{module.description}</p><ul className="mt-6 divide-y divide-slate-200 border-t border-slate-200 pt-2 dark:divide-white/10 dark:border-white/10">{module.bullets.map((bullet) => <li key={bullet} className="py-3 text-sm leading-6">{bullet}</li>)}</ul></article>)}</div></div></section>

        <section className="border-y bg-slate-50 px-5 py-20 dark:bg-background sm:px-8 lg:px-10"><div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><h2 className="text-3xl font-semibold tracking-tight">Review operational outcomes before the period closes.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">Each team sees the same underlying quantities, costs, and financial records for the decision they need to make.</p></div><ul className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">{industry.outcomes.map((outcome) => <li key={outcome} className="py-4 text-sm font-medium leading-6">{outcome}</li>)}</ul></div></section>

        <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="mx-auto max-w-[960px]"><SectionHeading title={`Questions about ${industry.shortName.toLowerCase()} operations`} /><FaqList faqs={industry.faqs} /><div className="mt-10"><Button asChild variant="outline"><Link href="/#industries"><ArrowLeft />Explore all industry solutions</Link></Button></div></div></section>
      </article>
      <CtaSection title={`Test the ${industry.shortName.toLowerCase()} workflow in the interactive ERP demo.`} description={industry.signal + ". Follow inventory movements through to the trial balance."} />
    </main>
  );
}
