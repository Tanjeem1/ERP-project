import { cn } from "@/lib/utils";

export function MetricCard({ label, value, detail, className }: { label: string; value: string; detail: string; className?: string }) {
  return (
    <article className={cn("rounded-lg border border-slate-200 bg-card p-4 dark:border-white/10", className)}>
      <h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</h2>
      <p className="numeric mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="numeric mt-1.5 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}
