"use client";

import { useQueryClient } from "@tanstack/react-query";
import { UserRoundCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ROLE_USERS } from "@/lib/permissions";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore } from "@/store/useSessionStore";
import type { UserRole } from "@/types/erp";

export function RoleSwitcher() {
  const queryClient = useQueryClient();
  const user = useSessionStore((state) => state.user);
  const role = useErpStore((state) => state.activeRole);
  const setActiveRole = useErpStore((state) => state.setActiveRole);
  const [pending, setPending] = useState(false);
  const profile = ROLE_USERS[role];
  const isSandbox = Boolean(user?.organization.isSandbox);
  const changeRole = async (nextRole: UserRole) => {
    if (nextRole === role || pending) return;
    setPending(true);
    try {
      await setActiveRole(nextRole);
      const current = useSessionStore.getState().user;
      if (current) queryClient.setQueryData(["auth-me"], { user: current, organization: current.organization });
      toast.success(`Acting as ${nextRole}`, { description: ROLE_USERS[nextRole].description });
    } catch (error) {
      toast.error("Unable to change role", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-md border bg-secondary/35 px-2 py-1.5" title={isSandbox ? profile.description : "Your organization role is assigned by an administrator."}>
      <UserRoundCog className="size-4 shrink-0 text-primary" />
      <div className="hidden max-w-32 xl:block"><p className="text-[9px] leading-none text-muted-foreground">{isSandbox ? "DEMO ROLE" : "YOUR ROLE"}</p><p className="mt-1 truncate text-[10px] font-medium leading-none">{user?.fullName || user?.email}</p></div>
      <select aria-label={isSandbox ? "Active demo role" : "Your organization role"} value={role} disabled={!isSandbox || pending} onChange={(event) => void changeRole(event.target.value as UserRole)} className="max-w-[118px] bg-transparent text-[10px] font-medium outline-none disabled:cursor-not-allowed sm:max-w-none sm:text-xs">
        {(Object.keys(ROLE_USERS) as UserRole[]).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
  );
}
