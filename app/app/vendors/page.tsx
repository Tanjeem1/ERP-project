import { RoleGuard } from "@/components/erp/role-guard";
import { VendorsView } from "@/features/vendors/vendors-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Vendors, Supplier Debt and Accounts Payable",
  description: "Track supplier purchase commitments, import references, payable balances, and vendor payments with automatic accounts payable journals.",
  path: "/app/vendors",
  imageSection: "Vendor and accounts payable management",
  noIndex: true,
});

export default function VendorsPage() {
  return <RoleGuard permission="postExpenses"><VendorsView /></RoleGuard>;
}
