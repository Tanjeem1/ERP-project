import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Privacy and Data Processing Notice",
  description: "How NexusLedger ERP handles account, organization, inventory accounting, support, and website lead data, including retention and privacy requests.",
  path: "/privacy",
  imageSection: "Privacy and data processing",
  keywords: ["NexusLedger ERP privacy", "ERP data processing", "inventory accounting data security"],
});

const sections: LegalSection[] = [
  { title: "Information we process", paragraphs: ["We process information you provide when registering an organization, accepting an invitation, requesting a demonstration, or contacting us.", "Operational records are controlled by your organization and may contain business contact information about its customers, suppliers, employees, or counterparties."], items: ["Account details: name, work email, organization, assigned role, and authentication records.", "Fiscal and operational details: company identity, currency, timezone, tax settings, inventory, sales, purchasing, payments, expenses, and journal records.", "Technical records: IP address, security logs, timestamps, device and request information necessary to operate and protect the service."] },
  { title: "How information is used", paragraphs: ["We use information to provide the requested service, authenticate users, enforce tenant isolation and roles, process operational transactions, maintain accounting history, provide support, respond to demo requests, and protect the service.", "We do not sell personal information. We do not use your organization’s operational records for advertising. Marketing contact requires an appropriate business basis or consent where required by law; you may opt out at any time."] },
  { title: "Storage, processors, and international access", paragraphs: ["Production records are stored in PostgreSQL. Authentication and application security use encrypted transport, secure cookies, password hashing, and role-based access controls. Infrastructure, email, hosting, and support providers may process limited information on our behalf under appropriate contractual safeguards.", "Where information is accessed across national borders, we use applicable legal safeguards. The production hosting region and any organization-specific processing terms can be documented in an enterprise agreement."] },
  { title: "Retention and deletion", paragraphs: ["We retain account and operational records for the active service relationship and afterward only as necessary for legal obligations, security, dispute resolution, and documented backup cycles.", "Interactive demo organizations expire after 24 hours and are scheduled for deletion. Demo-request records are retained only as needed for sales follow-up and suppression of unwanted communications. Deletion of production accounting records may be limited by applicable recordkeeping obligations and a signed agreement."] },
  { title: "Cookies and public website measurement", paragraphs: ["Authentication cookies keep your ERP session signed in and protect requests against cross-site request forgery. These cookies are not used for advertising.", "The public server-rendered pages do not call the authenticated account endpoint. Any future analytics or non-essential cookies will be described and, where required, subject to consent before activation."] },
  { title: "Your choices and rights", paragraphs: ["Depending on your location, you may request access, correction, deletion, restriction, portability, or objection to processing. Organization administrators can update company, user-role, and many master-data records directly in the workspace.", "To protect organization data, requests relating to another user or an organization’s business records may need to be verified with its administrator. Contact us using the link below to make a privacy request or withdraw marketing consent."] },
  { title: "Security and changes", paragraphs: ["No online service can guarantee absolute security. Notify us promptly of suspected unauthorized access so we can investigate and protect affected accounts.", "We may update this notice as our processing or legal obligations change. Material changes will be posted with a new effective date and communicated where required."] },
];

export default function PrivacyPage() {
  return <LegalDocument title="Privacy and data-processing notice" description="This notice explains how NexusLedger handles account, organization, public website, and operational data." sections={sections} />;
}
