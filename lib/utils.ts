import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { useErpStore } from "@/store/useErpStore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(
  amountMinor: number,
  currency?: string,
  options: Intl.NumberFormatOptions = {},
) {
  const activeCurrency = currency ?? useErpStore.getState().organization.baseCurrency;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: activeCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amountMinor / 100);
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}
