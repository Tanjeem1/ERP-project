"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, CheckCircle2, Download, Fingerprint, LockKeyhole, Search, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { DateRangeFields } from "@/components/erp/date-range-filter";
import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { StatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FiscalSettingsForm } from "@/features/settings/fiscal-settings-form";
import { TeamSettingsPanel } from "@/features/governance/team-settings-panel";
import { useHydrated } from "@/hooks/use-hydrated";
import { csvCell, downloadTextFile } from "@/lib/download";
import { reviewApproval } from "@/lib/erp-api";
import { DEFAULT_REPORT_RANGE, timestampWithinRange } from "@/lib/finance";
import { ROLE_PERMISSIONS, ROLE_USERS } from "@/lib/permissions";
import { cn, formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore } from "@/store/useSessionStore";
import type { ApprovalRequest } from "@/types/api";
import type { AuditLogEntry, Customer, PurchaseOrder, SalesOrder, Supplier, UserRole } from "@/types/erp";

const tabs = [
  { id: "approvals", label: "Approval Queue", icon: ShieldCheck },
  { id: "audit", label: "Immutable Audit Trail", icon: Fingerprint },
  { id: "roles", label: "Roles & Permissions", icon: UsersRound },
  { id: "team", label: "Team & Invitations", icon: UsersRound },
  { id: "fiscal", label: "Company Fiscal", icon: Building2 },
] as const;

const permissionLabels: Record<string, string> = {
  viewProfit: "Profit visibility", viewCostPrices: "Cost-price visibility", viewLedger: "Ledger and statements",
  manageProcurement: "Procurement operations", approveTransactions: "Transaction approvals", manageInventory: "Inventory operations",
  createOrders: "Sales-order creation", fulfillOrders: "Order fulfillment", postExpenses: "Expense posting",
  viewGovernance: "Governance and audit", resetDemo: "Reset demo",
};

function auditEntityHref(entry: AuditLogEntry) {
  if (entry.entityType === "Purchase Order") return `/app/procurement?po=${entry.entityId}`;
  if (entry.entityType === "Sales Order") return `/app/orders?order=${entry.entityId}`;
  if (entry.entityType === "Goods Receipt") return `/app/procurement?grn=${entry.entityId}`;
  if (entry.entityType === "Expense") return `/app/expenses?expense=${entry.entityId}`;
  if (entry.entityType === "General Ledger") return "/app/finance";
  if (entry.entityType === "Stock Reservation" || entry.entityType === "Stock Transfer") return "/app/inventory";
  return "/app/settings";
}

