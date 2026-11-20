import { Suspense } from "react";

import { RoleGuard } from "@/components/erp/role-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpensesView } from "@/features/expenses/expenses-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Operating Expenses and Petty Cash",
  description: "Record rent, payroll, utilities, fuel, and other business payments with cash, bank, or mobile banking and automatic journal entries.",
  path: "/app/expenses",
  imageSection: "Operating expenses and payment control",
  noIndex: true,
});

export default function ExpensesPage() {
  return <RoleGuard permission="postExpenses"><Suspense fallback={<div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-[520px]" /></div>}><ExpensesView /></Suspense></RoleGuard>;
}
