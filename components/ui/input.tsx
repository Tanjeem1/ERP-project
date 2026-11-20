import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn("flex h-10 w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground transition placeholder:text-muted-foreground/70 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  );
}
