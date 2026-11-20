from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from core.services.ledger import post_opening_balance
from core.services.organizations import provision_organization
from inventory.services import create_sku, create_warehouse, post_opening_stock
from orders.services import create_customer, create_sales_order, ship_order
from procurement.services import approve_purchase_order, create_purchase_order, create_vendor, mark_purchase_order_in_transit


@pytest.fixture
def organization(db):
    organization, _ = provision_organization(
        legal_name="Nexus Test Industries",
        display_name="Nexus Test",
        tax_id="TEST-TAX-001",
        base_currency="USD",
        timezone="Asia/Dhaka",
        invoice_footer_note="Test invoice footer",
        email="admin@test.example",
        password="test-password-123",
        full_name="Test Admin",
    )
    return organization


@pytest.fixture
def actor(organization):
    return organization.users.get(email="admin@test.example")


@pytest.fixture
def accountant(actor):
    actor.role = "ACCOUNTANT"
    actor.save(update_fields=["role"])
    return actor


@pytest.fixture
def warehouse(actor, organization):
    return create_warehouse(organization, actor, code="WH-A", name="Warehouse A", type="DISTRIBUTION", capacity_cbm=1000)


@pytest.fixture
def warehouse_two(actor, organization):
    return create_warehouse(organization, actor, code="WH-B", name="Warehouse B", type="FULFILLMENT", capacity_cbm=1000)


@pytest.fixture
def vendor(actor, organization):
    return create_vendor(organization, actor, code="SUP-TEST", name="Test Supplier", contact_name="Supplier Contact", currency="USD")


@pytest.fixture
def sku(actor, organization, vendor):
    return create_sku(
        organization,
        actor,
        sku="TEST-SKU-001",
        name="Test Product",
        category="Test Goods",
        description="A real test product used to exercise inventory accounting.",
        unit_of_measure="unit",
        preferred_vendor_id=vendor.id,
        weight_kg=Decimal("1.0000"),
        volume_cbm=Decimal("0.1000"),
        cost_price=Decimal("10.00"),
        selling_price=Decimal("25.00"),
        currency="USD",
    )


@pytest.fixture
def customer(actor, organization):
    return create_customer(
        organization,
        actor,
        code="CUS-TEST",
        name="Test Customer",
        contact_name="Customer Contact",
        email="customer@test.example",
        currency="USD",
        tax_rate=Decimal("0"),
        credit_limit=Decimal("10000"),
        address_line1="100 Test Street",
        city="Dhaka",
        region="Dhaka",
        postal_code="1200",
        country_code="BD",
    )


@pytest.fixture
def taxed_customer(actor, organization):
    return create_customer(
        organization,
        actor,
        code="CUS-TAXED",
        name="Taxed Customer",
        contact_name="Tax Customer",
        email="taxed@test.example",
        currency="USD",
        tax_rate=Decimal("8.75"),
        credit_limit=Decimal("1500"),
        address_line1="200 Test Street",
        city="Dhaka",
        region="Dhaka",
        postal_code="1200",
        country_code="BD",
    )


@pytest.fixture
def opening_cash(actor, organization):
    return post_opening_balance(organization, actor, Decimal("10000.00"), cash_account_code="101100")


@pytest.fixture
def opening_layer(actor, organization, sku, warehouse):
    return post_opening_stock(
        organization,
        actor,
        sku_id=sku.id,
        warehouse_id=warehouse.id,
        quantity=100,
        unit_cost=Decimal("10.00"),
        batch_code="BATCH-A",
        received_at=timezone.now() - timedelta(days=30),
    )


@pytest.fixture
def opening_layer_two(actor, organization, sku, warehouse):
    return post_opening_stock(
        organization,
        actor,
        sku_id=sku.id,
        warehouse_id=warehouse.id,
        quantity=100,
        unit_cost=Decimal("12.50"),
        batch_code="BATCH-B",
        received_at=timezone.now() - timedelta(days=15),
    )


@pytest.fixture
def invoice(actor, organization, customer, sku, warehouse, opening_layer):
    order = create_sales_order(
        organization,
        actor,
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        channel="B2B",
        currency="USD",
        exchange_rate=Decimal("1.00"),
        reference="TEST-ORDER",
        lines=[{"sku_id": sku.id, "quantity": 10, "unit_price": Decimal("10.00")}],
    )
    return ship_order(organization, actor, order.id).invoice


@pytest.fixture
def grn_order(actor, organization, vendor, warehouse):
    scanner = create_sku(
        organization,
        actor,
        sku="SCN-X2-BT",
        name="X2 Bluetooth Barcode Scanner",
        category="Warehouse Hardware",
        description="Industrial barcode scanner.",
        unit_of_measure="unit",
        preferred_vendor_id=vendor.id,
        weight_kg=Decimal("0.72"),
        volume_cbm=Decimal("0.0024"),
        cost_price=Decimal("28.00"),
        selling_price=Decimal("69.95"),
        currency="CNY",
    )
    switch = create_sku(
        organization,
        actor,
        sku="NET-SW-8P",
        name="8-Port Managed Network Switch",
        category="Warehouse Hardware",
        description="Managed gigabit switch.",
        unit_of_measure="unit",
        preferred_vendor_id=vendor.id,
        weight_kg=Decimal("1.90"),
        volume_cbm=Decimal("0.0041"),
        cost_price=Decimal("61.00"),
        selling_price=Decimal("129.00"),
        currency="CNY",
    )
    order = create_purchase_order(
        organization,
        actor,
        vendor_id=vendor.id,
        destination_warehouse_id=warehouse.id,
        currency="CNY",
        exchange_rate=Decimal("0.14"),
        expected_at=timezone.now() + timedelta(days=5),
        reference="NPE-TEST-GRN",
        lines=[
            {"sku_id": scanner.id, "quantity": 500, "unit_cost": Decimal("196.00")},
            {"sku_id": switch.id, "quantity": 180, "unit_cost": Decimal("425.00")},
        ],
    )
    approve_purchase_order(organization, actor, order.id)
    mark_purchase_order_in_transit(organization, actor, order.id)
    lines = [{"purchase_order_item_id": item.id, "quantity": item.ordered_quantity} for item in order.items.all()]
    return {"order": order, "scanner": scanner, "switch": switch, "lines": lines}


@pytest.fixture
def landed_costs():
    return {
        "freight": Decimal("1200.13"),
        "customs": Decimal("450.07"),
        "port_handling": Decimal("150.01"),
        "insurance": Decimal("50.03"),
        "currency": "USD",
        "exchange_rate": Decimal("1.00"),
    }
