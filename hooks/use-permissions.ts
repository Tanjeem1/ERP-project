"use client";

import { hasPermission, type Permission } from "@/lib/permissions";
import { useErpStore } from "@/store/useErpStore";

export function usePermissions() {
  const role = useErpStore((state) => state.activeRole);
  const can = (permission: Permission) => hasPermission(role, permission);
  return { role, can };
}