export function SettingsView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const queryClient = useQueryClient();
  const state = useErpStore();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("approvals");
  const [approvalType, setApprovalType] = useState("All");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [range, setRange] = useState(DEFAULT_REPORT_RANGE);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const pending = state.approvals.filter((approval) => approval.status === "Pending");
  const purchaseValue = pending.filter((approval) => approval.entityType === "Purchase Order").reduce((sum, approval) => sum + approval.amountBaseMinor, 0);
  const salesValue = pending.filter((approval) => approval.entityType === "Sales Order").reduce((sum, approval) => sum + approval.amountBaseMinor, 0);
  const auditLog = state.auditLog.filter((entry) => {
    if (!timestampWithinRange(entry.timestamp, range)) return false;
    if (roleFilter !== "All" && entry.role !== roleFilter) return false;
    if (!search.trim()) return true;
    return `${entry.action} ${entry.entityType} ${entry.entityId} ${entry.userName} ${entry.oldValue} ${entry.newValue}`.toLowerCase().includes(search.toLowerCase());
  });
  const review = async (approval: ApprovalRequest, decision: "approve" | "reject") => {
    let reason: string | undefined;
    if (decision === "reject") {
      const response = window.prompt(`Reason for rejecting ${approval.entityNumber}`);
      if (response === null || !response.trim()) return;
      reason = response.trim();
    }
    setPendingAction(approval.id);
    try {
      await reviewApproval(approval.id, decision, reason);
      await state.refresh(["approvals", "purchaseOrders", "orders", "notifications", "auditLog"]);
      toast.success(`${approval.entityNumber} ${decision === "approve" ? "approved" : "rejected"}`, { description: "The decision and actor are recorded in the immutable audit trail." });
    } catch (error) {
      toast.error("Approval decision failed", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally { setPendingAction(null); }
  };
  const exportAudit = () => {
    const header = ["Timestamp", "User", "Role", "Action", "Entity Type", "Entity ID", "Old Value", "New Value"].map(csvCell).join(",");
    const rows = auditLog.map((entry) => [entry.timestamp, entry.userName, entry.role, entry.action, entry.entityType, entry.entityId, entry.oldValue, entry.newValue].map(csvCell).join(","));
    downloadTextFile("nexusledger-audit-trail.csv", [header, ...rows].join("\n"), "text/csv;charset=utf-8");
  };
  const switchRole = async (role: UserRole) => {
    try {
      await state.setActiveRole(role);
      const user = useSessionStore.getState().user;
      if (user) queryClient.setQueryData(["auth-me"], { user, organization: user.organization });
      toast.success(`Acting as ${role}`, { description: ROLE_USERS[role].description });
      router.push("/app/dashboard");
    } catch (error) { toast.error("Unable to change role", { description: error instanceof Error ? error.message : "Team roles are assigned by an administrator." }); }
  };

  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[520px]" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Approvals, roles, and immutable audit history" description="Enforce transaction thresholds and customer credit controls, then trace every mutation to its actor, role, entity, and exact before-and-after values." actions={<><Button asChild variant="outline"><Link href="/app/finance">Financial controls<ArrowRight /></Link></Button><Button variant="outline" onClick={exportAudit}><Download />Export audit CSV</Button></>} />
      <section aria-label="Governance KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Pending approvals", value: pending.length.toString(), detail: "Requires Super Admin or Accountant" },
        { label: "PO value awaiting approval", value: formatMoney(purchaseValue), detail: "Above the $5,000 control threshold" },
        { label: "Credit value awaiting approval", value: formatMoney(salesValue), detail: "Customer credit-limit control" },
        { label: "Immutable audit events", value: state.auditLog.length.toString(), detail: `${auditLog.length} in the selected filter` },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition", tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}><item.icon className="size-3.5" />{item.label}{item.id === "approvals" && pending.length > 0 ? <span className="numeric rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-400">{pending.length}</span> : null}</button>)}</div>

      {tab === "approvals" ? <section className="space-y-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Transaction approval queue</h2><p className="mt-1 text-[10px] text-muted-foreground">Review control reasons before authorizing execution or stock locks</p></div><select aria-label="Filter approval type" value={approvalType} onChange={(event) => setApprovalType(event.target.value)} className="h-9 rounded-md border bg-card px-3 text-xs"><option>All</option><option value="Purchase Order">Purchase Orders</option><option value="Sales Order">Sales Orders</option></select></div><div className="grid gap-5 xl:grid-cols-2">{pending.filter((approval) => approvalType === "All" || approval.entityType === approvalType).map((approval) => <ApprovalCard key={approval.id} approval={approval} purchaseOrders={state.purchaseOrders} orders={state.orders} suppliers={state.suppliers} customers={state.customers} pending={pendingAction === approval.id} onReview={review} />)}</div>{pending.length === 0 ? <Card><CardContent className="p-12 text-center"><CheckCircle2 className="mx-auto size-8 text-emerald-500" /><h3 className="mt-4 text-lg font-semibold">Approval queue is clear</h3><p className="mt-2 text-sm text-muted-foreground">No purchase orders or customer-credit exceptions are waiting for review.</p></CardContent></Card> : null}</section> : null}

      {tab === "audit" ? <section className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-sm font-semibold">Immutable audit trail</h2><p className="mt-1 text-[10px] text-muted-foreground">Append-only actor and before/after history for every store mutation</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search audit log" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Action, entity, user, value…" className="h-9 pl-9 text-xs sm:w-64" /></div><select aria-label="Filter audit by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-9 rounded-md border bg-card px-3 text-xs"><option>All</option><option>System</option>{Object.keys(ROLE_USERS).map((role) => <option key={role}>{role}</option>)}</select></div></div><div className="border-b p-3"><DateRangeFields value={range} onChange={setRange} idPrefix="audit" /></div><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-xs"><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Timestamp</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">User / Role</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Action</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Entity</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Old Value</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">New Value</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Integrity</th></tr></thead><tbody>{auditLog.map((entry) => <tr key={entry.id} className="border-b align-top last:border-0 hover:bg-accent/25"><td className="px-4 py-3 text-[10px] text-muted-foreground">{new Date(entry.timestamp).toLocaleString("en-US")}</td><td className="px-3 py-3"><p className="font-medium">{entry.userName}</p><div className="mt-1"><StatusBadge status={entry.role} /></div></td><td className="px-3 py-3 font-medium">{entry.action}</td><td className="px-3 py-3"><Link href={auditEntityHref(entry)} className="font-mono text-primary hover:underline">{entry.entityId}</Link><p className="mt-1 text-[10px] text-muted-foreground">{entry.entityType}</p></td><td className="max-w-[250px] px-3 py-3"><p className="line-clamp-3 break-words text-[10px] leading-5 text-muted-foreground" title={entry.oldValue}>{entry.oldValue}</p></td><td className="max-w-[280px] px-3 py-3"><p className="line-clamp-3 break-words text-[10px] leading-5" title={entry.newValue}>{entry.newValue}</p></td><td className="px-4 py-3 text-right"><Badge variant="success"><LockKeyhole />Immutable</Badge></td></tr>)}</tbody></table>{auditLog.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No audit events match this period and filter.</p> : null}</div><div className="flex justify-between border-t bg-secondary/20 px-4 py-3 text-[10px] text-muted-foreground"><span>{auditLog.length} events</span><span>Append-only · no edit or delete action is available</span></div></section> : null}

      {tab === "roles" ? <section><div className="mb-5"><h2 className="text-sm font-semibold tracking-tight">Role profiles</h2><p className="mt-1 text-xs text-muted-foreground">Verify data visibility and action permissions across the workspace.</p></div><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">{(Object.keys(ROLE_USERS) as UserRole[]).map((role) => { const user = ROLE_USERS[role]; const active = state.activeRole === role; return <Card key={role} className={active ? "border-primary" : ""}><CardHeader><CardTitle className="text-base">{role}</CardTitle><CardDescription>{user.name}</CardDescription></CardHeader><CardContent><p className="min-h-12 text-xs leading-6 text-muted-foreground">{user.description}</p><div className="mt-4 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">{Object.entries(ROLE_PERMISSIONS[role]).map(([permission, allowed]) => <div key={permission} className="flex items-center justify-between gap-3 py-2 text-xs"><span className={allowed ? "" : "text-muted-foreground"}>{permissionLabels[permission]}</span><span className="text-muted-foreground">{allowed ? "Allowed" : "Restricted"}</span></div>)}</div><Button className="mt-5 w-full" variant={active ? "secondary" : "outline"} disabled={active || pendingAction !== null} onClick={() => void switchRole(role)}>{active ? "Current role" : `Act as ${role}`}</Button></CardContent></Card>; })}</div></section> : null}
      {tab === "team" ? <TeamSettingsPanel /> : null}
      {tab === "fiscal" ? <FiscalSettingsForm /> : null}
    </div>
  );
}

function ApprovalCard({ approval, purchaseOrders, orders, suppliers, customers, pending, onReview }: { approval: ApprovalRequest; purchaseOrders: PurchaseOrder[]; orders: SalesOrder[]; suppliers: Supplier[]; customers: Customer[]; pending: boolean; onReview: (approval: ApprovalRequest, decision: "approve" | "reject") => Promise<void> }) {
  const purchaseOrder = purchaseOrders.find((order) => order.id === approval.entityId);
  const salesOrder = orders.find((order) => order.id === approval.entityId);
  const supplier = suppliers.find((supplier) => supplier.id === purchaseOrder?.supplierId);
  const customer = customers.find((customer) => customer.id === salesOrder?.customerId);
  return <Card className="border-amber-500/25"><CardHeader className="flex-row items-start justify-between space-y-0"><div><div className="flex items-center gap-2"><CardTitle className="font-mono text-base text-primary">{approval.entityNumber}</CardTitle><StatusBadge status={approval.status} /></div><CardDescription className="mt-2">{supplier?.name ?? customer?.name ?? approval.requestedBy} · {purchaseOrder?.reference ?? salesOrder?.reference ?? approval.entityId}</CardDescription></div><Badge variant="warning">{approval.entityType === "Purchase Order" ? "PO CONTROL" : "CREDIT CONTROL"}</Badge></CardHeader><CardContent><p className="numeric text-2xl font-semibold">{formatMoney(approval.amountBaseMinor)}</p><div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Approval reason</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{approval.reason}</p></div><div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground"><span>Requested by {approval.requestedByRole}</span><span>{new Date(approval.createdAt).toLocaleString("en-US")}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={approval.entityType === "Purchase Order" ? `/app/procurement?po=${approval.entityId}` : `/app/orders?order=${approval.entityId}`}>Review document</Link></Button><Button disabled={pending} onClick={() => void onReview(approval, "approve")}><ShieldCheck />{pending ? "Saving…" : "Approve"}</Button><Button variant="outline" disabled={pending} onClick={() => void onReview(approval, "reject")}>Reject</Button></div></CardContent></Card>;
}
