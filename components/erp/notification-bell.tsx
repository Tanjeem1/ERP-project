"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, Clock3, PackageX, ShieldAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/erp-api";
import { useErpStore } from "@/store/useErpStore";
import type { NotificationItem } from "@/types/api";

export function NotificationBell() {
  const notifications = useErpStore((state) => state.notifications);
  const organizationId = useErpStore((state) => state.organization.id);
  const refresh = useErpStore((state) => state.refresh);
  const [pending, setPending] = useState(false);
  const query = useQuery({ queryKey: ["notifications", organizationId], queryFn: getNotifications, initialData: notifications, refetchInterval: 30_000 });
  useEffect(() => {
    if (query.data) useErpStore.setState({ notifications: query.data });
  }, [query.data]);
  const unread = notifications.filter((item) => !item.readAt);
  const markAll = async () => {
    setPending(true);
    try {
      await markAllNotificationsRead();
      await refresh(["notifications"]);
    } catch (error) {
      toast.error("Unable to mark notifications as read", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setPending(false);
    }
  };
  const markRead = (item: NotificationItem) => {
    if (item.readAt) return;
    void markNotificationRead(item.id).then((updated) => {
      useErpStore.setState((state) => ({ notifications: state.notifications.map((entry) => entry.id === updated.id ? updated : entry) }));
    }).catch((error: unknown) => toast.error("Unable to update the notification", { description: error instanceof Error ? error.message : "Try again." }));
  };

  return (
    <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`${unread.length} unread notifications`} className="relative grid size-9 place-items-center rounded-md border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"><Bell className="size-4" />{unread.length > 0 ? <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[8px] font-semibold text-white">{unread.length}</span> : null}</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-96"><DropdownMenuLabel><div className="flex items-center justify-between"><span>Operational alerts</span>{unread.length > 0 ? <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] text-rose-600">{unread.length} unread</span> : null}</div></DropdownMenuLabel><DropdownMenuSeparator />{notifications.length === 0 ? <div className="p-5 text-center"><CheckCircle2 className="mx-auto size-5 text-emerald-500" /><p className="mt-2 text-xs font-medium">You’re all caught up</p><p className="mt-1 text-[10px] text-muted-foreground">Low stock, overdue debts, and approvals will appear here.</p></div> : <div className="max-h-[420px] overflow-y-auto">{notifications.map((item) => <DropdownMenuItem key={item.id} asChild><Link href={item.href} onClick={() => markRead(item)} className="flex gap-2.5"><NotificationIcon kind={item.kind} /><div className="min-w-0"><p className="text-xs font-medium">{item.title}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.message}</p><p className="mt-1 text-[9px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("en-US")}{item.readAt ? " · Read" : ""}</p></div></Link></DropdownMenuItem>)}</div>}<DropdownMenuSeparator /><div className="flex items-center justify-between px-2 py-1"><span className="flex items-center gap-1 text-[9px] text-muted-foreground"><Clock3 className="size-3" />Live operational alerts</span><Button variant="ghost" size="sm" className="h-7 text-[10px]" disabled={unread.length === 0 || pending} onClick={() => void markAll()}>{pending ? "Updating…" : "Mark all read"}</Button></div></DropdownMenuContent></DropdownMenu>
  );
}

function NotificationIcon({ kind }: { kind: NotificationItem["kind"] }) {
  if (kind === "LOW_STOCK") return <PackageX className="mt-0.5 size-4 shrink-0 text-amber-500" />;
  if (kind === "OVERDUE_DEBT") return <UsersRound className="mt-0.5 size-4 shrink-0 text-rose-500" />;
  if (kind === "PENDING_APPROVAL") return <ShieldAlert className="mt-0.5 size-4 shrink-0 text-blue-500" />;
  return <Bell className="mt-0.5 size-4 shrink-0 text-slate-500" />;
}
