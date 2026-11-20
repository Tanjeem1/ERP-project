import { Suspense } from "react";

import { RoleGuard } from "@/components/erp/role-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { ReturnsView } from "@/features/returns/returns-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Sales Returns, Credit Notes and Stock Write-Offs",
  description: "Process sales returns, restock sellable items, expense damaged goods, issue credit notes, and reconcile physical stock counts.",
  path: "/app/returns",
  imageSection: "Returns and inventory adjustment controls",
  noIndex: true,
});

export default function ReturnsPage() {
  return <RoleGuard roles={["Super Admin", "Accountant", "Warehouse Manager"]}><Suspense fallback={<Skeleton className="h-[640px]" />}><ReturnsView /></Suspense></RoleGuard>;
}
