import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ErpShell } from "@/components/erp/erp-shell";
import { WorkspaceProviders } from "@/components/erp/workspace-providers";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Interactive ERP Demo",
    description: "Evaluate multi-warehouse inventory, procurement, orders, collections, POS, and double-entry accounting in the NexusLedger interactive demo.",
    path: "/app/dashboard",
    imageSection: "Interactive ERP workspace",
    noIndex: true,
  }),
  title: { default: "Interactive ERP Demo | NexusLedger ERP", template: "%s | NexusLedger ERP" },
};

export default function ErpLayout({ children }: { children: ReactNode }) {
  return <WorkspaceProviders><ErpShell>{children}</ErpShell></WorkspaceProviders>;
}
