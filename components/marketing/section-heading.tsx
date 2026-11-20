import { cn } from "@/lib/utils";

export function SectionHeading({ title, description, align = "left", inverse = false }: { title: string; description?: string; align?: "left" | "center"; inverse?: boolean }) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <h2 className={cn("text-balance text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl", inverse ? "text-white" : "text-slate-950 dark:text-white")}>{title}</h2>
      {description ? <p className={cn("mt-4 text-pretty text-base leading-7", inverse ? "text-slate-400" : "text-muted-foreground")}>{description}</p> : null}
    </div>
  );
}
