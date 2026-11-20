import { RoleGuard } from "@/components/erp/role-guard";
import { PosView } from "@/features/pos/pos-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Wholesale and Retail Point of Sale",
  description: "Search SKUs, bill customers, accept split payments, print receipts, and post FIFO stock and double-entry accounting in one POS sale.",
  path: "/app/pos",
  imageSection: "Fast wholesale and retail billing",
  noIndex: true,
});

export default function PosPage() {
  return <RoleGuard roles={["Super Admin", "Warehouse Manager"]}><PosView /></RoleGuard>;
}
