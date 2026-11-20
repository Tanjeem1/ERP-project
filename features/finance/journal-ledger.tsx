"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { JournalEntryContent } from "@/components/erp/record-detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiDownload, saveBlob } from "@/lib/api";
import { getDefaultReportRange } from "@/lib/erp-api";
import { formatMoney } from "@/lib/utils";
import type { Account, DateRangeFilter, JournalEntry } from "@/types/erp";

export function JournalLedger({ entries, accounts, accountFilter, onAccountFilterChange, range }: { entries: JournalEntry[]; accounts: Account[]; accountFilter: string; onAccountFilterChange: (accountId: string) => void; range?: DateRangeFilter }) {
  const [search, setSearch] = useState("");
  const exportMutation = useMutation({
    mutationFn: async () => {
      const period = range ?? getDefaultReportRange();
      const accountQuery = accountFilter === "All" ? "" : `&accountId=${encodeURIComponent(accountFilter)}`;
      const result = await apiDownload(`/finance/journal-entries/export/?startDate=${period.startDate}&endDate=${period.endDate}${accountQuery}`);
      saveBlob(result.blob, result.filename);
    },
  });
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const selectedJournal = entries.find((entry) => entry.id === selectedJournalId);
  const filteredEntries = [...entries].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).filter((entry) => {
    if (accountFilter !== "All" && !entry.lines.some((line) => line.accountId === accountFilter)) return false;
    if (!search.trim()) return true;
    return `${entry.number} ${entry.description} ${entry.source.number} ${entry.source.type}`.toLowerCase().includes(search.toLowerCase());
  });
  const totalDebits = filteredEntries.reduce((sum, entry) => sum + entry.totalDebitMinor, 0);
  const totalCredits = filteredEntries.reduce((sum, entry) => sum + entry.totalCreditMinor, 0);
  const exportCsv = () => exportMutation.mutate();

  return (
    <section className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-sm font-semibold">Automated Journal Entries Audit Feed</h2><p className="mt-1 text-[10px] text-muted-foreground">Source-linked, immutable postings with line-level debit and credit verification</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search journals" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Journal, source, description…" className="h-9 pl-9 text-xs sm:w-64" /></div><select aria-label="Filter by account" value={accountFilter} onChange={(event) => onAccountFilterChange(event.target.value)} className="h-9 rounded-md border bg-card px-3 text-xs"><option value="All">All accounts</option>{accounts.filter((account) => account.parentId).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><Button variant="outline" size="sm" onClick={exportCsv} disabled={filteredEntries.length === 0 || exportMutation.isPending}><Download />Export CSV</Button></div></div><div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-xs"><caption className="sr-only">Automated journal entries</caption><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Journal ID</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Timestamp</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Source Event</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Accounts</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Debit</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Credit</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Control</th></tr></thead><tbody>{filteredEntries.map((entry) => { const debit = entry.lines.reduce((sum, line) => sum + line.debitMinor, 0); const credit = entry.lines.reduce((sum, line) => sum + line.creditMinor, 0); const balanced = debit === credit && debit === entry.totalDebitMinor && credit === entry.totalCreditMinor; return <tr key={entry.id} className="border-b last:border-0 hover:bg-accent/30"><td className="px-4 py-3"><button type="button" onClick={() => setSelectedJournalId(entry.id)} className="font-mono font-semibold text-primary hover:underline">{entry.number}</button><p className="mt-1 max-w-[240px] truncate text-[10px] text-muted-foreground">{entry.description}</p></td><td className="px-3 py-3 text-[10px] text-muted-foreground">{new Date(entry.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td className="px-3 py-3"><Link href={entry.source.href} className="font-medium text-primary hover:underline">{entry.source.number}</Link><p className="mt-1 text-[10px] text-muted-foreground">{entry.source.type}</p></td><td className="px-3 py-3"><span className="numeric">{entry.lines.length}</span><span className="ml-1 text-muted-foreground">lines</span><p className="mt-1 max-w-[190px] truncate text-[10px] text-muted-foreground">{accounts.find((account) => account.id === entry.lines[0]?.accountId)?.name}</p></td><td className="numeric px-3 py-3 text-right font-medium text-foreground dark:text-foreground">{formatMoney(entry.totalDebitMinor)}</td><td className="numeric px-3 py-3 text-right font-medium text-blue-600 dark:text-blue-400">{formatMoney(entry.totalCreditMinor)}</td><td className="px-4 py-3 text-right">{balanced ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground dark:text-foreground"><CheckCircle2 className="size-3.5" />Balanced</span> : <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive"><AlertTriangle className="size-3.5" />Variance</span>}</td></tr>; })}</tbody></table>{filteredEntries.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No journal entries match this period and filter.</p> : null}</div><div className="flex flex-col gap-2 border-t bg-secondary/20 px-4 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{filteredEntries.length} entries · {filteredEntries.reduce((sum, entry) => sum + entry.lines.length, 0)} ledger lines</span><span className="numeric">Debits {formatMoney(totalDebits)} = Credits {formatMoney(totalCredits)}</span></div>
      <Dialog open={Boolean(selectedJournal)} onOpenChange={(open) => { if (!open) setSelectedJournalId(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedJournal?.number}</DialogTitle><DialogDescription>Source-linked automated journal entry</DialogDescription></DialogHeader>{selectedJournal ? <JournalEntryContent entry={selectedJournal} /> : null}</DialogContent></Dialog>
    </section>
  );
}
