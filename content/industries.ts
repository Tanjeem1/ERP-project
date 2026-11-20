export interface IndustrySolution {
  slug: string;
  shortName: string;
  eyebrow: string;
  metadataTitle: string;
  headline: string;
  intro: string;
  description: string;
  primaryKeyword: string;
  signal: string;
  stats: Array<{ value: string; label: string }>;
  challenges: Array<{ title: string; description: string }>;
  modules: Array<{ title: string; description: string; bullets: string[] }>;
  workflow: Array<{ step: string; title: string; description: string }>;
  outcomes: string[];
  faqs: Array<{ question: string; answer: string }>;
}

export const industries: IndustrySolution[] = [
  {
    slug: "wholesale-distribution",
    shortName: "Wholesale",
    eyebrow: "Wholesale distribution ERP",
    metadataTitle: "Wholesale Distribution ERP with Multi-Warehouse FIFO Costing",
    headline: "Wholesale distribution ERP for accurate stock, FIFO margins, and customer credit.",
    intro: "Manage bulk purchasing, customer pricing, warehouse reservations, and FIFO cost of goods sold in one wholesale distribution ERP.",
    description: "Wholesale distribution ERP for multi-warehouse stock, B2B reservations, landed cost allocation, FIFO margins, and automated double-entry accounting.",
    primaryKeyword: "wholesale distribution ERP",
    signal: "Built for case-level precision",
    stats: [{ value: "FIFO", label: "warehouse-scoped cost layers" }, { value: "3-way", label: "weight, volume, value allocation" }, { value: "100%", label: "traceable FIFO cost layers" }],
    challenges: [
      { title: "Margin leakage at receipt", description: "Freight and duty often sit in spreadsheets while sales teams quote from incomplete unit costs. NexusLedger capitalizes import charges into each received SKU before the stock becomes available." },
      { title: "Oversold B2B commitments", description: "Sales orders and digital channels compete for the same units. Atomic reservations reduce Available to Promise at order placement, not after the warehouse prints a pick list." },
      { title: "Manual shipment reconciliation", description: "Every shipment relieves the oldest applicable cost layers and creates balanced COGS, inventory, receivable, revenue, and tax postings without rekeying the transaction." },
    ],
    modules: [
      { title: "Bulk procurement control", description: "Move purchase orders from draft through approval, transit, and receipt with complete quantity and cost visibility.", bullets: ["Supplier-specific currencies and FX rates", "Partial receipts with outstanding quantities", "Freight, duty, handling, and insurance allocation"] },
      { title: "Wholesale order orchestration", description: "Reserve inventory by warehouse and customer commitment while preserving an accurate ATP position for every other channel.", bullets: ["B2B wholesale channel tagging", "Pick, pack, ship, and invoice workflow", "Customer payment terms and tax rates"] },
      { title: "Customer-margin intelligence", description: "Compare actual FIFO COGS with recognized revenue instead of relying on a stale standard cost.", bullets: ["Layer-level shipment costs", "Realized gross-margin reporting", "Clickable source documents for every journal"] },
    ],
    workflow: [
      { step: "01", title: "Approve the buy", description: "Capture supplier currency, quantities, expected arrival, and base-cost conversion." },
      { step: "02", title: "Capitalize true cost", description: "Allocate import charges across received lines and create new FIFO layers." },
      { step: "03", title: "Lock customer demand", description: "Reserve B2B order quantities without blocking unrelated available stock." },
      { step: "04", title: "Ship and close", description: "Generate the invoice and balanced accounting from the same shipment event." },
    ],
    outcomes: ["Quote from true landed margins", "Protect confirmed B2B demand from overselling", "Trace every COGS value back to its receipt layer", "Reduce month-end inventory reconciliation work"],
    faqs: [
      { question: "Does the wholesale ERP support customer-specific order values?", answer: "Yes. Each sales order stores its own line-level unit prices, customer payment terms, tax rate, currency, and FX conversion. Shipment accounting uses those actual order values." },
      { question: "How does FIFO costing work across multiple warehouses?", answer: "Cost layers are scoped to both SKU and warehouse. A shipment consumes the oldest remaining layer in its fulfillment warehouse only; transferring stock preserves its original receipt age and cost." },
      { question: "Can I receive part of a wholesale purchase order?", answer: "Yes. Receipt quantities are validated against outstanding PO quantities. Partial receipts create inventory and accounting for received units while the remaining inbound quantity stays visible." },
      { question: "Are wholesale invoices created automatically?", answer: "The demo generates a tax invoice when an order ships, together with COGS and inventory entries plus accounts receivable, sales revenue, and tax entries." },
    ],
  },
  {
    slug: "fmcg",
    shortName: "FMCG",
    eyebrow: "FMCG inventory and finance ERP",
    metadataTitle: "FMCG ERP Software for Batch, Expiry and FIFO Inventory Control",
    headline: "FMCG ERP software for batch, expiry, and multi-warehouse FIFO control.",
    intro: "Track high-velocity stock from inbound batch to shipment with warehouse-level FIFO costing, expiry visibility, and automated accounting.",
    description: "FMCG ERP software for multi-warehouse inventory, batch and expiry tracking, FIFO costing, landed costs, and automated accounting.",
    primaryKeyword: "FMCG ERP software",
    signal: "Designed for high-velocity inventory",
    stats: [{ value: "Batch", label: "and expiry-aware cost layers" }, { value: "Live", label: "aging and capacity signals" }, { value: "FIFO", label: "systematic oldest-layer relief" }],
    challenges: [
      { title: "Aging stock hides in aggregate balances", description: "A single on-hand number is not enough for dated products. NexusLedger retains batch, receipt date, expiry date, remaining quantity, and residual value on every cost layer." },
      { title: "High transaction volume multiplies manual work", description: "Repeated receipts and shipments become automated operational events, creating consistent journal entries and eliminating duplicate finance data entry." },
      { title: "Warehouse replenishment lacks financial context", description: "Transfers preserve FIFO age and value, while warehouse-level on-hand, reserved, inbound, and capacity views support more informed replenishment decisions." },
    ],
    modules: [
      { title: "Batch and expiry traceability", description: "Inspect the precise composition of stock rather than treating every unit as financially identical.", bullets: ["Batch codes on every received layer", "Optional expiry dates for dated products", "Remaining quantity and residual value"] },
      { title: "Aging and capacity command", description: "Prioritize warehouse action with a shared view of physical placement and capital allocation.", bullets: ["Warehouse capacity visualization", "Aging inventory analytics", "Reorder thresholds by stock position"] },
      { title: "High-frequency order flow", description: "Connect wholesale and digital demand to the same reservation and shipment logic.", bullets: ["Immediate ATP reduction", "Shopify Sync channel identification", "Automated tax invoice and revenue recognition"] },
    ],
    workflow: [
      { step: "01", title: "Receive the batch", description: "Record actual quantity, source cost, allocated charges, and a new dated FIFO layer." },
      { step: "02", title: "Monitor aging", description: "See where working capital sits by warehouse, batch, and receipt age." },
      { step: "03", title: "Reserve demand", description: "Lock stock for each channel while preserving exact available-to-promise balances." },
      { step: "04", title: "Relieve oldest cost", description: "Ship against the oldest layers and post COGS with a complete audit trail." },
    ],
    outcomes: ["Surface dated inventory before it becomes write-off risk", "Standardize high-volume accounting events", "Preserve batch cost through warehouse transfers", "Reconcile operational volume with financial results daily"],
    faqs: [
      { question: "Can the FMCG ERP store expiry dates?", answer: "Yes. FIFO cost layers include optional expiry dates as well as batch codes and receipt timestamps. The domain model keeps this information attached to the exact remaining quantity." },
      { question: "Does NexusLedger enforce FEFO picking?", answer: "The current transaction engine enforces FIFO by receipt timestamp. Expiry data is available in the layer model; FEFO-directed picking can be added as a separate warehouse policy without changing the accounting architecture." },
      { question: "How are landed costs handled for FMCG imports?", answer: "Freight, customs duties, port handling, and insurance can be allocated by weight, volume, or value and capitalized into the received batch's true unit cost." },
      { question: "Can I see inventory aging by warehouse?", answer: "Yes. The command center derives aging from warehouse-scoped cost layers, allowing teams to distinguish older stock at one facility from newer receipts at another." },
    ],
  },
  {
    slug: "retail-ecommerce",
    shortName: "Retail + E-com",
    eyebrow: "Retail and e-commerce operations",
    metadataTitle: "Retail E-commerce ERP with Real-Time ATP and Omnichannel Orders",
    headline: "Retail e-commerce ERP with real-time ATP and omnichannel order control.",
    intro: "Prevent overselling across digital and wholesale channels, then generate invoices and balanced accounting from each shipment.",
    description: "Retail e-commerce ERP for multi-warehouse ATP, Shopify-style orders, FIFO COGS, tax invoicing, and real-time financial reporting.",
    primaryKeyword: "retail e-commerce ERP",
    signal: "One stock truth across every channel",
    stats: [{ value: "ATP", label: "updated at reservation time" }, { value: "3", label: "warehouse nodes in the live demo" }, { value: "2", label: "balanced entries per shipment" }],
    challenges: [
      { title: "The last unit has too many owners", description: "NexusLedger checks and increments reservations in one synchronous transaction. A competing channel cannot reserve stock already locked by another order." },
      { title: "Channel operations and accounting disagree", description: "The order, stock reservation, cost-layer consumption, tax invoice, and journal entries all reference the same source event and remain linked for audit." },
      { title: "Fulfillment choices obscure actual margin", description: "Because cost layers belong to a specific warehouse, shipping the same SKU from different nodes can produce different actual COGS and margin results." },
    ],
    modules: [
      { title: "Omnichannel order grid", description: "Manage B2B Wholesale, Shopify Sync, and Direct Import orders with consistent fulfillment states.", bullets: ["Channel-level filtering", "Order-to-invoice source links", "Warehouse-specific fulfillment"] },
      { title: "Real-time stock locking", description: "Demonstrate exactly how competing demand is serialized before either channel can oversell available units.", bullets: ["Atomic reservation checks", "Active, consumed, and released states", "Immediate ATP recalculation"] },
      { title: "Node-level profitability", description: "Use the actual layers consumed at the fulfillment warehouse instead of a company-wide average.", bullets: ["FIFO splitting across layers", "Automated COGS recognition", "Order and realized-margin analytics"] },
    ],
    workflow: [
      { step: "01", title: "Capture the order", description: "Tag its channel, customer, fulfillment warehouse, prices, and payment terms." },
      { step: "02", title: "Lock ATP", description: "Reserve all lines atomically before acknowledging the demand as fulfillable." },
      { step: "03", title: "Pick and ship", description: "Release the physical units and consume reservations against exact FIFO layers." },
      { step: "04", title: "Recognize results", description: "Issue the tax invoice and update revenue, receivables, tax, COGS, and inventory." },
    ],
    outcomes: ["Stop promising units already locked elsewhere", "Give every channel the same fulfillment truth", "Measure margin using fulfillment-node costs", "Eliminate delayed invoice and COGS reconciliation"],
    faqs: [
      { question: "Is the Shopify integration live in this frontend?", answer: "The demo models Shopify Sync orders and webhook-style reservations locally. It does not transmit data to Shopify. A production connector can map real webhook payloads to the same typed reservation and order actions." },
      { question: "How does the system prevent overselling?", answer: "Each reservation checks on-hand minus existing reservations and updates the lock in the same synchronous store transaction. Failed requests make no state changes." },
      { question: "Can different warehouses have different FIFO costs for one SKU?", answer: "Yes. Every cost layer is tied to both a product and a warehouse, so actual COGS reflects the layers consumed at the selected fulfillment node." },
      { question: "Does shipping create a customer invoice?", answer: "Yes. Shipping creates a previewable tax invoice with customer terms and posts the related receivable, revenue, tax, COGS, and inventory accounting." },
    ],
  },
  {
    slug: "import-export",
    shortName: "Import + Export",
    eyebrow: "Import and export finance",
    metadataTitle: "Landed Cost Allocation ERP for Import and Export Businesses",
    headline: "Landed cost allocation ERP for multi-currency import and export operations.",
    intro: "Connect supplier currencies, freight and customs charges, bonded warehouse receipts, and accrual accounting in one import workflow.",
    description: "Landed cost allocation ERP for multi-currency purchasing, freight and customs allocation, bonded stock, FIFO, and automated accruals.",
    primaryKeyword: "landed cost allocation ERP",
    signal: "From foreign-currency PO to true unit economics",
    stats: [{ value: "6", label: "supported operating currencies" }, { value: "4", label: "capitalizable import charge types" }, { value: "3", label: "precise allocation methods" }],
    challenges: [
      { title: "Supplier cost is not landed cost", description: "Foreign-currency line values are converted into the base currency, then freight, customs, handling, and insurance are distributed across receipt lines with deterministic rounding." },
      { title: "Import clearing becomes a suspense-account maze", description: "A goods receipt debits Inventory Asset while crediting supplier accruals and Freight & Duty Clearing for their exact respective values, with a link back to the source GRN." },
      { title: "In-transit stock lacks operational context", description: "Approved purchase orders can move into transit, exposing outstanding quantities by destination warehouse before the receipt creates on-hand inventory." },
    ],
    modules: [
      { title: "Multi-currency purchasing", description: "Preserve source currency, source unit cost, and the transaction FX rate alongside base-currency accounting values.", bullets: ["USD, EUR, GBP, CNY, AED, and INR models", "Line-level source cost retention", "Base-currency journal consistency"] },
      { title: "Landed cost workbench", description: "Compare allocation methods and preview every line before committing the receipt.", bullets: ["Weight in kilograms", "Volume in cubic meters", "Base value with exact remainder distribution"] },
      { title: "Bonded warehouse visibility", description: "Distinguish inbound, bonded, central, and fulfillment positions without losing consolidated valuation.", bullets: ["Warehouse-specific stock positions", "Batch and source-document traceability", "Inter-warehouse transfer costing"] },
    ],
    workflow: [
      { step: "01", title: "Set supplier terms", description: "Capture PO currency, exchange rate, expected arrival, and destination." },
      { step: "02", title: "Track the shipment", description: "Move approved quantities into transit by SKU and receiving warehouse." },
      { step: "03", title: "Allocate import charges", description: "Preview base goods value and each charge allocation before posting." },
      { step: "04", title: "Capitalize and accrue", description: "Create FIFO layers, Inventory Asset, supplier accrual, and clearing entries together." },
    ],
    outcomes: ["Defend selling prices with true landed unit costs", "Make foreign-currency commitments visible in base currency", "Reconcile import clearing to exact source receipts", "Maintain valuation through downstream warehouse movements"],
    faqs: [
      { question: "Which landed costs can be allocated?", answer: "The workbench supports freight, customs duties, port handling, and insurance. Each charge is converted to the base currency and allocated independently so rounding remains exact." },
      { question: "Can costs be allocated by weight or volume?", answer: "Yes. You can allocate by kilograms, cubic meters, or base-currency value. The live preview shows each line's basis share and true landed unit cost before posting." },
      { question: "How does the ERP handle foreign-currency purchase orders?", answer: "Each PO stores its source currency and FX rate to the organization's base currency. Goods value and import charges are converted explicitly, while the original source cost remains auditable." },
      { question: "What accounting does an import receipt generate?", answer: "The receipt debits Inventory Asset for goods plus capitalized charges, credits Accrued Accounts Payable for goods, and credits Freight & Duty Clearing for the allocated import charges." },
    ],
  },
];

export function getIndustry(slug: string) {
  return industries.find((industry) => industry.slug === slug);
}
