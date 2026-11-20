/* eslint-disable react-hooks/incompatible-library */
"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type ColumnFiltersState, type RowSelectionState, type SortingState, type VisibilityState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";

export interface InventoryRow {
  id: string;
  productId: string;
  warehouseId: string;
  sku: string;
  productName: string;
  warehouse: string;
  onHand: number;
  reserved: number;
  atp: number;
  inTransit: number;
  valueMinor: number;
  searchText: string;
}

export function InventoryTable({ rows, onInspect, onTransfer, canTransfer = true, canViewCosts = true }: { rows: InventoryRow[]; onInspect: (row: InventoryRow) => void; onTransfer: (row: InventoryRow) => void; canTransfer?: boolean; canViewCosts?: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "valueMinor", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [warehouse, setWarehouse] = useState("All");
  const warehouses = useMemo(() => ["All", ...new Set(rows.map((row) => row.warehouse))], [rows]);
  const filteredRows = useMemo(() => warehouse === "All" ? rows : rows.filter((row) => row.warehouse === warehouse), [rows, warehouse]);
  const columns = useMemo<ColumnDef<InventoryRow>[]>(() => [
    { id: "select", enableSorting: false, enableHiding: false, header: ({ table }) => <input type="checkbox" aria-label="Select all visible rows" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} className="size-3.5 accent-[hsl(var(--primary))]" />, cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.sku} at ${row.original.warehouse}`} checked={row.getIsSelected()} disabled={!row.getCanSelect()} onChange={row.getToggleSelectedHandler()} className="size-3.5 accent-[hsl(var(--primary))]" /> },
    { accessorKey: "sku", header: "SKU / Product", cell: ({ row }) => <div><button type="button" onClick={() => onInspect(row.original)} className="font-mono text-xs font-semibold text-primary hover:underline">{row.original.sku}</button><p className="mt-1 max-w-[240px] truncate text-[10px] text-muted-foreground">{row.original.productName}</p></div> },
    { accessorKey: "warehouse", header: "Warehouse", cell: ({ row }) => <span className="text-xs">{row.original.warehouse}</span> },
    { accessorKey: "onHand", header: "On Hand", cell: ({ row }) => <span className="numeric">{row.original.onHand.toLocaleString()}</span> },
    { accessorKey: "reserved", header: "Reserved (Locked)", cell: ({ row }) => <span className="numeric text-amber-600 dark:text-amber-400">{row.original.reserved.toLocaleString()}</span> },
    { accessorKey: "atp", header: "Available to Promise", cell: ({ row }) => <span className="numeric font-medium">{row.original.atp.toLocaleString()}</span> },
    { accessorKey: "inTransit", header: "In Transit", cell: ({ row }) => <span className="numeric text-muted-foreground">{row.original.inTransit.toLocaleString()}</span> },
    { accessorKey: "valueMinor", header: "Current FIFO Value", cell: ({ row }) => <span className="numeric font-medium">{formatMoney(row.original.valueMinor)}</span> },
  ], [onInspect]);
  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, globalFilter, columnFilters, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: (row, _columnId, filterValue: string) => row.original.searchText.toLowerCase().includes(filterValue.toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
    initialState: { pagination: { pageSize: 8, pageIndex: 0 } },
  });
  const selectedRows = table.getSelectedRowModel().rows;

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="inventory-table-heading"><div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between"><div><h2 id="inventory-table-heading" className="text-sm font-semibold">Real-time stock positions</h2><p className="mt-1 text-[10px] text-muted-foreground">Dense warehouse-level inventory with exact residual FIFO valuation</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Search SKU, product, warehouse…" aria-label="Search inventory" className="h-9 pl-9 text-xs sm:w-64" /></div><select aria-label="Filter by warehouse" value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="h-9 rounded-md border bg-card px-3 text-xs">{warehouses.map((item) => <option key={item}>{item}</option>)}</select><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 />Columns</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Visible columns</DropdownMenuLabel>{table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(checked) => column.toggleVisibility(checked)} onSelect={(event) => event.preventDefault()}>{typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div></div>{selectedRows.length > 0 ? <div className="flex flex-col gap-3 border-b bg-primary/[0.045] px-4 py-3 text-xs sm:flex-row sm:items-center"><span><span className="numeric font-semibold">{selectedRows.length}</span> position{selectedRows.length === 1 ? "" : "s"} selected · {formatMoney(selectedRows.reduce((sum, row) => sum + row.original.valueMinor, 0))} FIFO value</span>{canTransfer && selectedRows.length === 1 && selectedRows[0] ? <Button size="sm" variant="outline" className="sm:ml-auto" onClick={() => onTransfer(selectedRows[0]!.original)}><SlidersHorizontal />Transfer selected stock</Button> : <span className="text-[10px] text-muted-foreground sm:ml-auto">Select one position to transfer</span>}</div> : null}<div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1120px] text-left"><caption className="sr-only">Multi-warehouse inventory positions</caption><thead className="border-b bg-secondary/35 font-semibold uppercase tracking-wider">{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => { const canSort = header.column.getCanSort(); const sorted = header.column.getIsSorted(); return <th key={header.id} className="px-3 py-3 first:pl-4 last:pr-4 font-semibold uppercase tracking-wider">{header.isPlaceholder ? null : <button type="button" disabled={!canSort} onClick={header.column.getToggleSortingHandler()} className="flex items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 disabled:cursor-default">{flexRender(header.column.columnDef.header, header.getContext())}{canSort ? sorted === "asc" ? <ArrowUp className="size-3 font-semibold uppercase tracking-wider" /> : sorted === "desc" ? <ArrowDown className="size-3 font-semibold uppercase tracking-wider" /> : <ArrowUpDown className="size-3 opacity-40 font-semibold uppercase tracking-wider" /> : null}</button>}</th>; })}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id} data-state={row.getIsSelected() ? "selected" : undefined} className="border-b transition last:border-0 hover:bg-accent/30 data-[state=selected]:bg-primary/[0.045]">{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-3 py-3.5 text-xs first:pl-4 last:pr-4">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table>{table.getRowModel().rows.length === 0 ? <div className="p-12 text-center"><Search className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No stock positions match these filters</p><Button variant="outline" size="sm" className="mt-4" onClick={() => { setGlobalFilter(""); setWarehouse("All"); }}>Clear filters</Button></div> : null}</div><div className="flex flex-col gap-3 border-t bg-secondary/20 px-4 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{table.getFilteredRowModel().rows.length} positions · {formatMoney(table.getFilteredRowModel().rows.reduce((sum, row) => sum + row.original.valueMinor, 0))} total layer value</span><div className="flex items-center gap-2"><select aria-label="Rows per page" value={table.getState().pagination.pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))} className="h-8 rounded-md border bg-card px-2 text-[10px]"><option value={8}>8 / page</option><option value={16}>16 / page</option><option value={32}>32 / page</option></select><Button variant="outline" size="icon" className="size-8" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button><span className="numeric">Page {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}</span><Button variant="outline" size="icon" className="size-8" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button></div></div></section>
  );
}
