import { NotFoundContent } from "@/components/marketing/not-found-content";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Page Not Found",
  description: "The requested page could not be found. Return to NexusLedger to explore the ERP platform, industry solutions, pricing, and free calculator.",
  path: "/404",
  imageSection: "NexusLedger navigation",
  noIndex: true,
});

export default function MarketingNotFound() {
  return <NotFoundContent />;
}
