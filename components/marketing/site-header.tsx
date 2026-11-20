import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { DemoLauncher } from "@/components/marketing/demo-launcher";
import { MobileMenu } from "@/components/marketing/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/platform", label: "Platform" },
  { href: "/#industries", label: "Industries" },
  { href: "/pricing", label: "Pricing" },
  { href: "/tools/landed-cost-calculator", label: "Free calculator" },
  { href: "/platform#control", label: "Why NexusLedger" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111f] text-white">
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center gap-7 px-5 sm:px-8 lg:px-10">
        <Brand inverse className="mr-auto" />
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="text-[13px] font-medium text-slate-400 transition hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2.5 sm:flex">
          <ThemeToggle inverse />
          <Link href="/login" className="px-2 text-[13px] font-medium text-slate-300 hover:text-white">Log in</Link>
          <Button asChild variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white max-xl:hidden">
            <Link href="/book-demo"><CalendarDays />Book demo</Link>
          </Button>
          <DemoLauncher className="max-lg:hidden">Launch demo</DemoLauncher>
        </div>
        <MobileMenu />
      </div>
    </header>
  );
}
