import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RegisterForm } from "@/features/auth/register-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Create Your ERP Organization",
  description: "Configure your company, base currency, fiscal timezone, and invoice settings before exploring the interactive NexusLedger ERP workspace.",
  path: "/register",
  imageSection: "Organization and fiscal setup",
  noIndex: true,
});

export default function RegisterPage() {
  return <Suspense fallback={<Skeleton className="h-[640px] max-w-xl" />}><RegisterForm /></Suspense>;
}
