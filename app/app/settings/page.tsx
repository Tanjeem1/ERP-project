import { RoleGuard } from "@/components/erp/role-guard";
import { SettingsView } from "@/features/governance/settings-view";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "ERP Roles, Approvals, Audit Log and Fiscal Settings",
  description: "Configure role permissions, approval workflows, audit history, company identity, base currency, and fiscal collection timezone.",
  path: "/app/settings",
  imageSection: "Enterprise governance and fiscal controls",
  noIndex: true,
});

export default function SettingsPage() {
  return <RoleGuard permission="viewGovernance"><SettingsView /></RoleGuard>;
}
