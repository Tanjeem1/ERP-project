import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { DemoLauncher } from "@/components/marketing/demo-launcher";
import { Button } from "@/components/ui/button";

export function CtaSection({ title = "Test your inventory and accounting workflow.", description = "Receive an import, reserve stock, ship an order, and inspect the resulting financial entries in the interactive ERP demo." }: { title?: string; description?: string }) {
  return (
    <section className="border-y border-white/10 bg-[#0a2a27] px-5 py-16 text-white sm:px-8 lg:px-10 lg:py-20">
      <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{description}</p>
          <p className="mt-5 text-xs text-slate-400">No login required. Your isolated demo is stored in PostgreSQL and expires after 24 hours.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <DemoLauncher />
          <Button asChild variant="outline-inverse" size="lg"><Link href="/book-demo"><CalendarDays />Book Enterprise Demo</Link></Button>
        </div>
      </div>
    </section>
  );
}
