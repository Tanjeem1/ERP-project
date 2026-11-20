import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  Draft: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400",
  "Pending Approval": "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Approved: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "In Transit": "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  Received: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "Order Placed": "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "Pick & Pack": "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Invoiced: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Posted: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap", styles[status] ?? "bg-secondary text-secondary-foreground", className)}>{status}</Badge>;
}
