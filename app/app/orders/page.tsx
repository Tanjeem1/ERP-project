import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { OrdersView } from "@/features/orders/orders-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Omnichannel Orders, Fulfillment and Invoicing",
  description: "Reserve stock, manage B2B and e-commerce orders, ship FIFO inventory, and generate tax invoices and balanced accounting.",
  path: "/app/orders",
  imageSection: "Omnichannel order management",
  noIndex: true,
});

export default function OrdersPage() {
  return <Suspense fallback={<div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-[520px]" /></div>}><OrdersView /></Suspense>;
}
