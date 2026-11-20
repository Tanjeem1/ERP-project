"use client";

import { ArrowRight, Boxes, Building2, CheckCircle2, MoveHorizontal, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { MetricCard } from "@/components/erp/metric-card";
import { PageHeader } from "@/components/erp/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CostLayerInspector } from "@/features/inventory/cost-layer-inspector";
import { InventoryTable, type InventoryRow } from "@/features/inventory/inventory-table";
import { ProductForm } from "@/features/inventory/product-form";
import { WarehouseForm } from "@/features/inventory/warehouse-form";
import { ReservationSimulator } from "@/features/inventory/reservation-simulator";
import { StockTransferDialog } from "@/features/inventory/stock-transfer-dialog";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMoney, formatNumber } from "@/lib/utils";
import { selectInventoryValuation, useErpStore } from "@/store/useErpStore";
import type { Product, Warehouse as WarehouseModel } from "@/types/erp";

export function InventoryView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useErpStore();
  const { can } = usePermissions();
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferRow, setTransferRow] = useState<InventoryRow | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseModel | undefined>();
  const rows: InventoryRow[] = state.inventory.map((position) => {
    const product = state.products.find((item) => item.id === position.productId);
    const warehouse = state.warehouses.find((item) => item.id === position.warehouseId);
    const valueMinor = state.costLayers.filter((layer) => layer.productId === position.productId && layer.warehouseId === position.warehouseId).reduce((sum, layer) => sum + layer.remainingValueMinor, 0);
    return { id: position.id, productId: position.productId, warehouseId: position.warehouseId, sku: product?.sku ?? position.productId, productName: product?.name ?? "Unknown product", warehouse: warehouse?.name ?? position.warehouseId, onHand: position.onHand, reserved: position.reserved, atp: position.onHand - position.reserved, inTransit: position.inTransit, valueMinor, searchText: `${product?.sku} ${product?.name} ${product?.category} ${warehouse?.name} ${warehouse?.code}`.toLowerCase() };
  });
  const selectedRow = can("viewCostPrices") ? rows.find((row) => row.id === searchParams.get("position")) ?? rows.find((row) => row.productId === searchParams.get("sku") && row.warehouseId === "wh-central") ?? rows.find((row) => row.productId === searchParams.get("sku")) : null;
  const onInspect = useCallback((row: InventoryRow) => router.push(`/app/inventory?position=${row.id}`, { scroll: false }), [router]);
  const onTransfer = useCallback((row: InventoryRow) => { setTransferRow(row); setTransferOpen(true); }, []);
  const openNewTransfer = () => { setTransferRow(null); setTransferOpen(true); };
  const totalOnHand = rows.reduce((sum, row) => sum + row.onHand, 0);
  const totalReserved = rows.reduce((sum, row) => sum + row.reserved, 0);
  const totalInbound = rows.reduce((sum, row) => sum + row.inTransit, 0);

  if (!hydrated) return <div className="space-y-6"><Skeleton className="h-24" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[520px]" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Inventory positions and real-time FIFO costing" description="Inspect exact stock layers, protect Available to Promise across channels, and transfer inventory without losing batch age or residual value." actions={<>{can("manageInventory") ? <><Button variant="outline" onClick={() => setProductModalOpen(true)}><Plus />Create SKU</Button><Button variant="outline" onClick={() => setWarehouseModalOpen(true)}><Building2 />Create warehouse</Button></> : null}{can("createOrders") ? <Button asChild variant="outline"><Link href="/app/orders?create=1"><ShoppingCart />New sales order</Link></Button> : null}{can("manageInventory") ? <Button onClick={openNewTransfer}><MoveHorizontal />Stock transfer</Button> : null}</>} />
      <section aria-label="Inventory KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Total FIFO valuation", value: formatMoney(selectInventoryValuation(state)), detail: `${state.costLayers.filter((layer) => layer.remainingQuantity > 0).length} active layers` },
        { label: "On-hand units", value: totalOnHand.toLocaleString(), detail: `${rows.filter((row) => row.onHand > 0).length} stocked positions` },
        { label: "Reserved units", value: totalReserved.toLocaleString(), detail: `${formatNumber(totalOnHand === 0 ? 0 : (totalReserved / totalOnHand) * 100, 1)}% of physical stock` },
        { label: "Inbound units", value: totalInbound.toLocaleString(), detail: "Approved shipments in transit" },
      ].map((kpi) => <MetricCard key={kpi.label} {...kpi} />)}</section>
      <InventoryTable rows={rows} onInspect={onInspect} onTransfer={onTransfer} canTransfer={can("manageInventory")} />
      {can("manageInventory") ? <section className="grid gap-5 xl:grid-cols-2"><div className="overflow-hidden rounded-lg border bg-card"><div className="flex items-center justify-between border-b p-4"><div><h2 className="text-sm font-semibold">SKU master data</h2><p className="mt-1 text-[10px] text-muted-foreground">Barcode, VAT, dimensions, price, and reorder policies</p></div><Button size="sm" variant="outline" onClick={() => setProductModalOpen(true)}><Plus />Create SKU</Button></div><div className="divide-y">{state.products.map((product) => <div key={product.id} className="flex items-center gap-3 p-3"><Boxes className="size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs font-semibold text-primary">{product.sku}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{product.name}</p></div><span className="numeric text-xs">{formatMoney(product.salesPriceMinor, product.salesCurrency)}</span><Button size="sm" variant="ghost" aria-label={`Edit ${product.sku}`} onClick={() => { setEditingProduct(product); setProductModalOpen(true); }}>Edit</Button></div>)}</div></div><div className="overflow-hidden rounded-lg border bg-card"><div className="flex items-center justify-between border-b p-4"><div><h2 className="text-sm font-semibold">Warehouse master data</h2><p className="mt-1 text-[10px] text-muted-foreground">Locations, capacity, type, and operating status</p></div><Button size="sm" variant="outline" onClick={() => setWarehouseModalOpen(true)}><Building2 />Create warehouse</Button></div><div className="divide-y">{state.warehouses.map((warehouse) => <div key={warehouse.id} className="flex items-center gap-3 p-3"><Building2 className="size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs font-semibold text-primary">{warehouse.code}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{warehouse.name}</p></div><span className="numeric text-xs">{warehouse.capacityCbm.toLocaleString()} CBM</span><Button size="sm" variant="ghost" aria-label={`Edit warehouse ${warehouse.code}`} onClick={() => { setEditingWarehouse(warehouse); setWarehouseModalOpen(true); }}>Edit</Button></div>)}</div></div></section> : null}
      {can("manageInventory") ? <ReservationSimulator rows={rows.filter((row) => row.onHand > 0)} /> : null}
      <section className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Recent inter-warehouse transfers</h2><p className="mt-1 text-[10px] text-muted-foreground">Original FIFO ages and residual costs move with the stock</p></div>{can("manageInventory") ? <Button variant="outline" size="sm" onClick={openNewTransfer}><MoveHorizontal />New transfer</Button> : null}</div>{state.transfers.length === 0 ? <div className="p-8 text-center"><MoveHorizontal className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No transfers in this session</p><p className="mt-1 text-xs text-muted-foreground">Select a stock position or use the transfer action to move unreserved units.</p></div> : <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b bg-secondary/35 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th className="px-4 py-3 font-semibold uppercase tracking-wider">Transfer</th><th className="px-3 py-3 font-semibold uppercase tracking-wider">Route</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Lines</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">Units</th><th className="px-3 py-3 text-right font-semibold uppercase tracking-wider">FIFO value moved</th><th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Control</th></tr></thead><tbody>{state.transfers.slice(0, 5).map((transfer) => { const source = state.warehouses.find((item) => item.id === transfer.sourceWarehouseId); const destination = state.warehouses.find((item) => item.id === transfer.destinationWarehouseId); return <tr key={transfer.id} className="border-b last:border-0"><td className="px-4 py-3"><p className="font-mono font-medium text-primary">{transfer.number}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(transfer.createdAt).toLocaleString("en-US")}</p></td><td className="px-3 py-3"><div className="flex items-center gap-2"><span>{source?.code}</span><ArrowRight className="size-3 text-muted-foreground" /><span>{destination?.code}</span></div></td><td className="numeric px-3 py-3 text-right">{transfer.lines.length}</td><td className="numeric px-3 py-3 text-right">{transfer.lines.reduce((sum, line) => sum + line.quantity, 0)}</td><td className="numeric px-3 py-3 text-right font-medium">{formatMoney(transfer.lines.reduce((sum, line) => sum + line.valueMinor, 0))}</td><td className="px-4 py-3 text-right"><Badge variant="success"><CheckCircle2 />Value preserved</Badge></td></tr>; })}</tbody></table></div>}</section>
      <CostLayerInspector key={selectedRow?.id ?? "none"} row={selectedRow ?? null} open={Boolean(selectedRow)} onOpenChange={(open) => { if (!open) router.push("/app/inventory", { scroll: false }); }} />
      {can("manageInventory") ? <StockTransferDialog key={`${transferRow?.id ?? "new-transfer"}-${transferOpen}`} initialRow={transferRow} open={transferOpen} onOpenChange={setTransferOpen} /> : null}
      <ProductForm key={`${editingProduct?.id ?? "new-product"}-${productModalOpen}`} product={editingProduct} open={productModalOpen} onOpenChange={(open) => { setProductModalOpen(open); if (!open) setEditingProduct(undefined); }} />
      <WarehouseForm key={`${editingWarehouse?.id ?? "new-warehouse"}-${warehouseModalOpen}`} warehouse={editingWarehouse} open={warehouseModalOpen} onOpenChange={(open) => { setWarehouseModalOpen(open); if (!open) setEditingWarehouse(undefined); }} />
    </div>
  );
}
