import { ImageResponse } from "next/og";

function text(value: string | null, fallback: string, maximumLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, maximumLength);
}

function capabilities(path: string) {
  if (path === "/platform") return ["Inventory and warehouse management", "Procurement and order fulfillment", "Automated financial reporting"];
  if (path === "/pricing") return ["Starter for focused operations", "Growth for multi-warehouse teams", "Enterprise controls and onboarding"];
  if (path === "/tools/landed-cost-calculator") return ["Weight, volume, and value allocation", "FIFO COGS and gross margin", "Local calculations and CSV export"];
  if (path === "/solutions/wholesale-distribution") return ["B2B orders and customer credit", "FIFO margins by warehouse", "Landed cost allocation"];
  if (path === "/solutions/fmcg") return ["Batch and expiry tracking", "Warehouse aging and capacity", "Oldest-layer FIFO costing"];
  if (path === "/solutions/retail-ecommerce") return ["Real-time ATP reservations", "Omnichannel order management", "FIFO COGS and tax invoicing"];
  if (path === "/solutions/import-export") return ["Multi-currency purchase orders", "Freight and customs allocation", "Bonded stock and accrual accounting"];
  if (path === "/app/dashboard") return ["FIFO valuation and stock availability", "Warehouse capacity and aging", "Real-time automated ledger feed"];
  if (path === "/app/procurement") return ["Purchase order lifecycle", "Landed cost allocation", "Goods receipts and accruals"];
  if (path === "/app/inventory") return ["Warehouse stock positions", "FIFO cost-layer inspection", "ATP reservations and transfers"];
  if (path === "/app/orders") return ["Order capture and stock locking", "Fulfillment and tax invoices", "Automated COGS and revenue"];
  if (path === "/app/finance") return ["Trial Balance", "Profit and Loss statement", "Balance Sheet and source journals"];
  if (path === "/app/expenses") return ["Cash, bank, and mobile payments", "Expense account posting", "Operating payment history"];
  if (path.startsWith("/app/customers/")) return ["Itemized purchase history", "Payment receipts and allocations", "Customer debt and available credit"];
  if (path === "/app/customers") return ["Customer credit limits", "AR aging and daily collections", "Payment receipts and ledger entries"];
  if (path === "/app/vendors") return ["Supplier purchase commitments", "Accounts payable balances", "Vendor payments and journals"];
  if (path === "/app/returns") return ["Returns and customer credit notes", "Restockable and damaged goods", "Stock audits and shrinkage"];
  if (path === "/app/pos") return ["Fast SKU and barcode search", "Split payment and customer due", "FIFO deduction and receipts"];
  if (path === "/app/settings") return ["Role-based permissions", "Transaction approval controls", "Immutable audit history"];
  if (path === "/login") return ["Workspace access", "Local demo session", "Passwords are not persisted"];
  if (path === "/register") return ["Company and organization setup", "Base currency configuration", "Fiscal timezone and invoice settings"];
  return ["Multi-warehouse inventory", "FIFO and landed costing", "Automated double-entry accounting"];
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = text(params.get("title"), "Multi-warehouse inventory and automated accounting", 105);
  const description = text(params.get("description"), "Inventory, FIFO costing, landed cost allocation, and double-entry accounting in one ERP workspace.", 210);
  const path = text(params.get("path"), "/", 140);
  const section = text(params.get("section"), "Supply chain and finance ERP", 64);
  const features = capabilities(path);

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#07111f", color: "white", fontFamily: "Arial, sans-serif", padding: "48px 60px", border: "1px solid #1e293b" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, background: "#34d399", color: "#07111f", fontSize: 25, fontWeight: 600 }}>N</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 27, fontWeight: 600, letterSpacing: -1 }}>NexusLedger <span style={{ color: "#94a3b8", fontSize: 17 }}>ERP</span></div>
      </div>
      <div style={{ display: "flex", gap: 44, marginTop: 48, flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
          <div style={{ display: "flex", fontSize: title.length > 66 ? 44 : 52, lineHeight: 1.13, fontWeight: 600, letterSpacing: -1.8 }}>{title}</div>
          <div style={{ display: "flex", marginTop: 24, color: "#b2bfce", fontSize: 21, lineHeight: 1.45 }}>{description}</div>
          <div style={{ display: "flex", marginTop: "auto", paddingTop: 30, color: "#94a3b8", fontSize: 17 }}>{section}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 306, border: "1px solid #334155", borderRadius: 8, background: "#0b1624", padding: "24px" }}>
          <div style={{ display: "flex", color: "#f1f5f9", fontSize: 19, fontWeight: 600 }}>Operational coverage</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
            {features.map((feature, index) => <div key={feature} style={{ display: "flex", padding: "15px 0", borderTop: index === 0 ? "none" : "1px solid #253347", color: "#cbd5e1", fontSize: 17, lineHeight: 1.35 }}>{feature}</div>)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 18, color: "#94a3b8", fontSize: 13 }}><div style={{ width: 7, height: 7, borderRadius: 7, background: "#34d399" }} />Interactive ERP demo</div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
