"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { hasPermission, ROLE_USERS, type Permission } from "@/lib/permissions";
import { useErpStore } from "@/store/useErpStore";
import type { UserRole } from "@/types/erp";

export function RoleGuard({ children, roles, permission }: { children: ReactNode; roles?: UserRole[]; permission?: Permission }) {
  const hydrated = useHydrated();
  const role = useErpStore((state) => state.activeRole);
  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-[480px]" /></div>;
  const allowed = (roles ? roles.includes(role) : true) && (permission ? hasPermission(role, permission) : true);
  if (allowed) return children;
  return (
    <div className="grid min-h-[65vh] place-items-center"><Card className="max-w-lg"><CardContent className="p-8"><h1 className="text-2xl font-semibold tracking-tight">This workspace is restricted</h1><p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">{role}</span> does not have access to this module. {ROLE_USERS[role].description}. Switch to Super Admin or Accountant for financial and governance workflows.</p><Button asChild className="mt-6"><Link href="/app/dashboard">Return to Command Center<ArrowRight /></Link></Button></CardContent></Card></div>
  );
}
