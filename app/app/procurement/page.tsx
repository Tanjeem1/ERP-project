import { Suspense } from "react";

import { RoleGuard } from "@/components/erp/role-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { ProcurementView } from "@/features/procurement/procurement-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Purchase Orders and Landed Cost Allocation",
  description: "Create and approve purchase orders, receive goods, allocate import charges, and generate balanced inventory and accrual journals.",
  path: "/app/procurement",
  imageSection: "Procurement and landed cost workbench",
  noIndex: true,
});

export default function ProcurementPage() {
  return <RoleGuard roles={["Super Admin", "Accountant", "Warehouse Manager"]}><Suspense fallback={<div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-[520px]" /></div>}><ProcurementView /></Suspense></RoleGuard>;
}
