import Link from "next/link";

export interface LegalSection {
  title: string;
  paragraphs: string[];
  items?: string[];
}

export function LegalDocument({ title, description, sections }: { title: string; description: string; sections: LegalSection[] }) {
  return (
    <main className="bg-slate-50">
      <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-20">
        <header className="border-b border-slate-200 pb-8">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">{description}</p>
          <p className="mt-4 text-xs text-slate-500">Effective November 19, 2026</p>
        </header>
        {sections.map((section) => <section key={section.title} className="border-b border-slate-200 py-8">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-4 text-sm leading-7 text-slate-600">{paragraph}</p>)}
          {section.items ? <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>)}
        <section className="pt-8">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Contact</h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">For questions about these terms, your organization, or your personal data, <Link href="/book-demo" className="text-primary hover:underline">contact the NexusLedger team</Link> or email <a href="mailto:enterprise@nexusledger.com" className="text-primary hover:underline">enterprise@nexusledger.com</a>.</p>
        </section>
      </article>
    </main>
  );
}
