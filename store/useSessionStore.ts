import { create } from "zustand";

import type { Organization, UserRole } from "@/types/erp";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  roleCode: "SUPER_ADMIN" | "ACCOUNTANT" | "WAREHOUSE_MANAGER" | "SALES_OFFICER";
  organization: Organization;
}

interface SessionState {
  user: SessionUser | null;
  loaded: boolean;
  setUser: (user: SessionUser) => void;
  clearUser: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  loaded: false,
  setUser: (user) => set({ user, loaded: true }),
  clearUser: () => set({ user: null, loaded: true }),
}));
