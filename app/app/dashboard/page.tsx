import { DashboardView } from "@/features/dashboard/dashboard-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "ERP Command Center: Inventory and Finance Overview",
  description: "Review FIFO inventory valuation, warehouse capacity, available stock, gross margin, and automated ledger events in the interactive ERP demo.",
  path: "/app/dashboard",
  imageSection: "Executive inventory and finance command center",
  noIndex: true,
});

export default function DashboardPage() {
  return <DashboardView />;
}
