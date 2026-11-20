import type { Metadata } from "next";
import { Suspense } from "react";

import { RoleGuard } from "@/components/erp/role-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerDetailView } from "@/features/customers/customer-detail-view";
import { createMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return createMetadata({
    title: `Customer Account ${id.toUpperCase()}: Credit and Collections`,
    description: "Review itemized purchases, customer credit, open receivables, payment history, and printable collection receipts in the ERP demo.",
    path: `/app/customers/${id}`,
    imageSection: "Customer account and receivable detail",
    noIndex: true,
  });
}

export default function CustomerDetailPage() {
  return <RoleGuard roles={["Super Admin", "Accountant", "Sales Officer"]}><Suspense fallback={<Skeleton className="h-[640px]" />}><CustomerDetailView /></Suspense></RoleGuard>;
}
