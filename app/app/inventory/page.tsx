import { Suspense } from "react";

import { RoleGuard } from "@/components/erp/role-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { InventoryView } from "@/features/inventory/inventory-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Multi-Warehouse Inventory and FIFO Cost Layers",
  description: "Inspect stock by warehouse, available-to-promise quantities, reservations, transfers, and exact FIFO cost layers in the ERP demo.",
  path: "/app/inventory",
  imageSection: "Multi-warehouse WMS and FIFO inventory",
  noIndex: true,
});

export default function InventoryPage() {
  return <RoleGuard roles={["Super Admin", "Accountant", "Warehouse Manager"]}><Suspense fallback={<div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-[520px]" /></div>}><InventoryView /></Suspense></RoleGuard>;
}
