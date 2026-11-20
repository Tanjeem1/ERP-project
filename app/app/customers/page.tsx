import { RoleGuard } from "@/components/erp/role-guard";
import { CustomersView } from "@/features/customers/customers-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Customer Credit, AR Aging and Daily Collections",
  description: "Track customer debt, credit limits, invoice aging, payments, and daily collections with printable receipts and AR accounting.",
  path: "/app/customers",
  imageSection: "Customer credit and collection management",
  noIndex: true,
});

export default function CustomersPage() {
  return <RoleGuard roles={["Super Admin", "Accountant", "Sales Officer"]}><CustomersView /></RoleGuard>;
}
