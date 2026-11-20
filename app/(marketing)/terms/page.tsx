import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "NexusLedger ERP Service Terms",
  description: "Terms for NexusLedger ERP accounts, organization data, inventory accounting workflows, subscriptions, and acceptable use.",
  path: "/terms",
  imageSection: "ERP service terms",
  keywords: ["NexusLedger ERP terms", "inventory ERP service agreement"],
});

const sections: LegalSection[] = [
  { title: "Accounts and organization administration", paragraphs: ["You must provide accurate registration information, protect account credentials, and use the service only for authorized business purposes. An organization’s Super Admin is responsible for inviting users, assigning roles, reviewing approvals, and maintaining its fiscal settings.", "You must be authorized to act for the company you register. You may not share credentials, bypass role restrictions, interfere with another organization, or attempt unauthorized access to the service or its infrastructure."] },
  { title: "Inventory and accounting records", paragraphs: ["The service records purchase orders, stock movements, FIFO cost layers, sales, payments, expenses, and double-entry journals according to the information entered by your organization.", "Your organization is responsible for source documents, exchange rates, tax configuration, physical stock counts, and review of financial statements by a qualified professional. NexusLedger does not provide tax, legal, or investment advice. Posted journals are immutable; correcting transactions create additional records rather than rewriting accounting history."] },
  { title: "Subscriptions and evaluation workspaces", paragraphs: ["Paid plans, billing periods, included usage, and any contracted service levels are defined at purchase or in a separate order form. Prices shown on the public pricing page are in US dollars unless stated otherwise. Applicable taxes are calculated separately.", "An interactive demo is an isolated evaluation environment. Demo organizations and their records expire after 24 hours and are not a substitute for a registered production organization. Do not enter confidential customer data into a demo."] },
  { title: "Acceptable use and service operation", paragraphs: ["You retain responsibility for the data and documents your organization submits.", "We may suspend access necessary to protect the service, investigate abuse, comply with law, or address a material security risk."], items: ["Do not introduce malware, automate abusive requests, or attempt to disrupt service availability.", "Do not use the service to violate applicable law, infringe intellectual property, or process unlawful content.", "Maintain your own operational backups and export records needed for statutory retention."] },
  { title: "Confidentiality, security, and availability", paragraphs: ["Each party must protect non-public information received from the other and use it only to provide or use the service. Our privacy notice describes personal-data handling.", "We work to maintain a reliable service, but internet services can require maintenance or experience interruption. No uptime guarantee is created by the public website; any committed availability or support target must appear in your order form."] },
  { title: "Termination and liability", paragraphs: ["You may stop using the service or close your account subject to any active order form. We may terminate access for material breach, unlawful use, or non-payment after applicable notice. Provisions concerning ownership, confidentiality, accounting records, and liability survive termination.", "To the extent permitted by law, NexusLedger is not liable for indirect or consequential losses arising from use of the service. Any liability limits or warranties in a signed order form take precedence over this public summary."] },
  { title: "Changes and governing agreement", paragraphs: ["We may update these terms to reflect service, legal, or security changes. Material changes will be communicated through the service or the administrator’s registered contact details. Continued use after the effective date constitutes acceptance of the updated terms.", "A signed enterprise agreement controls where it conflicts with these public terms."] },
];

export default function TermsPage() {
  return <LegalDocument title="NexusLedger ERP service terms" description="These terms govern access to the NexusLedger inventory, supply chain, point-of-sale, and accounting service." sections={sections} />;
}
