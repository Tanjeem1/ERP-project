import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "@/features/auth/login-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Sign in to NexusLedger ERP",
  description: "Access the NexusLedger inventory, procurement, order management, collections, and accounting workspace through a local demo session.",
  path: "/login",
  imageSection: "ERP workspace access",
  noIndex: true,
});

export default function LoginPage() {
  return <Suspense fallback={<Skeleton className="h-[520px] max-w-xl" />}><LoginForm /></Suspense>;
}
