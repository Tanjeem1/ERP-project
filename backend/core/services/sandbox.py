import secrets
import uuid
from datetime import timedelta
from decimal import Decimal

from django.db import connections, transaction
from django.utils import timezone

from core.models import DocumentKind, DocumentSequence, Notification
from core.services.actors import record_audit
from core.services.documents import sequence_name
from core.services.ledger import post_opening_balance
from core.services.organizations import provision_organization
from finance.services import record_expense
from inventory.models import SKU, StockBalance, Warehouse
from inventory.services import create_stock_adjustment, post_opening_stock
from orders.models import Customer
from orders.services import create_sales_order, create_sales_return, move_order_to_pick_pack, record_customer_payment, ship_order
from procurement.models import Vendor
from procurement.services import approve_purchase_order, create_purchase_order, mark_purchase_order_in_transit, post_goods_receipt, record_vendor_payment


def set_seed_sequence(organization, kind, next_value):
    name = sequence_name(organization, kind)
    with connections["default"].cursor() as cursor:
        cursor.execute("SELECT setval(%s::regclass, %s, false)", [name, next_value])
    DocumentSequence.objects.filter(organization=organization, kind=kind).update(next_value=next_value)


@transaction.atomic
def provision_sandbox():
    organization, actor = provision_organization(
        legal_name="NexusLedger Demonstration Company",
        display_name="NexusLedger Demo",
        tax_id="DEMO-TAX-001",
        base_currency="USD",
        timezone="Asia/Dhaka",
        invoice_footer_note="Demonstration data. No real payment is collected.",
        email=f"sandbox-{uuid.uuid4().hex}@demo.nexusledger.test",
        password=secrets.token_urlsafe(32),
        full_name="Demo Administrator",
        is_sandbox=True,
        expires_at=timezone.now() + timedelta(hours=24),
        address_line1="100 Harbor Avenue",
        city="Dhaka",
        region="Dhaka",
        postal_code="1200",
        country_code="BD",
    )
    now = timezone.now()
    warehouses = Warehouse.objects.bulk_create([
        Warehouse(organization=organization, code="MPB-01", name="Main Port Bonded Warehouse", type="BONDED", capacity_cbm=Decimal("12000"), address_line1="Port Access Road 14", city="Chattogram", region="Chattogram", postal_code="4100", country_code="BD"),
        Warehouse(organization=organization, code="CDH-02", name="Central Distribution Hub", type="DISTRIBUTION", capacity_cbm=Decimal("8500"), address_line1="42 Logistics Avenue", city="Dhaka", region="Dhaka", postal_code="1212", country_code="BD"),
        Warehouse(organization=organization, code="RFC-03", name="Retail Fulfillment Center", type="FULFILLMENT", capacity_cbm=Decimal("2400"), address_line1="8 Commerce Park", city="Dhaka", region="Dhaka", postal_code="1207", country_code="BD"),
    ])
    port, central, retail = warehouses
    vendors = Vendor.objects.bulk_create([
        Vendor(organization=organization, code="SUP-001", name="Ningbo Precision Electronics", contact_name="Li Wei", email="sales@ningbo-precision.example", currency="CNY", payment_terms_days=45, country_code="CN"),
        Vendor(organization=organization, code="SUP-002", name="Delta Packaging Industries", contact_name="Maya Rahman", email="orders@delta-packaging.example", currency="USD", payment_terms_days=30, country_code="BD"),
        Vendor(organization=organization, code="SUP-003", name="Atlantic Beverage Company", contact_name="Oliver Grant", email="trade@atlantic-beverage.example", currency="USD", payment_terms_days=30, country_code="US"),
    ])
    products = [
        ("SCN-X2-BT", "X2 Bluetooth Barcode Scanner", "Warehouse Hardware", "unit", "890120000001", Decimal("0.72"), Decimal("0.0024"), Decimal("10.00"), Decimal("25.00"), 25, vendors[0]),
        ("NET-SW-8P", "8-Port Managed Network Switch", "Warehouse Hardware", "unit", "890120000002", Decimal("1.90"), Decimal("0.0041"), Decimal("30.00"), Decimal("129.00"), 20, vendors[0]),
        ("CB-250-CAN", "Cold Brew Coffee 250ml", "Beverages", "can", "890120000003", Decimal("0.28"), Decimal("0.00031"), Decimal("1.45"), Decimal("3.50"), 250, vendors[2]),
        ("LBL-THM-4X6", "Thermal Shipping Label 4x6", "Packing Supplies", "roll", "890120000004", Decimal("0.32"), Decimal("0.0012"), Decimal("0.18"), Decimal("1.80"), 150, vendors[1]),
        ("SCN-HOL-X2", "X2 Scanner Charging Holster", "Warehouse Accessories", "unit", "890120000005", Decimal("0.15"), Decimal("0.0008"), Decimal("4.00"), Decimal("12.00"), 20, vendors[0]),
        ("CB-250-CASE", "Cold Brew Coffee 24 Can Case", "Beverages", "case", "890120000006", Decimal("6.72"), Decimal("0.00744"), Decimal("34.80"), Decimal("76.00"), 50, vendors[2]),
    ]
    skus = SKU.objects.bulk_create([
        SKU(
            organization=organization, sku=code, name=name, category=category, unit_of_measure=unit,
            description=f"{name} for demonstration inventory, procurement, and order workflows.", barcode=barcode,
            tax_rate=Decimal("0.00"), reorder_level=reorder, weight_kg=weight, volume_cbm=volume,
            cost_price=cost, selling_price=price, currency="USD", preferred_vendor=vendor,
        )
        for code, name, category, unit, barcode, weight, volume, cost, price, reorder, vendor in products
    ])
    customers = Customer.objects.bulk_create([
        Customer(organization=organization, code="CUS-001", name="Alder Wholesale Group", contact_name="Nadia Karim", email="accounts@alder-wholesale.example", currency="USD", payment_terms_days=30, tax_rate=Decimal("0.00"), credit_limit=Decimal("20000"), address_line1="88 Market Street", city="Dhaka", region="Dhaka", postal_code="1205", country_code="BD"),
        Customer(organization=organization, code="CUS-002", name="MetroMart Retail", contact_name="Daniel Chen", email="finance@metromart.example", currency="USD", payment_terms_days=14, tax_rate=Decimal("0.00"), credit_limit=Decimal("500"), address_line1="15 Retail Boulevard", city="Dhaka", region="Dhaka", postal_code="1216", country_code="BD"),
        Customer(organization=organization, code="CUS-003", name="Northstar Hospitality", contact_name="Amina Yusuf", email="purchasing@northstar.example", currency="USD", payment_terms_days=30, tax_rate=Decimal("0.00"), credit_limit=Decimal("15000"), address_line1="9 Hospitality Road", city="Dhaka", region="Dhaka", postal_code="1229", country_code="BD"),
    ])
    StockBalance.objects.bulk_create([
        StockBalance(organization=organization, sku=product, warehouse=warehouse, reorder_level=product.reorder_level)
        for product in skus for warehouse in warehouses
    ])
    post_opening_balance(organization, actor, Decimal("250000.00"), cash_account_code="101100")
    post_opening_stock(organization, actor, sku_id=skus[0].id, warehouse_id=port.id, quantity=100, unit_cost=Decimal("10.00"), batch_code="OPEN-SCN-A", received_at=now - timedelta(days=65))
    post_opening_stock(organization, actor, sku_id=skus[0].id, warehouse_id=port.id, quantity=100, unit_cost=Decimal("12.50"), batch_code="OPEN-SCN-B", received_at=now - timedelta(days=20))
    post_opening_stock(organization, actor, sku_id=skus[1].id, warehouse_id=port.id, quantity=100, unit_cost=Decimal("30.00"), batch_code="OPEN-NET-A", received_at=now - timedelta(days=40))
    post_opening_stock(organization, actor, sku_id=skus[2].id, warehouse_id=central.id, quantity=800, unit_cost=Decimal("1.45"), batch_code="BREW-2026-A", received_at=now - timedelta(days=30), expires_at=now + timedelta(days=120))
    post_opening_stock(organization, actor, sku_id=skus[2].id, warehouse_id=retail.id, quantity=120, unit_cost=Decimal("1.45"), batch_code="BREW-2026-B", received_at=now - timedelta(days=20), expires_at=now + timedelta(days=100))
    post_opening_stock(organization, actor, sku_id=skus[3].id, warehouse_id=central.id, quantity=1000, unit_cost=Decimal("0.18"), batch_code="LABEL-2026-A", received_at=now - timedelta(days=50))
    post_opening_stock(organization, actor, sku_id=skus[4].id, warehouse_id=port.id, quantity=40, unit_cost=Decimal("4.00"), batch_code="HOLSTER-2026-A", received_at=now - timedelta(days=45))

    set_seed_sequence(organization, DocumentKind.PURCHASE_ORDER, 104)
    import_order = create_purchase_order(
        organization, actor, vendor_id=vendors[0].id, destination_warehouse_id=port.id, currency="CNY", exchange_rate=Decimal("0.14"),
        expected_at=now + timedelta(days=5), reference="LC-NPE-2026-014 / SHIP-8841",
        lines=[{"sku_id": skus[0].id, "quantity": 500, "unit_cost": Decimal("196.00")}, {"sku_id": skus[1].id, "quantity": 180, "unit_cost": Decimal("425.00")}],
    )
    approve_purchase_order(organization, actor, import_order.id)
    mark_purchase_order_in_transit(organization, actor, import_order.id)
    receipt_lines = [{"purchase_order_item_id": item.id, "quantity": int(item.ordered_quantity)} for item in import_order.items.all()]
    post_goods_receipt(
        organization, actor, purchase_order_id=import_order.id, warehouse_id=port.id, allocation_method="weight", lines=receipt_lines,
        costs={"freight": Decimal("1200.13"), "customs": Decimal("450.07"), "port_handling": Decimal("150.01"), "insurance": Decimal("50.03"), "currency": "USD", "exchange_rate": Decimal("1.00")},
    )
    pending_order = create_purchase_order(
        organization, actor, vendor_id=vendors[2].id, destination_warehouse_id=central.id, currency="USD", exchange_rate=Decimal("1.00"),
        expected_at=now + timedelta(days=12), reference="BEVERAGE-RESTOCK-Q3", lines=[{"sku_id": skus[2].id, "quantity": 5000, "unit_cost": Decimal("1.10")}],
    )
    record_vendor_payment(organization, actor, vendor_id=vendors[0].id, purchase_order_id=import_order.id, payment_method="BANK", amount=Decimal("1000.00"), currency="USD", exchange_rate=Decimal("1.00"), reference="LC-PARTIAL-001", notes="Partial settlement against the import purchase order.")

    set_seed_sequence(organization, DocumentKind.SALES_ORDER, 882)
    set_seed_sequence(organization, DocumentKind.INVOICE, 320)
    shipped_order = create_sales_order(
        organization, actor, customer_id=customers[0].id, warehouse_id=port.id, channel="B2B", currency="USD", exchange_rate=Decimal("1.00"),
        reference="ALDER-WHOLESALE-882", lines=[{"sku_id": skus[0].id, "quantity": 150, "unit_price": Decimal("25.00")}],
    )
    shipment = ship_order(organization, actor, shipped_order.id)
    record_customer_payment(organization, actor, customer_id=customers[0].id, invoice_id=shipment.invoice.id, payment_method="BANK", amount=Decimal("1750.00"), currency="USD", exchange_rate=Decimal("1.00"), reference="BANK-ALDER-001", notes="Partial invoice settlement.")
    shipped_item = shipped_order.items.get()
    create_sales_return(organization, actor, order_id=shipped_order.id, reason="Scanner condition verified at goods receiving.", lines=[
        {"order_item_id": shipped_item.id, "quantity": 10, "condition": "RESTOCKABLE"},
        {"order_item_id": shipped_item.id, "quantity": 5, "condition": "DAMAGED_EXPIRED"},
    ])
    create_sales_order(
        organization, actor, customer_id=customers[1].id, warehouse_id=port.id, channel="SHOPIFY", currency="USD", exchange_rate=Decimal("1.00"),
        reference="SHOPIFY-10429", lines=[{"sku_id": skus[1].id, "quantity": 10, "unit_price": Decimal("129.00")}],
    )
    packed_order = create_sales_order(
        organization, actor, customer_id=customers[2].id, warehouse_id=central.id, channel="B2B", currency="USD", exchange_rate=Decimal("1.00"),
        reference="NORTHSTAR-WEEKLY", lines=[{"sku_id": skus[2].id, "quantity": 20, "unit_price": Decimal("3.50")}],
    )
    move_order_to_pick_pack(organization, actor, packed_order.id)
    record_expense(organization, actor, category="WAREHOUSE_RENT", payee="Central Logistics Properties", reference="RENT-2026-11", notes="Monthly Central Distribution Hub rent.", warehouse_id=central.id, payment_method="BANK", amount=Decimal("850.00"), currency="USD", exchange_rate=Decimal("1.00"))
    create_stock_adjustment(organization, actor, warehouse_id=central.id, sku_id=skus[2].id, counted_quantity=790, reason="Cycle count confirmed ten damaged cans.", adjustment_type="DAMAGE")
    Notification.objects.bulk_create([
        Notification(organization=organization, role="WAREHOUSE_MANAGER", kind="LOW_STOCK", title=f"Low stock: {skus[2].sku} at {retail.code}", message="120 cans remain. The reorder threshold is 250 cans.", href="/app/inventory"),
        Notification(organization=organization, role="ACCOUNTANT", kind="PENDING_APPROVAL", title=f"Approval required: {pending_order.number}", message=pending_order.approval_reason, href="/app/settings?tab=approvals"),
    ])
    record_audit(organization, actor, "Sandbox provisioned", "Organization", organization.id, new_value={"warehouses": len(warehouses), "skus": len(skus), "customers": len(customers), "import_po": import_order.number, "expires_at": organization.expires_at.isoformat()})
    return organization, actor
