"use client";

import { Command } from "cmdk";
import { ArrowRight, Boxes, Calculator, FilePlus2, FileText, Landmark, LayoutDashboard, PackageCheck, Search, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { InvoiceContent, JournalEntryContent } from "@/components/erp/record-detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchErp } from "@/lib/erp-api";
import { formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SelectedRecord = { kind: "invoice" | "journal"; id: string } | null;

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const products = useErpStore((state) => state.products);
  const invoices = useErpStore((state) => state.invoices);
  const journalEntries = useErpStore((state) => state.journalEntries);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedRecord>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const search = useQuery({
    queryKey: ["erp-search", debouncedQuery],
    queryFn: () => searchErp(debouncedQuery),
    enabled: open && debouncedQuery.length >= 2,
    placeholderData: (previous) => previous,
  });
  const invoice = selected?.kind === "invoice" ? invoices.find((item) => item.id === selected.id) : undefined;
  const journal = selected?.kind === "journal" ? journalEntries.find((item) => item.id === selected.id) : undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const changeOpen = (value: boolean) => {
    if (!value) {
      setSelected(null);
      setQuery("");
    }
    onOpenChange(value);
  };
  const navigate = (href: string) => { changeOpen(false); router.push(href); };
  const openRecord = (kind: "invoice" | "journal", id: string, href: string) => {
    const exists = kind === "invoice" ? invoices.some((item) => item.id === id) : journalEntries.some((item) => item.id === id);
    if (exists) setSelected({ kind, id });
    else navigate(href);
  };
  const itemClass = "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground outline-none aria-selected:bg-accent";
  const results = search.data?.results ?? [];

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="top-[18%] max-w-2xl translate-y-0 overflow-hidden p-0" showClose={false}>
        <DialogTitle className="sr-only">Global ERP command palette</DialogTitle>
        <DialogDescription className="sr-only">Search SKUs, purchase orders, invoices, journal entries, and workspace actions.</DialogDescription>
        {selected && (invoice || journal) ? (
          <div>
            <div className="flex items-center gap-3 border-b p-4"><Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>Back to search</Button><div><p className="text-sm font-semibold">{invoice?.number ?? journal?.number}</p><p className="text-[10px] text-muted-foreground">{invoice ? "Tax invoice" : "Automated journal entry"}</p></div></div>
            {invoice ? <InvoiceContent invoice={invoice} /> : null}
            {journal ? <JournalEntryContent entry={journal} /> : null}
          </div>
        ) : (
          <Command label="Global ERP search" shouldFilter={false} loop>
            <div className="flex items-center border-b px-4"><Search className="size-4 shrink-0 text-muted-foreground" /><Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Search SKUs, POs, invoices, journals, or actions…" className="h-14 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground" /></div>
            <Command.List className="scrollbar-thin max-h-[420px] overflow-y-auto p-2">
              {debouncedQuery.length >= 2 ? <Command.Group heading={search.isFetching ? "Searching…" : "Records"} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                {results.map((result) => <Command.Item key={`${result.type}-${result.id}`} value={`${result.type}-${result.id}`} onSelect={() => result.type === "Invoice" || result.type === "Journal Entry" ? openRecord(result.type === "Invoice" ? "invoice" : "journal", result.id, result.href) : navigate(result.href)} className={itemClass}>
                  {result.type === "SKU" ? <Boxes className="size-4 text-muted-foreground" /> : result.type === "Purchase Order" ? <ShoppingCart className="size-4 text-muted-foreground" /> : result.type === "Invoice" ? <FileText className="size-4 text-muted-foreground" /> : <Landmark className="size-4 text-muted-foreground" />}
                  <div className="min-w-0"><p className="truncate">{result.title}</p><p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{result.subtitle}</p></div><span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{result.type}</span><ArrowRight className="size-3.5 text-muted-foreground" />
                </Command.Item>)}
                {!search.isFetching && results.length === 0 ? <Command.Empty className="py-10 text-center text-sm text-muted-foreground">No matching records. Try a SKU, PO number, invoice, or journal ID.</Command.Empty> : null}
              </Command.Group> : null}
              <Command.Group heading="Workspace actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                <Command.Item value="Executive Command Center" onSelect={() => navigate("/app/dashboard")} className={itemClass}><LayoutDashboard className="size-4 text-primary" /><span>Executive Command Center</span><ArrowRight className="ml-auto size-3.5 text-muted-foreground" /></Command.Item>
                <Command.Item value="Multi-warehouse inventory" onSelect={() => navigate("/app/inventory")} className={itemClass}><Boxes className="size-4 text-primary" /><span>Multi-warehouse inventory</span><ArrowRight className="ml-auto size-3.5 text-muted-foreground" /></Command.Item>
                <Command.Item value="Orders and invoicing" onSelect={() => navigate("/app/orders")} className={itemClass}><ShoppingCart className="size-4 text-primary" /><span>Orders + invoicing</span><ArrowRight className="ml-auto size-3.5 text-muted-foreground" /></Command.Item>
                <Command.Item value="Customers and collections" onSelect={() => navigate("/app/customers")} className={itemClass}><Landmark className="size-4 text-primary" /><span>Customers + collections</span><ArrowRight className="ml-auto size-3.5 text-muted-foreground" /></Command.Item>
                <Command.Item value="Finance and reports" onSelect={() => navigate("/app/finance")} className={itemClass}><Landmark className="size-4 text-primary" /><span>Finance + statements</span><ArrowRight className="ml-auto size-3.5 text-muted-foreground" /></Command.Item>
                <Command.Item value="Create new sales order" onSelect={() => navigate("/app/orders?create=1")} className={itemClass}><FilePlus2 className="size-4 text-primary" /><span>Create sales order</span><span className="ml-auto text-[10px] text-muted-foreground">ACTION</span></Command.Item>
                <Command.Item value="Create new purchase order" onSelect={() => navigate("/app/procurement?create=1")} className={itemClass}><PackageCheck className="size-4 text-primary" /><span>Create purchase order</span><span className="ml-auto text-[10px] text-muted-foreground">ACTION</span></Command.Item>
                <Command.Item value="Public landed cost calculator" onSelect={() => navigate("/tools/landed-cost-calculator")} className={itemClass}><Calculator className="size-4 text-primary" /><span>Public landed-cost calculator</span><ArrowRight className="ml-auto size-3.5 text-muted-foreground" /></Command.Item>
              </Command.Group>
              {!query ? <Command.Group heading="Invoices and journal entries" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                {invoices.slice(0, 4).map((item) => <Command.Item key={item.id} value={`${item.number}-${item.id}`} onSelect={() => openRecord("invoice", item.id, `/app/orders?invoice=${item.id}`)} className={itemClass}><FileText className="size-4 text-muted-foreground" /><div><p>{item.number}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{item.orderNumber} · {item.status}</p></div><span className="numeric ml-auto text-xs">{formatMoney(item.totalMinor, item.currency)}</span></Command.Item>)}
                {journalEntries.slice(0, 4).map((entry) => <Command.Item key={entry.id} value={`${entry.number}-${entry.id}`} onSelect={() => openRecord("journal", entry.id, `/app/finance?journal=${entry.id}`)} className={itemClass}><Landmark className="size-4 text-muted-foreground" /><div><p>{entry.number} · {entry.source.number}</p><p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{entry.description}</p></div><span className="numeric ml-auto text-xs">{formatMoney(entry.totalDebitMinor)}</span></Command.Item>)}
              </Command.Group> : null}
              {!query ? <Command.Group heading="SKUs" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                {products.slice(0, 8).map((product) => <Command.Item key={product.id} value={`${product.sku}-${product.id}`} onSelect={() => navigate(`/app/inventory?sku=${product.id}`)} className={itemClass}><Boxes className="size-4 text-muted-foreground" /><div><p>{product.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{product.sku} · {product.category}</p></div><span className="ml-auto text-[10px] text-muted-foreground">SKU</span></Command.Item>)}
              </Command.Group> : null}
            </Command.List>
            <div className="flex items-center justify-between border-t bg-secondary/30 px-4 py-2.5 text-[10px] text-muted-foreground"><span>↑↓ Navigate · ↵ Open · Esc Close</span><span className="flex items-center gap-1"><kbd className="rounded border bg-card px-1.5 py-0.5 font-mono">Ctrl</kbd><kbd className="rounded border bg-card px-1.5 py-0.5 font-mono">K</kbd></span></div>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  );
}
