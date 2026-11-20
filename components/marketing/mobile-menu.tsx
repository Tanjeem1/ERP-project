"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DemoLauncher } from "@/components/marketing/demo-launcher";

const links = [
  { href: "/platform", label: "Platform" },
  { href: "/#industries", label: "Industries" },
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Create organization" },
  { href: "/tools/landed-cost-calculator", label: "Landed cost calculator" },
  { href: "/platform#control", label: "Why NexusLedger" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid size-9 place-items-center rounded-md border border-white/15 text-slate-200">
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open ? (
        <nav className="absolute inset-x-4 top-[68px] rounded-lg border border-white/15 bg-[#0b1726] p-2" aria-label="Mobile navigation">
          {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-md px-3 py-3 text-sm text-slate-200 hover:bg-white/5">{link.label}<ArrowUpRight className="size-4 text-slate-500" /></Link>)}
          <Link href="/book-demo" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-md px-3 py-3 text-sm text-slate-200 hover:bg-white/5">Book demo<ArrowUpRight className="size-4 text-slate-500" /></Link>
          <DemoLauncher className="mt-2 w-full" />
        </nav>
      ) : null}
    </div>
  );
}
