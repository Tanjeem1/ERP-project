import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NotFoundContent() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-5 py-24">
      <section className="max-w-xl text-center">
        <p className="numeric text-sm text-primary">404</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">The requested page could not be found.</h1>
        <p className="mt-4 text-muted-foreground">Return to the homepage or continue to the ERP platform and free landed cost calculator.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Button asChild size="lg"><Link href="/"><ArrowLeft />Return home</Link></Button><Button asChild variant="outline" size="lg"><Link href="/platform">Explore the platform<ArrowRight /></Link></Button></div>
        <Link href="/tools/landed-cost-calculator" className="mt-6 inline-flex text-sm font-medium text-primary hover:underline">Open the free landed cost calculator</Link>
      </section>
    </main>
  );
}
