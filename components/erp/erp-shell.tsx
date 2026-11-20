"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Boxes, Building2, Calculator, ChevronRight, CircleHelp, FilePlus2, Landmark, LayoutDashboard, LogOut, Menu, PackageCheck, ReceiptText, RotateCcw, Search, Settings2, ShoppingCart, UsersRound, WalletCards, Warehouse, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Brand } from "@/components/brand";
import { CommandPalette } from "@/components/erp/command-palette";
import { NotificationBell } from "@/components/erp/notification-bell";
import { RoleSwitcher } from "@/components/erp/role-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { emptyErpSnapshot, logout } from "@/lib/erp-api";
import { hasPermission, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore } from "@/store/useSessionStore";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Landmark;
  permission?: Permission;
  hideSalesOfficer?: boolean;
}

const activeNavigation: NavItem[] = [
  { href: "/app/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/app/procurement", label: "Procurement", icon: PackageCheck, hideSalesOfficer: true },
  { href: "/app/inventory", label: "Multi-warehouse WMS", icon: Warehouse, hideSalesOfficer: true },
  { href: "/app/orders", label: "Orders + invoicing", icon: ShoppingCart },
  { href: "/app/customers", label: "Customers + collections", icon: UsersRound },
  { href: "/app/vendors", label: "Vendors + accounts payable", icon: Building2, permission: "postExpenses" },
  { href: "/app/returns", label: "Returns + write-offs", icon: RotateCcw, hideSalesOfficer: true },
  { href: "/app/pos", label: "Point of Sale", icon: Zap, permission: "fulfillOrders" },
  { href: "/app/finance", label: "Finance + statements", icon: Landmark, permission: "viewLedger" },
  { href: "/app/expenses", label: "Expenses + petty cash", icon: WalletCards, permission: "postExpenses" },
  { href: "/app/settings", label: "Governance + audit", icon: Settings2, permission: "viewGovernance" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = useErpStore((state) => state.activeRole);
  const organization = useErpStore((state) => state.organization);
  const inboundOrder = useErpStore((state) => state.purchaseOrders.find((order) => order.status === "Approved" || order.status === "In Transit"));
  const visibleNavigation = activeNavigation.filter((item) => (!item.hideSalesOfficer || role !== "Sales Officer") && (!item.permission || hasPermission(role, item.permission)));
  return (
    <div className="flex h-full flex-col bg-[#0b1726] text-slate-400">
      <div className="flex h-16 items-center border-b border-white/10 px-5"><Brand inverse /></div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
        <nav className="mt-3 space-y-1" aria-label="ERP navigation">{visibleNavigation.map((item) => { const active = pathname === item.href; return <Link key={item.href} href={item.href} onClick={onNavigate} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition", active ? "bg-blue-500/15 text-blue-300" : "hover:bg-white/[0.05] hover:text-white")}><item.icon className="size-4" />{item.label}{active ? <span className="ml-auto size-1.5 rounded-full bg-blue-400" /> : null}</Link>; })}</nav>
        <p className="mt-7 px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Transaction shortcuts</p>
        <div className="mt-3 space-y-1">
          {hasPermission(role, "manageProcurement") ? <><Link href="/app/procurement?create=1" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] hover:bg-white/[0.05] hover:text-white"><FilePlus2 className="size-4" />New purchase order</Link>{inboundOrder ? <Link href={`/app/procurement?po=${inboundOrder.id}&receive=1`} onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] hover:bg-white/[0.05] hover:text-white"><Boxes className="size-4" />Receive purchase order</Link> : null}</> : null}
          {hasPermission(role, "createOrders") ? <Link href="/app/orders?create=1" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] hover:bg-white/[0.05] hover:text-white"><ShoppingCart className="size-4" />New sales order</Link> : null}
          {hasPermission(role, "manageInventory") ? <Link href="/app/inventory" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] hover:bg-white/[0.05] hover:text-white"><Warehouse className="size-4" />Inspect FIFO layers</Link> : null}
          {hasPermission(role, "postExpenses") ? <Link href="/app/expenses?create=1" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] hover:bg-white/[0.05] hover:text-white"><ReceiptText className="size-4" />Record expense</Link> : null}
        </div>
      </div>
      <div className="border-t border-white/10 p-4"><div className="rounded-lg border border-white/10 bg-white/[0.035] p-3"><div className="flex items-center gap-2 text-xs font-medium text-slate-300"><CircleHelp className="size-4 text-blue-400" />{organization.isSandbox ? "Interactive demo" : "Organization workspace"}</div><p className="mt-2 text-[10px] leading-5 text-slate-400">{organization.isSandbox ? "Isolated demonstration records expire after 24 hours." : "Your organization’s operational and accounting records are stored in PostgreSQL."}</p><Link href="/platform" onClick={onNavigate} className="mt-3 flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300">Read platform architecture<ArrowUpRight className="size-3" /></Link></div></div>
    </div>
  );
}

export function ErpShell({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const resetDemo = useErpStore((state) => state.resetDemo);
  const refresh = useErpStore((state) => state.refresh);
  const role = useErpStore((state) => state.activeRole);
  const loadError = useErpStore((state) => state.loadError);
  const organization = useErpStore((state) => state.organization);
  const user = useSessionStore((state) => state.user);
  const currentPage = activeNavigation.find((item) => item.href === pathname)?.label ?? (pathname.startsWith("/app/customers/") ? "Customer account" : "ERP workspace");
  const initials = user?.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "NL";

  const confirmReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await resetDemo();
      const currentUser = useSessionStore.getState().user;
      if (currentUser) queryClient.setQueryData(["auth-me"], { user: currentUser, organization: currentUser.organization });
      setResetOpen(false);
      toast.success("New interactive demo ready", { description: "A separate 24-hour demo organization has been created with opening inventory, orders, and ledger balances." });
      router.push("/app/dashboard");
    } catch (error) {
      toast.error("Unable to create a new demo", { description: error instanceof Error ? error.message : "Try again later." });
    } finally {
      setResetting(false);
    }
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      useSessionStore.getState().clearUser();
      useErpStore.setState({ ...emptyErpSnapshot(null), ready: false, loadError: null });
      queryClient.clear();
      router.replace("/login");
    } catch (error) {
      toast.error("Unable to sign out", { description: error instanceof Error ? error.message : "Try again." });
      setSigningOut(false);
    }
  };

  const retryRefresh = async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <a href="#erp-main" className="fixed left-4 top-3 z-[120] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus:translate-y-0">Skip to workspace</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/10 lg:block"><SidebarContent /></aside>
      {mobileOpen ? <div className="fixed inset-0 z-[65] lg:hidden"><button type="button" aria-label="Close navigation overlay" className="absolute inset-0 bg-slate-950/40" onClick={() => setMobileOpen(false)} /><aside className="absolute inset-y-0 left-0 w-72 border-r border-white/15"><button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 z-10 grid size-8 place-items-center rounded-md text-slate-400"><X className="size-5" /></button><SidebarContent onNavigate={() => setMobileOpen(false)} /></aside></div> : null}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur-xl sm:px-6">
          <button type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="grid size-9 place-items-center rounded-md border lg:hidden"><Menu className="size-4" /></button>
          <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="max-w-44 truncate">{organization.displayName}</span><ChevronRight className="size-3 shrink-0" /><span className="truncate font-medium text-foreground">{currentPage}</span></div>
          <button type="button" onClick={() => setCommandOpen(true)} className="ml-auto flex h-9 w-9 items-center gap-2 rounded-md border bg-secondary/45 px-2 text-muted-foreground transition hover:bg-accent sm:w-[240px] lg:w-[300px]"><Search className="size-4 shrink-0" /><span className="hidden text-xs sm:inline">Search ERP records…</span><span className="ml-auto hidden gap-1 md:flex"><kbd className="rounded border bg-card px-1.5 py-0.5 font-mono text-[9px]">Ctrl</kbd><kbd className="rounded border bg-card px-1.5 py-0.5 font-mono text-[9px]">K</kbd></span></button>
          {organization.isSandbox ? <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 xl:flex"><span className="size-1.5 rounded-full bg-emerald-500" />INTERACTIVE DEMO</span> : null}
          <NotificationBell />
          <RoleSwitcher />
          <ThemeToggle />
          {organization.isSandbox && hasPermission(role, "resetDemo") ? <Button type="button" variant="ghost" size="sm" onClick={() => setResetOpen(true)} className="max-sm:hidden"><RotateCcw /><span className="hidden xl:inline">New demo</span></Button> : null}
          <div className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-300" title={`${user?.fullName ?? "Signed-in user"} · ${role}`}>{initials}</div>
          <Button type="button" variant="ghost" size="icon" aria-label="Sign out" title="Sign out" disabled={signingOut} onClick={() => void signOut()}><LogOut /></Button>
        </header>
        <main id="erp-main" className="flex-1 p-4 sm:p-6 xl:p-7">
          {loadError ? <div role="alert" className="mx-auto mb-5 flex max-w-[1600px] flex-col gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-4 text-xs sm:flex-row sm:items-center"><div className="flex-1"><p className="font-medium">Some workspace data could not be refreshed.</p><p className="mt-1 text-muted-foreground">{loadError} Existing records are shown. Confirm the result of a completed financial posting before retrying it.</p></div><Button type="button" variant="outline" size="sm" disabled={retrying} onClick={() => void retryRefresh()}>{retrying ? "Refreshing…" : "Refresh data"}</Button></div> : null}
          {children}
        </main>
        <footer className="border-t bg-slate-50 px-4 py-4 text-[11px] text-slate-500 dark:bg-card dark:text-muted-foreground sm:px-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p>{organization.displayName} · Base currency {organization.baseCurrency} · {organization.timezone}</p><nav className="flex flex-wrap items-center gap-4" aria-label="ERP footer"><Link href="/platform" className="hover:text-primary">Platform</Link><Link href="/tools/landed-cost-calculator" className="flex items-center gap-1 hover:text-primary"><Calculator className="size-3" />Free calculator</Link><Link href="/" className="flex items-center gap-1 hover:text-primary">NexusLedger website<ArrowUpRight className="size-3" /></Link></nav></div></footer>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!resetting) setResetOpen(open); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Start a new ERP demo?</DialogTitle><DialogDescription>This creates a separate demo organization with fresh opening records and a 24-hour expiration. Your current demo remains available until it expires.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={resetting} onClick={() => setResetOpen(false)}>Keep current demo</Button><Button type="button" disabled={resetting} onClick={() => void confirmReset()}>{resetting ? "Creating demo…" : "Create new demo"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
