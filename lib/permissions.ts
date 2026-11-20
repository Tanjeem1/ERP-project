import type { UserRole } from "@/types/erp";

export const ROLE_USERS: Record<UserRole, { id: string; name: string; initials: string; description: string }> = {
  "Super Admin": { id: "usr-ava", name: "Ava Khan", initials: "AK", description: "Full operational, financial, and governance access" },
  Accountant: { id: "usr-liam", name: "Liam Chen", initials: "LC", description: "Financial reports, expenses, and approval controls" },
  "Warehouse Manager": { id: "usr-maya", name: "Maya Rodriguez", initials: "MR", description: "Procurement, inventory, transfers, and fulfillment" },
  "Sales Officer": { id: "usr-noah", name: "Noah Patel", initials: "NP", description: "Sales orders and customer-facing information" },
};

export const ROLE_PERMISSIONS = {
  "Super Admin": {
    viewProfit: true,
    viewCostPrices: true,
    viewLedger: true,
    manageProcurement: true,
    approveTransactions: true,
    manageInventory: true,
    createOrders: true,
    fulfillOrders: true,
    postExpenses: true,
    viewGovernance: true,
    resetDemo: true,
  },
  Accountant: {
    viewProfit: true,
    viewCostPrices: true,
    viewLedger: true,
    manageProcurement: false,
    approveTransactions: true,
    manageInventory: false,
    createOrders: false,
    fulfillOrders: false,
    postExpenses: true,
    viewGovernance: true,
    resetDemo: false,
  },
  "Warehouse Manager": {
    viewProfit: false,
    viewCostPrices: true,
    viewLedger: false,
    manageProcurement: true,
    approveTransactions: false,
    manageInventory: true,
    createOrders: true,
    fulfillOrders: true,
    postExpenses: false,
    viewGovernance: false,
    resetDemo: false,
  },
  "Sales Officer": {
    viewProfit: false,
    viewCostPrices: false,
    viewLedger: false,
    manageProcurement: false,
    approveTransactions: false,
    manageInventory: false,
    createOrders: true,
    fulfillOrders: false,
    postExpenses: false,
    viewGovernance: false,
    resetDemo: false,
  },
} as const;

export type Permission = keyof (typeof ROLE_PERMISSIONS)["Super Admin"];

export function hasPermission(role: UserRole, permission: Permission) {
  return ROLE_PERMISSIONS[role][permission];
}

export function assertPermission(role: UserRole, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new Error(`${role} does not have the ${permission} permission. Switch to an authorized demo role.`);
  }
}
