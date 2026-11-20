import type { Metadata } from "next";

export const siteConfig = {
  name: "NexusLedger ERP",
  shortName: "NexusLedger",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://nexusledger.com",
  description: "Multi-warehouse inventory ERP with automated FIFO costing, landed cost allocation, and double-entry supply chain accounting.",
  email: "enterprise@nexusledger.com",
};

export function absoluteUrl(path = "") {
  return new URL(path, siteConfig.url).toString();
}

export function socialImageUrl({ title, description, path, section }: { title: string; description: string; path: string; section: string }) {
  const query = new URLSearchParams({ title, description, path, section });
  return absoluteUrl(`/og?${query.toString()}`);
}

export function createMetadata({
  title,
  description,
  path,
  keywords = [],
  imageSection = "Supply chain and finance ERP",
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  imageSection?: string;
  noIndex?: boolean;
}): Metadata {
  const canonical = absoluteUrl(path);
  const image = socialImageUrl({ title, description, path, section: imageSection });
  const imageAlt = `${title}. NexusLedger ERP preview.`;
  return {
    title,
    description,
    keywords: [...new Set([...keywords, "supply chain ERP", "inventory accounting", "NexusLedger ERP"])],
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false, nocache: true } : undefined,
    openGraph: {
      type: "website",
      locale: "en_US",
      url: canonical,
      siteName: siteConfig.name,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: imageAlt, type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: imageAlt }],
    },
  };
}

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteConfig.url}/#organization`,
  name: siteConfig.name,
  url: siteConfig.url,
  logo: absoluteUrl("/icon.svg"),
  description: siteConfig.description,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "sales",
    email: siteConfig.email,
    availableLanguage: "English",
  },
};

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${siteConfig.url}/#software`,
  name: siteConfig.name,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Supply Chain and Enterprise Resource Planning",
  operatingSystem: "Web browser",
  url: siteConfig.url,
  description: siteConfig.description,
  publisher: { "@id": `${siteConfig.url}/#organization` },
  featureList: [
    "Multi-warehouse inventory management",
    "Automated FIFO costing",
    "Landed cost allocation by weight, volume, or value",
    "Automated double-entry supply chain accounting",
    "Omnichannel stock reservations",
    "Real-time general ledger and trial balance",
  ],
};

export function faqJsonLd(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
