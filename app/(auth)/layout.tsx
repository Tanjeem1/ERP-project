import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between"><Brand /><nav className="flex items-center gap-4 text-xs" aria-label="Authentication navigation"><Link href="/pricing" className="text-muted-foreground hover:text-primary">Pricing</Link><Link href="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary"><ArrowLeft className="size-3.5" />Back to site</Link></nav></div></header>
      <main className="grid flex-1 lg:grid-cols-[.85fr_1.15fr]"><aside className="hidden border-r border-white/10 bg-[#07111f] p-12 text-white lg:block"><div className="mx-auto flex h-full max-w-md flex-col justify-center"><h2 className="text-4xl font-semibold leading-tight tracking-tight">Purchasing, inventory, sales, collections, and accounting in one workspace.</h2><ul className="mt-8 divide-y divide-white/10 border-y border-white/10 text-sm text-slate-300">{["Exact FIFO and landed costing", "Customer and supplier credit control", "Returns, POS, and double-entry reports", "Roles, approvals, and immutable audit history"].map((item) => <li key={item} className="py-4">{item}</li>)}</ul><p className="mt-6 text-xs leading-5 text-slate-400">Your organization’s operational and financial records are stored securely in PostgreSQL. Demo workspaces expire after 24 hours.</p></div></aside><div className="flex items-center justify-center px-5 py-10 sm:px-8"><div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 sm:p-8">{children}</div></div></main>
      <footer className="border-t border-slate-200 bg-white px-5 py-4 text-center text-xs text-muted-foreground"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 sm:flex-row"><p>© 2026 NexusLedger ERP. Secure ERP workspace.</p><div className="flex gap-4"><Link href="/platform" className="hover:text-primary">Platform</Link><Link href="/tools/landed-cost-calculator" className="hover:text-primary">Free calculator</Link></div></div></footer>
    </div>
  );
}
