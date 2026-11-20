import type { MetadataRoute } from "next";

import { industries } from "@/content/industries";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/platform"), lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: absoluteUrl("/pricing"), lastModified, changeFrequency: "monthly", priority: 0.8 },
    ...industries.map((industry) => ({ url: absoluteUrl(`/solutions/${industry.slug}`), lastModified, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: absoluteUrl("/tools/landed-cost-calculator"), lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/book-demo"), lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/terms"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
