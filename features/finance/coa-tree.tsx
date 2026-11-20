"use client";

import { ArrowRight, ChevronDown, FolderTree } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn, formatMoney } from "@/lib/utils";
import type { AccountBalance, AccountGroup } from "@/types/erp";

const groups: Array<{ id: AccountGroup; label: string; normal: "Debit" | "Credit" }> = [
  { id: "Assets", label: "Assets", normal: "Debit" },
  { id: "Liabilities", label: "Liabilities", normal: "Credit" },
  { id: "Equity", label: "Equity", normal: "Credit" },
  { id: "Revenue", label: "Revenue", normal: "Credit" },
  { id: "COGS", label: "Cost of Goods Sold", normal: "Debit" },
  { id: "Expenses", label: "Operating Expenses", normal: "Debit" },
];

export function CoaTree({ balances, onSelectAccount }: { balances: AccountBalance[]; onSelectAccount: (accountId: string) => void }) {
  return (
    <div className="space-y-3">{groups.map((group) => {
      const groupBalances = balances.filter((item) => item.account.group === group.id);
      const totalMinor = groupBalances.reduce((sum, item) => sum + item.balanceMinor, 0);
      const rootAccounts = groupBalances.filter((item) => !item.account.parentId);
      const childAccounts = groupBalances.filter((item) => item.account.parentId);
      return (
        <details key={group.id} name="coa-group" className="group rounded-lg border bg-card" open>
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 marker:hidden [&::-webkit-details-marker]:hidden"><ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" /><FolderTree className="size-4 text-primary" /><span className="text-sm font-semibold">{group.label}</span><Badge variant="secondary">{childAccounts.length}</Badge><span className={cn("numeric ml-auto text-sm font-semibold", totalMinor < 0 && "text-destructive")}>{formatMoney(totalMinor)}</span></summary>
          <div className="border-t">{rootAccounts.map((item) => <div key={item.account.id} className="flex items-center gap-3 border-b bg-secondary/30 px-4 py-2.5 text-xs last:border-0"><span className="font-mono text-[10px] text-muted-foreground">{item.account.code}</span><span className="font-medium">{item.account.name}</span><span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground">{group.normal} balance</span></div>)}{childAccounts.map((item) => <button key={item.account.id} type="button" onClick={() => onSelectAccount(item.account.id)} className="group/row flex w-full items-center gap-3 border-b px-4 py-3 text-left text-xs transition last:border-0 hover:bg-accent/45"><span className="font-mono text-[10px] text-muted-foreground">{item.account.code}</span><span className="flex-1"><span className="block font-medium">{item.account.name}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">DR {formatMoney(item.debitMinor)} · CR {formatMoney(item.creditMinor)}</span></span><span className={cn("numeric font-semibold", item.balanceMinor < 0 && "text-destructive")}>{formatMoney(item.balanceMinor)}</span><ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition group-hover/row:opacity-100" /></button>)}</div>
        </details>
      );
    })}</div>
  );
}
