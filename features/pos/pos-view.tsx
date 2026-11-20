"use client";

import { Barcode, Minus, Plus, ScanLine, ShoppingCart, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/erp/page-header";
import { StatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PosReceiptDialog } from "@/features/pos/pos-receipt-dialog";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { getCustomerOutstandingMinor } from "@/lib/balances";
import { getProductByBarcode } from "@/lib/erp-api";
import { cn, formatMoney } from "@/lib/utils";
import { useErpStore } from "@/store/useErpStore";

interface CartLine { productId: string; quantity: number; unitPriceMinor: number }

export function PosView() {
  const hydrated = useHydrated();
  const state = useErpStore();
  const { can } = usePermissions();
  const [warehouseId, setWarehouseId] = useState(state.warehouses[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? "");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankAmount, setBankAmount] = useState(0);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [result, setResult] = useState<{ invoiceId: string; paymentIds: string[] } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const completeRef = useRef<() => void>(() => undefined);
  const customer = state.customers.find((item) => item.id === customerId);
  const warehouse = state.warehouses.find((item) => item.id === warehouseId);
  const baseCurrency = state.organization.baseCurrency;
  const saleCurrency = customer?.currency ?? baseCurrency;
  const customerDebt = getCustomerOutstandingMinor(state, customerId);
  const filteredProducts = search.trim() ? state.products.filter((product) => product.active && `${product.sku} ${product.name} ${product.barcode ?? ""}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6) : [];
  const subtotalMinor = cart.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  const taxMinor = Math.round(subtotalMinor * (customer?.taxRateBasisPoints ?? 0) / 10000);
  const totalMinor = subtotalMinor + taxMinor;
  const totalBaseMinor = Math.round(totalMinor * exchangeRate);
  const paidMinor = Math.round(cashAmount * 100) + Math.round(bankAmount * 100);
  const remainingDueMinor = totalMinor - paidMinor;
  const overpaid = remainingDueMinor < 0;
  const canOperate = can("createOrders") && can("fulfillOrders");
  const exceedsCredit = customerDebt + totalBaseMinor > (customer?.creditLimitBaseMinor ?? 0);
  const stockUnavailable = cart.some((line) => {
    const stock = state.inventory.find((item) => item.productId === line.productId && item.warehouseId === warehouseId);
    return line.quantity > (stock?.onHand ?? 0) - (stock?.reserved ?? 0);
  });
  const canSubmit = Boolean(customer && warehouse && warehouse.status === "Active" && cart.length > 0 && totalMinor > 0 && exchangeRate > 0 && !overpaid && !stockUnavailable && cart.every((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.unitPriceMinor) && line.unitPriceMinor >= 0));

  const addProduct = (productId: string, unitPriceMinor?: number) => {
    const product = state.products.find((item) => item.id === productId && item.active);
    const price = product?.salesPriceMinor ?? unitPriceMinor;
    if (price === undefined) return;
    setError(null);
    setCart((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) return current.map((line) => line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { productId, quantity: 1, unitPriceMinor: price }];
    });
    setSearch("");
    searchRef.current?.focus();
  };
  const scanOrAdd = async () => {
    const query = search.trim();
    if (!query) return;
    const exact = state.products.find((product) => product.active && [product.sku, product.barcode ?? ""].some((value) => value.toLowerCase() === query.toLowerCase()));
    if (exact) {
      addProduct(exact.id);
      return;
    }
    try {
      const product = await getProductByBarcode(query);
      if (product.active === false) {
        setError("That SKU is inactive and cannot be sold.");
        return;
      }
      useErpStore.setState((current) => current.products.some((item) => item.id === product.id) ? current : { products: [...current.products, product] });
      addProduct(product.id, product.salesPriceMinor);
    } catch (caught) {
      if (filteredProducts[0]) addProduct(filteredProducts[0].id);
      else setError(caught instanceof Error ? caught.message : "No SKU matches that barcode.");
    }
  };
  const updateLine = (productId: string, update: Partial<CartLine>) => setCart((current) => current.map((line) => line.productId === productId ? { ...line, ...update } : line));
  const changeCustomer = (id: string) => {
    const nextCustomer = state.customers.find((item) => item.id === id);
    setCustomerId(id);
    setExchangeRate(nextCustomer?.currency === baseCurrency ? 1 : 0);
    setCart([]);
    setCashAmount(0);
    setBankAmount(0);
    setError(null);
  };
  const completeSale = async () => {
    if (!canOperate || processing) return;
    if (!canSubmit) {
      setError("Select a customer and active warehouse, enter valid quantities and prices, and resolve any stock, exchange-rate, or payment issues.");
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      const checkout = await state.checkoutPos({
        customerId,
        warehouseId,
        exchangeRate,
        reference: "",
        lines: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor })),
        payments: [
          { method: "CASH" as const, amountMinor: Math.round(cashAmount * 100) },
          { method: "BANK" as const, amountMinor: Math.round(bankAmount * 100) },
        ].filter((payment) => payment.amountMinor > 0),
      });
      setCart([]);
      setCashAmount(0);
      setBankAmount(0);
      if (checkout.order.status === "Pending Approval") {
        setPendingOrderId(checkout.order.id);
        toast.warning("Credit approval required", { description: "The sale is held before stock reservation. An Accountant or Super Admin must approve it." });
        return;
      }
      if (!checkout.invoice) throw new Error("The server did not return an invoice for this sale.");
      setResult({ invoiceId: checkout.invoice.id, paymentIds: checkout.payments.map((payment) => payment.id) });
      toast.success("POS sale completed", { description: "Stock, FIFO COGS, invoice, customer debt, and ledger entries were updated in one transaction." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The POS sale could not be completed.");
    } finally {
      setProcessing(false);
    }
  };
  useEffect(() => { completeRef.current = () => void completeSale(); });
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "F2") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "F9") { event.preventDefault(); completeRef.current(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  if (!hydrated) return <Skeleton className="h-[680px]" />;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Point of Sale terminal" description="Barcode-friendly billing with live credit, split payment, exact FIFO deduction, and instant double-entry accounting. Press F2 to search or F9 to complete a sale." actions={<Badge variant={canOperate ? "success" : "warning"}>{canOperate ? "READY TO SELL" : "ROLE RESTRICTED"}</Badge>} />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="space-y-5">
          <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pos-warehouse">Fulfillment warehouse</Label><select id="pos-warehouse" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setCart([]); setError(null); }} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option value="" disabled>Select a warehouse</option>{state.warehouses.map((item) => <option key={item.id} value={item.id} disabled={item.status !== "Active"}>{item.name}{item.status !== "Active" ? " · Inactive" : ""}</option>)}</select></div><div className="space-y-2"><Label htmlFor="pos-customer">Customer</Label><select id="pos-customer" value={customerId} onChange={(event) => changeCustomer(event.target.value)} className="h-10 w-full rounded-md border bg-card px-3 text-sm"><option value="" disabled>Select a customer</option>{state.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="pos-exchange-rate">Exchange rate: {saleCurrency} to {baseCurrency}</Label><Input id="pos-exchange-rate" type="number" min="0.0001" step="0.0001" value={exchangeRate} disabled={saleCurrency === baseCurrency} onChange={(event) => setExchangeRate(event.target.valueAsNumber)} className="numeric" /><p className="text-xs text-muted-foreground">The invoice and payments use {saleCurrency}. Customer credit and the ledger use {baseCurrency}.</p></div></CardContent></Card>
          <Card><CardHeader className="border-b"><div className="flex items-center justify-between"><div><CardTitle className="text-sm">Scan barcode or search SKU</CardTitle><CardDescription>Exact SKU/barcode match adds instantly; Enter adds the first result</CardDescription></div><ScanLine className="size-5 text-primary" /></div></CardHeader><CardContent><div className="relative"><Barcode className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-primary" /><Input ref={searchRef} autoFocus aria-label="Scan or search SKU" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void scanOrAdd(); } }} placeholder="SKU, barcode, or product name" className="h-12 pl-11 font-mono text-sm" /></div>{filteredProducts.length > 0 ? <div className="mt-2 divide-y rounded-lg border">{filteredProducts.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product.id)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent"><Plus className="size-4 text-primary" /><div className="flex-1"><p className="font-mono text-xs font-semibold text-primary">{product.sku}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{product.name}</p></div><span className="numeric text-xs">{formatMoney(product.salesPriceMinor, saleCurrency)}</span></button>)}</div> : null}</CardContent></Card>
          <Card><CardHeader className="border-b"><div className="flex items-center justify-between"><div><CardTitle className="text-sm">Billing lines</CardTitle><CardDescription>{cart.length} SKUs · editable quantity and unit price in {saleCurrency}</CardDescription></div>{cart.length > 0 ? <Button variant="ghost" size="sm" onClick={() => setCart([])}><Trash2 />Clear</Button> : null}</div></CardHeader><CardContent className="p-0"><div className="divide-y">{cart.map((line) => {
            const product = state.products.find((item) => item.id === line.productId);
            const position = state.inventory.find((item) => item.productId === line.productId && item.warehouseId === warehouseId);
            const atp = (position?.onHand ?? 0) - (position?.reserved ?? 0);
            return <div key={line.productId} className="grid gap-3 p-4 sm:grid-cols-[1fr_100px_120px_110px_32px] sm:items-center"><div><p className="font-mono text-xs font-semibold text-primary">{product?.sku}</p><p className="mt-1 text-[10px] text-muted-foreground">{product?.name} · {atp} ATP</p></div><div className="flex items-center gap-1"><Button size="icon" variant="outline" className="size-7" aria-label={`Decrease ${product?.sku} quantity`} onClick={() => updateLine(line.productId, { quantity: Math.max(1, line.quantity - 1) })}><Minus /></Button><Input aria-label={`${product?.sku} quantity`} type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(line.productId, { quantity: event.target.valueAsNumber })} className="numeric h-8 text-center" /><Button size="icon" variant="outline" className="size-7" aria-label={`Increase ${product?.sku} quantity`} onClick={() => updateLine(line.productId, { quantity: line.quantity + 1 })}><Plus /></Button></div><Input aria-label={`${product?.sku} unit price in ${saleCurrency}`} type="number" min="0" step="0.01" value={line.unitPriceMinor / 100} onChange={(event) => updateLine(line.productId, { unitPriceMinor: Math.round(event.target.valueAsNumber * 100) })} className="numeric h-8 text-right" /><p className="numeric text-right text-sm font-semibold">{formatMoney(line.quantity * line.unitPriceMinor, saleCurrency)}</p><Button size="icon" variant="ghost" className="size-7 text-muted-foreground" aria-label={`Remove ${product?.sku}`} onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}><Trash2 /></Button></div>;
          })}{cart.length === 0 ? <div className="p-12 text-center"><ShoppingCart className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No billing lines yet</p><p className="mt-1 text-xs text-muted-foreground">Select a customer and warehouse, then scan a barcode or search for a SKU.</p></div> : null}</div></CardContent></Card>
        </section>
        <aside className="space-y-5">
          <Card><CardHeader className="border-b"><CardTitle className="text-sm">Customer credit</CardTitle><CardDescription>Live debt, limit, and exposure in {baseCurrency}</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">{customer?.name ?? "No customer selected"}</p><p className="mt-1 text-[10px] text-muted-foreground">{customer ? `${customer.paymentTermsDays}-day terms · ${customer.currency}` : "Create a customer before using POS."}</p></div><Badge variant={remainingDueMinor > 0 ? "warning" : "success"}>{remainingDueMinor > 0 ? "PARTIAL DUE" : "PAID"}</Badge></div><dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">Current debt</dt><dd className="numeric">{formatMoney(customerDebt)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Credit limit</dt><dd className="numeric">{formatMoney(customer?.creditLimitBaseMinor ?? 0)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Sale total in base currency</dt><dd className="numeric font-semibold">{formatMoney(totalBaseMinor)}</dd></div><div className="flex justify-between border-t pt-2"><dt className="text-muted-foreground">Exposure after sale</dt><dd className={cn("numeric font-semibold", exceedsCredit ? "text-amber-600" : "text-foreground")}>{formatMoney(customerDebt + totalBaseMinor)}</dd></div></dl>{exceedsCredit ? <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[10px] leading-5 text-amber-700 dark:text-amber-400">Credit limit will be exceeded. The sale enters Pending Approval before any stock is reserved.</p> : null}</CardContent></Card>
          <Card><CardHeader className="border-b"><CardTitle className="text-sm">Split payment</CardTitle><CardDescription>Cash, bank transfer, and remainder added to customer due</CardDescription></CardHeader><CardContent><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="pos-cash">Cash received · {saleCurrency}</Label><Input id="pos-cash" type="number" min="0" step="0.01" value={cashAmount} onChange={(event) => setCashAmount(event.target.valueAsNumber)} className="numeric" /></div><div className="space-y-2"><Label htmlFor="pos-bank">Bank transfer · {saleCurrency}</Label><Input id="pos-bank" type="number" min="0" step="0.01" value={bankAmount} onChange={(event) => setBankAmount(event.target.valueAsNumber)} className="numeric" /></div></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setCashAmount(totalMinor / 100); setBankAmount(0); }}>Full cash</Button><Button size="sm" variant="outline" onClick={() => { const half = totalMinor / 200; setCashAmount(half); setBankAmount(half); }}>50 / 50 split</Button><Button size="sm" variant="outline" onClick={() => { setCashAmount(0); setBankAmount(0); }}>Full credit</Button></div><dl className="mt-5 space-y-2 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="numeric">{formatMoney(subtotalMinor, saleCurrency)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">VAT / sales tax</dt><dd className="numeric">{formatMoney(taxMinor, saleCurrency)}</dd></div><div className="flex justify-between border-t pt-3 text-base font-semibold"><dt>Total</dt><dd className="numeric">{formatMoney(totalMinor, saleCurrency)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Cash + bank</dt><dd className="numeric">{formatMoney(paidMinor, saleCurrency)}</dd></div><div className={cn("flex justify-between border-t pt-3 font-semibold", remainingDueMinor > 0 ? "text-amber-600" : "text-foreground")}><dt>Added to customer due</dt><dd className="numeric">{formatMoney(Math.max(0, remainingDueMinor), saleCurrency)}</dd></div></dl>{overpaid ? <p role="alert" className="mt-3 text-xs text-destructive">Payments exceed the invoice total.</p> : null}{stockUnavailable ? <p role="alert" className="mt-3 text-xs text-destructive">One or more quantities exceed available stock at this warehouse.</p> : null}{error ? <p role="alert" className="mt-3 text-xs leading-5 text-destructive">{error}</p> : null}<Button className="mt-5 w-full" size="lg" disabled={!canSubmit || !canOperate || processing} onClick={() => void completeSale()}><Zap />{processing ? "Posting sale…" : "Complete sale & post accounting"}</Button><p className="mt-2 text-center text-[9px] text-muted-foreground">F9 to complete · receipt opens automatically</p></CardContent></Card>
        </aside>
      </div>
      {pendingOrderId ? <Card className="border-amber-500/25"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><StatusBadge status="Pending Approval" /><p className="flex-1 text-sm">The sale was created but cannot ship or reserve stock until credit approval. The billing lines were cleared to prevent a duplicate sale.</p><Button asChild variant="outline"><Link href={`/app/orders?order=${pendingOrderId}`}>View sales order</Link></Button>{can("approveTransactions") ? <Button asChild variant="outline"><Link href="/app/settings">Open approval queue</Link></Button> : null}<Button variant="ghost" onClick={() => setPendingOrderId(null)}>Dismiss</Button></CardContent></Card> : null}
      <PosReceiptDialog invoiceId={result?.invoiceId ?? null} paymentIds={result?.paymentIds ?? []} open={Boolean(result)} onOpenChange={(open) => { if (!open) setResult(null); }} />
    </div>
  );
}
