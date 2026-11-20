import Link from "next/link";

import { BookDemoForm } from "@/features/marketing/book-demo-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Book an Enterprise ERP Demo",
  description: "Review multi-warehouse inventory, automated FIFO costing, import landed costs, customer credit, POS, and double-entry accounting with the NexusLedger enterprise team.",
  path: "/book-demo",
  keywords: ["enterprise inventory ERP demo", "multi-warehouse ERP consultation", "landed cost accounting software demo", "supply chain accounting demo"],
  imageSection: "Enterprise ERP consultation",
});

export default function BookDemoPage() {
  return (
    <main className="bg-slate-50 px-5 py-14 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
        <article>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Evaluate your inventory and accounting workflow</h1>
          <p className="mt-5 text-base leading-7 text-slate-600">Tell us how your business receives inventory, allocates import costs, sells across channels, and reconciles customer and supplier balances. We will tailor the demonstration to those operations.</p>
          <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="demo-agenda">
            <h2 id="demo-agenda" className="text-lg font-semibold tracking-tight">What the demonstration covers</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>Multi-warehouse stock, reservations, transfers, and exact FIFO cost layers.</li>
              <li>Import purchase orders, freight and duty allocation, and balanced goods receipts.</li>
              <li>Customer credit, collections, returns, POS, and automated financial statements.</li>
            </ul>
          </section>
          <p className="mt-6 text-sm leading-6 text-slate-600">Want to evaluate the workflow first? <Link href="/app/dashboard" className="font-medium text-primary hover:underline">Open the interactive ERP demo</Link> or use our <Link href="/tools/landed-cost-calculator" className="font-medium text-primary hover:underline">free landed cost calculator</Link>.</p>
        </article>
        <BookDemoForm />
      </div>
    </main>
  );
}
