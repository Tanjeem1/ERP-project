"use client";

import { CalendarDays } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DateRangeFilter as DateRange } from "@/types/erp";

export function DateRangeFields({ value, onChange, idPrefix = "report" }: { value: DateRange; onChange: (value: DateRange) => void; idPrefix?: string }) {
  const valid = !value.startDate || !value.endDate || value.startDate <= value.endDate;
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-end"><div className="flex items-center gap-2 pb-2 text-xs text-muted-foreground"><CalendarDays className="size-4 text-primary" />Custom period</div><div className="space-y-1.5"><Label htmlFor={`${idPrefix}-start`} className="text-[10px]">Start date</Label><Input id={`${idPrefix}-start`} type="date" value={value.startDate} max={value.endDate} onChange={(event) => onChange({ ...value, startDate: event.target.value })} className="h-8 text-xs" /></div><div className="space-y-1.5"><Label htmlFor={`${idPrefix}-end`} className="text-[10px]">End date</Label><Input id={`${idPrefix}-end`} type="date" value={value.endDate} min={value.startDate} onChange={(event) => onChange({ ...value, endDate: event.target.value })} className="h-8 text-xs" /></div>{!valid ? <p role="alert" className="pb-2 text-[10px] text-destructive">Start date must precede end date.</p> : null}</div>
  );
}
