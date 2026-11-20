import { Layers3 } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({ inverse = false, className }: { inverse?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label="NexusLedger ERP home">
      <span className="grid size-8 place-items-center rounded-md bg-emerald-400 text-[#07111f]"><Layers3 className="size-[19px]" strokeWidth={2.4} /></span>
      <span className={cn("text-[17px] font-semibold tracking-tight", inverse ? "text-white" : "text-foreground")}>
        Nexus<span className={inverse ? "text-emerald-400" : "text-primary"}>Ledger</span>
        <span className={cn("ml-1.5 text-[10px] font-medium uppercase tracking-wider", inverse ? "text-slate-500" : "text-muted-foreground")}>ERP</span>
      </span>
    </Link>
  );
}
