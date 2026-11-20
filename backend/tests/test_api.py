import json
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
import yaml
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from core.authentication import ACCESS_COOKIE_NAME
from core.models import ApprovalRequest, IdempotencyRecord, Organization, TeamInvitation, User
from core.services.organizations import provision_organization
from core.tasks import cleanup_sandboxes
from finance.models import JournalEntry
from inventory.models import SKU, StockBalance, Warehouse
from orders.models import Customer, CustomerPayment, Invoice, SalesOrder
from procurement.models import PurchaseOrder, Vendor


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def defer_documents():
    cache.clear()
    with patch("orders.views.enqueue_document") as enqueue:
        yield enqueue


@pytest.fixture
def client():
    return APIClient()


def csrf(client):
    token = client.cookies.get("csrftoken")
    return {"HTTP_X_CSRFTOKEN": token.value if token else ""}


def sign_in(client, actor, password="test-password-123"):
    response = client.post("/api/v1/auth/login/", {"email": actor.email, "password": password}, format="json")
    assert response.status_code == 200, response.content
    return response


def create_member(organization, email, role, password="member-password-123"):
    return User.objects.create_user(email=email, password=password, organization=organization, full_name="API Test Member", role=role)


def receipt_payload(order, warehouse):
    return {
        "purchaseOrderId": str(order.id),
        "warehouseId": str(warehouse.id),
        "allocationMethod": "weight",
        "costs": {"freightMinor": 10001, "customsMinor": 5000, "portHandlingMinor": 0, "insuranceMinor": 0, "currency": "USD", "fxRateToBase": "1.0000"},
        "lines": [{"purchaseOrderLineId": str(line.id), "quantity": int(line.ordered_quantity)} for line in order.items.all()],
    }


def test_registration_sets_secure_cookie_contract(client):
    response = client.post("/api/v1/auth/register/", {
        "legalName": "North Harbor Trading LLC", "displayName": "North Harbor", "taxId": "NH-7782", "baseCurrency": "USD",
        "timezone": "Asia/Dhaka", "invoiceFooterNote": "Include the invoice number with payment.", "email": "owner@north-harbor.example",
        "password": "Harbor-secure-password-42", "fullName": "Harbor Owner", "phone": "+8801700000000",
        "address": {"line1": "100 Harbor Road", "line2": "Suite 4", "city": "Dhaka", "region": "Dhaka", "postalCode": "1200", "countryCode": "BD"},
    }, format="json")
    assert response.status_code == 201, response.content
    organization = Organization.objects.get(legal_name="North Harbor Trading LLC")
    actor = organization.users.get()
    assert actor.role == "SUPER_ADMIN"
    assert not actor.is_staff
    assert organization.finance_account_records.count() == 24
    assert organization.address_line1 == "100 Harbor Road"
    access = response.cookies[ACCESS_COOKIE_NAME]
    refresh = response.cookies["nexusledger_refresh"]
    assert access["httponly"] and access["samesite"] == "Lax" and access["path"] == "/"
    assert refresh["httponly"] and refresh["path"] == "/api/v1/auth/"
    assert not response.cookies["csrftoken"]["httponly"]
    assert response.json()["organization"]["baseCurrency"] == "USD"
    assert "password" not in response.content.decode()
    assert client.get("/api/v1/auth/me/").json()["user"]["email"] == "owner@north-harbor.example"


def test_login_rejects_invalid_credentials_and_duplicate_registration(client, actor):
    response = client.post("/api/v1/auth/login/", {"email": actor.email, "password": "incorrect-password"}, format="json")
    assert response.status_code == 401
    assert ACCESS_COOKIE_NAME not in response.cookies
    response = client.post("/api/v1/auth/register/", {
        "legalName": "Duplicate Company", "displayName": "Duplicate", "taxId": "DUP", "baseCurrency": "USD", "timezone": "UTC",
        "email": actor.email.upper(), "password": "Another-secure-password-42",
    }, format="json")
    assert response.status_code == 400
    assert Organization.objects.filter(legal_name="Duplicate Company").count() == 0


def test_cookie_refresh_logout_and_immediate_reauthentication(client, actor):
    sign_in(client, actor)
    first_access = client.cookies[ACCESS_COOKIE_NAME].value
    first_refresh = client.cookies["nexusledger_refresh"].value
    assert client.post("/api/v1/auth/refresh/", {}, format="json").status_code == 403
    response = client.post("/api/v1/auth/refresh/", {}, format="json", **csrf(client))
    assert response.status_code == 200, response.content
    second_refresh = client.cookies["nexusledger_refresh"].value
    assert second_refresh != first_refresh
    assert client.post("/api/v1/auth/refresh/", {"refresh": first_refresh}, format="json").status_code == 401
    assert client.post("/api/v1/auth/logout/", {}, format="json").status_code == 403
    response = client.post("/api/v1/auth/logout/", {}, format="json", **csrf(client))
    assert response.status_code == 204, response.content
    actor.refresh_from_db()
    assert actor.authz_version == 2
    client.cookies[ACCESS_COOKIE_NAME] = first_access
    assert client.get("/api/v1/auth/me/").status_code == 401
    sign_in(client, actor)
    assert client.get("/api/v1/auth/me/").status_code == 200
    assert client.post("/api/v1/auth/refresh/", {"refresh": second_refresh}, format="json").status_code == 401


def test_cached_identity_avoids_per_request_user_database_lookup(client, actor, django_assert_num_queries):
    sign_in(client, actor)
    with django_assert_num_queries(0):
        response = client.get("/api/v1/auth/me/")
    assert response.status_code == 200


def test_team_invitation_acceptance_and_role_token_invalidation(client, actor, organization):
    sign_in(client, actor)
    response = client.post("/api/v1/settings/team/", {"email": "sales@example.com", "role": "SALES_OFFICER"}, format="json", **csrf(client))
    assert response.status_code == 201, response.content
    invitation = TeamInvitation.objects.get(email="sales@example.com")
    assert invitation.token_hash not in response.content.decode()
    raw_token = mail.outbox[0].body.split("invitation=", 1)[1]
    invited_client = APIClient()
    response = invited_client.post("/api/v1/settings/team/accept/", {"token": raw_token, "password": "Sales-member-password-42", "fullName": "Sales Member"}, format="json")
    assert response.status_code == 201, response.content
    member = User.objects.get(email="sales@example.com")
    assert member.organization_id == organization.id
    old_access = invited_client.cookies[ACCESS_COOKIE_NAME].value
    response = client.patch(f"/api/v1/settings/team/members/{member.id}/role/", {"role": "ACCOUNTANT"}, format="json", **csrf(client))
    assert response.status_code == 200, response.content
    member.refresh_from_db()
    assert member.authz_version == 2
    invited_client.cookies[ACCESS_COOKIE_NAME] = old_access
    assert invited_client.get("/api/v1/auth/me/").status_code == 401
    assert APIClient().post("/api/v1/settings/team/accept/", {"token": raw_token, "password": "Sales-member-password-42", "fullName": "Sales Member"}, format="json").status_code == 400


def test_tenant_isolation_and_sensitive_field_rbac(client, actor, organization, customer, sku, opening_layer):
    other_organization, other_actor = provision_organization(
        legal_name="Separate Organization", display_name="Separate", tax_id="OTHER", base_currency="USD", timezone="UTC",
        invoice_footer_note="", email="other@example.com", password="other-password-123",
    )
    other_client = APIClient()
    sign_in(other_client, other_actor, "other-password-123")
    assert other_client.get(f"/api/v1/customers/{customer.id}/").status_code == 404
    assert other_client.get(f"/api/v1/inventory/skus/{sku.id}/").status_code == 404
    assert other_client.get(f"/api/v1/inventory/layers/{opening_layer.id}/").status_code == 404
    sales = create_member(organization, "limited-sales@example.com", "SALES_OFFICER")
    sign_in(client, sales, "member-password-123")
    product = client.get(f"/api/v1/inventory/skus/{sku.id}/")
    assert product.status_code == 200
    assert product.json()["costPriceMinor"] is None
    dashboard = client.get("/api/v1/dashboard/summary/")
    assert dashboard.status_code == 200
    assert dashboard.json()["grossMarginPercent"] is None
    assert dashboard.json()["ledgerFeed"] == []
    assert client.get("/api/v1/finance/journal-entries/").status_code == 403
    assert client.get("/api/v1/inventory/layers/").status_code == 403
    assert client.get("/api/v1/vendors/").status_code == 403
    assert client.get("/api/v1/procurement/purchase-orders/").status_code == 403
    assert client.get("/api/v1/procurement/vendor-payments/").status_code == 403
    assert client.get("/api/v1/inventory/transfers/").status_code == 403
    assert client.get("/api/v1/inventory/adjustments/").status_code == 403
    assert all(result["type"] != "Purchase Order" for result in client.get("/api/v1/search/?q=PO").json()["results"])
    assert client.patch("/api/v1/settings/fiscal/", {"displayName": "Unauthorized"}, format="json", **csrf(client)).status_code == 403
    assert client.post("/api/v1/auth/sandbox/switch-role/", {"role": "SUPER_ADMIN"}, format="json", **csrf(client)).status_code == 403


def test_master_data_and_complete_operational_api_workflow(client, actor, organization, vendor, warehouse, sku, customer, opening_cash):
    sign_in(client, actor)
    warehouse_response = client.post("/api/v1/inventory/warehouses/", {
        "code": "wh-api", "name": "API Receiving Hub", "type": "DISTRIBUTION", "capacityCbm": "2400.0000",
        "temperatureControlled": False, "status": "ACTIVE",
        "address": {"line1": "20 API Road", "line2": "Dock 4", "city": "Dhaka", "region": "Dhaka", "postalCode": "1212", "countryCode": "BD"},
    }, format="json", **csrf(client))
    assert warehouse_response.status_code == 201, warehouse_response.content
    receiving_warehouse = Warehouse.objects.get(code="WH-API")
    assert warehouse_response.json()["address"]["postalCode"] == "1212"
    assert warehouse_response.json()["type"] == "Distribution"
    product_response = client.post("/api/v1/inventory/skus/", {
        "sku": "api-product", "name": "API Precision Pump", "category": "Industrial Equipment", "description": "API managed inventory item.",
        "unitOfMeasure": "unit", "barcode": "API-BARCODE-001", "vatRateBasisPoints": 750, "reorderPoint": 5,
        "weightKgPerUnit": "2.5000", "volumeCbmPerUnit": "0.0200", "costPriceMinor": 5000, "salesPriceMinor": 10000,
        "salesCurrency": "USD", "preferredSupplierId": str(vendor.id),
    }, format="json", **csrf(client))
    assert product_response.status_code == 201, product_response.content
    product = SKU.objects.get(sku="API-PRODUCT")
    assert product_response.json()["vatRateBasisPoints"] == 750
    assert product_response.json()["costPriceMinor"] == 5000
    assert client.get("/api/v1/inventory/skus/by-barcode/?code=API-BARCODE-001").json()["id"] == str(product.id)
    customer_response = client.post("/api/v1/customers/", {
        "code": "CUS-API", "name": "API Customer Limited", "contactName": "API Buyer", "email": "buyer@api-customer.example",
        "currency": "USD", "paymentTermsDays": 30, "taxRateBasisPoints": 0, "creditLimitBaseMinor": 5000000,
        "billingAddress": {"line1": "9 Buyer Street", "line2": "", "city": "Dhaka", "region": "Dhaka", "postalCode": "1200", "countryCode": "BD"},
    }, format="json", **csrf(client))
    assert customer_response.status_code == 201, customer_response.content
    api_customer = Customer.objects.get(code="CUS-API")
    assert customer_response.json()["billingAddress"]["line1"] == "9 Buyer Street"
    po_response = client.post("/api/v1/procurement/purchase-orders/", {
        "supplierId": str(vendor.id), "destinationWarehouseId": str(receiving_warehouse.id), "currency": "USD", "fxRateToBase": "1.0000",
        "expectedAt": (timezone.now() + timedelta(days=5)).isoformat(), "reference": "API-IMPORT-001",
        "lines": [{"productId": str(product.id), "orderedQuantity": 10, "unitCostMinor": 5000}],
    }, format="json", **csrf(client))
    assert po_response.status_code == 201, po_response.content
    purchase_order = PurchaseOrder.objects.get(reference="API-IMPORT-001")
    assert client.post(f"/api/v1/procurement/purchase-orders/{purchase_order.id}/approve/", {}, format="json", **csrf(client)).status_code == 200
    assert client.post(f"/api/v1/procurement/purchase-orders/{purchase_order.id}/in-transit/", {}, format="json", **csrf(client)).status_code == 200
    payload = receipt_payload(purchase_order, receiving_warehouse)
    preview = client.post(f"/api/v1/procurement/purchase-orders/{purchase_order.id}/preview/", payload, format="json", **csrf(client))
    assert preview.status_code == 200, preview.content
    assert preview.json()["totalAllocatedCostMinor"] == 15001
    assert preview.json()["totalDebitMinor"] == preview.json()["totalCreditMinor"] == 65001
    receipt = client.post(f"/api/v1/procurement/purchase-orders/{purchase_order.id}/receive/", payload, format="json", **csrf(client))
    assert receipt.status_code == 201, receipt.content
    receipt_data = receipt.json()
    assert receipt_data["landedCosts"]["base"]["freightMinor"] == 10001
    assert StockBalance.objects.get(sku=product, warehouse=receiving_warehouse).on_hand == 10
    assert JournalEntry.objects.get(pk=receipt_data["journalEntryId"]).total_debit == Decimal("650.0100")
    vendor_payment = client.post(f"/api/v1/vendors/{vendor.id}/pay/", {
        "purchaseOrderId": str(purchase_order.id), "paymentMethod": "BANK", "amountMinor": 1000,
        "currency": "USD", "fxRateToBase": "1.0000", "reference": "API-VENDOR-PAY", "notes": "Partial settlement",
    }, format="json", **csrf(client))
    assert vendor_payment.status_code == 201, vendor_payment.content
    vendor.refresh_from_db()
    assert vendor.payable_balance == Decimal("490.0000")
    order_response = client.post("/api/v1/orders/", {
        "customerId": str(api_customer.id), "warehouseId": str(receiving_warehouse.id), "channel": "B2B", "currency": "USD", "fxRateToBase": "1.0000",
        "reference": "API-SALE-001", "lines": [{"productId": str(product.id), "quantity": 4, "unitPriceMinor": 10000}],
    }, format="json", **csrf(client))
    assert order_response.status_code == 201, order_response.content
    order = SalesOrder.objects.get(reference="API-SALE-001")
    assert order.items.get().reservation.quantity == 4
    assert client.post(f"/api/v1/orders/{order.id}/pick-pack/", {}, format="json", **csrf(client)).json()["status"] == "Pick & Pack"
    shipped = client.post(f"/api/v1/orders/{order.id}/ship/", {}, format="json", **csrf(client))
    assert shipped.status_code == 201, shipped.content
    invoice = Invoice.objects.get(sales_order=order)
    assert shipped.json()["totalMinor"] == 40000
    assert invoice.journal_entries.count() == 2
    payment = client.post(f"/api/v1/customers/{api_customer.id}/receive-payment/", {
        "invoiceId": str(invoice.id), "paymentMethod": "BANK", "amountMinor": 15000, "currency": "USD", "fxRateToBase": "1.0000",
        "reference": "API-COLLECTION-001", "notes": "First installment",
    }, format="json", **csrf(client))
    assert payment.status_code == 201, payment.content
    assert payment.json()["allocations"][0]["amountBaseMinor"] == 15000
    receipt_pdf = client.get(f"/api/v1/customer-payments/{payment.json()['id']}/receipt/")
    assert receipt_pdf.status_code == 200 and b"".join(receipt_pdf.streaming_content).startswith(b"%PDF")
    vendors = client.get("/api/v1/vendors/")
    vendor_row = next(row for row in vendors.json()["results"] if row["id"] == str(vendor.id))
    assert vendor_row["totalPurchasedMinor"] == 50000
    assert vendor_row["totalPaidMinor"] == 1000
    assert vendor_row["payableBalanceMinor"] == 49000
    assert vendor_row["shipmentReferences"] == ["API-IMPORT-001"]
    collections = client.get("/api/v1/collections/summary/")
    assert collections.status_code == 200
    assert collections.json()["collectedTodayMinor"] == 15000
    returned = client.post("/api/v1/returns/", {
        "orderId": str(order.id), "reason": "One unit restocked and one unit damaged during inspection.",
        "lines": [
            {"orderLineId": str(order.items.get().id), "quantity": 1, "condition": "RESTOCKABLE"},
            {"orderLineId": str(order.items.get().id), "quantity": 1, "condition": "DAMAGED_EXPIRED"},
        ],
    }, format="json", **csrf(client))
    assert returned.status_code == 201, returned.content
    assert returned.json()["shrinkageBaseMinor"] == 6500
    assert StockBalance.objects.get(sku=product, warehouse=receiving_warehouse).on_hand == 7
    api_customer.refresh_from_db()
    assert api_customer.receivable_balance == Decimal("50.0000")
    history = client.get(f"/api/v1/customers/{api_customer.id}/history/")
    assert history.status_code == 200
    history_row = history.json()[0]
    assert history_row["quantity"] == 4
    assert history_row["orderNumber"] == order.number
    assert history_row["sku"] == product.sku
    assert history_row["productName"] == product.name
    assert history_row["status"] == "Invoiced"
    reports = client.get("/api/v1/finance/reports/?startDate=2000-01-01&endDate=2099-12-31")
    assert reports.status_code == 200, reports.content
    assert reports.json()["trialBalance"]["balanced"]
    assert reports.json()["balanceSheet"]["balanced"]
    export = client.get("/api/v1/finance/journal-entries/export/?startDate=2000-01-01&endDate=2099-12-31")
    assert export.status_code == 200 and export["Content-Type"].startswith("text/csv")
    content = b"".join(export.streaming_content).decode()
    assert "Journal ID" in content and "GOODS_RECEIPT" in content
    pdf = client.get(f"/api/v1/invoices/{invoice.id}/pdf/")
    assert pdf.status_code == 200 and pdf["Content-Type"] == "application/pdf"
    assert b"".join(pdf.streaming_content).startswith(b"%PDF")


def test_pos_idempotency_prevents_duplicate_financial_posting(client, actor, organization, customer, sku, warehouse, opening_layer, opening_cash):
    sign_in(client, actor)
    key = f"api-test-{uuid.uuid4()}"
    payload = {
        "customerId": str(customer.id), "warehouseId": str(warehouse.id), "exchangeRate": "1.0000", "reference": "API-POS-001",
        "lines": [{"productId": str(sku.id), "quantity": 1, "unitPriceMinor": 2500}],
        "payments": [{"method": "CASH", "amountMinor": 1000}],
    }
    response = client.post("/api/v1/pos/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf(client))
    assert response.status_code == 201, response.content
    assert response.json()["customerDueMinor"] == 1500
    replay = client.post("/api/v1/pos/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf(client))
    assert replay.status_code == 201 and replay.json() == response.json()
    assert replay["Idempotency-Replayed"] == "true"
    assert SalesOrder.objects.count() == 1
    assert Invoice.objects.count() == 1
    assert CustomerPayment.objects.count() == 1
    assert client.post("/api/v1/pos/", {**payload, "reference": "DIFFERENT"}, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf(client)).status_code == 409
    assert SalesOrder.objects.count() == 1
    assert IdempotencyRecord.objects.get(key=key).response_status == 201


def test_expired_idempotency_key_can_be_reused_safely(client, actor, organization, vendor, warehouse):
    sign_in(client, actor)
    key = f"expiring-{uuid.uuid4()}"
    payload = {
        "code": "EXPIRING-VENDOR", "name": "Expiring Test Vendor", "contactName": "Vendor Contact", "email": "vendor-expiry@example.com",
        "currency": "USD", "paymentTermsDays": 30, "countryCode": "US", "status": "ACTIVE",
    }
    response = client.post("/api/v1/vendors/", payload, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf(client))
    assert response.status_code == 201, response.content
    record = IdempotencyRecord.objects.get(key=key)
    record.expires_at = timezone.now() - timedelta(seconds=1)
    record.save(update_fields=["expires_at", "updated_at"])
    response = client.post("/api/v1/vendors/", {**payload, "code": "NEW-VENDOR", "name": "New Vendor"}, format="json", HTTP_IDEMPOTENCY_KEY=key, **csrf(client))
    assert response.status_code == 201, response.content
    assert Vendor.objects.filter(code="NEW-VENDOR").count() == 1
    assert IdempotencyRecord.objects.get(key=key).expires_at > timezone.now()


def test_cache_invalidation_and_trigram_search(client, actor, organization, sku, warehouse, opening_layer, django_capture_on_commit_callbacks):
    sign_in(client, actor)
    initial = client.get("/api/v1/dashboard/summary/")
    assert initial.json()["reservedUnits"] == 0
    with django_capture_on_commit_callbacks(execute=True):
        reservation = client.post("/api/v1/inventory/stock/reserve/", {"productId": str(sku.id), "warehouseId": str(warehouse.id), "channel": "B2B", "reference": "API-RESERVE", "quantity": 5}, format="json", **csrf(client))
    assert reservation.status_code == 201, reservation.content
    refreshed = client.get("/api/v1/dashboard/summary/")
    assert refreshed.json()["reservedUnits"] == 5
    search = client.get("/api/v1/search/?q=Test%20Product")
    assert search.status_code == 200
    assert len(search.json()["results"]) <= 10
    assert search.json()["results"][0]["title"] == sku.sku
    assert "costPriceMinor" not in search.content.decode()


def test_api_post_without_trailing_slash_reaches_the_view(client):
    response = client.post("/api/v1/auth/login", {}, format="json")
    assert response.status_code == 400, response.content


def test_sandbox_seeding_role_switch_and_expired_cleanup(client):
    response = client.post("/api/v1/auth/sandbox/", {}, format="json")
    assert response.status_code == 201, response.content
    organization = Organization.objects.get(pk=response.json()["sandbox"]["id"])
    assert organization.is_sandbox and organization.expires_at > timezone.now()
    assert Warehouse.objects.filter(organization=organization).count() == 3
    assert SKU.objects.filter(organization=organization).count() == 6
    assert PurchaseOrder.objects.get(organization=organization, number="PO-0104").status == "RECEIVED"
    assert SalesOrder.objects.get(organization=organization, number="SO-0882").status == "INVOICED"
    journals = JournalEntry.objects.filter(organization=organization)
    assert journals.count() > 10
    assert all(entry.total_debit == entry.total_credit for entry in journals)
    old_access = client.cookies[ACCESS_COOKIE_NAME].value
    switched = client.post("/api/v1/auth/sandbox/switch-role/", {"role": "SALES_OFFICER"}, format="json", **csrf(client))
    assert switched.status_code == 200, switched.content
    assert switched.json()["user"]["roleCode"] == "SALES_OFFICER"
    client.cookies[ACCESS_COOKIE_NAME] = old_access
    assert client.get("/api/v1/auth/me/").status_code == 401
    organization.expires_at = timezone.now() - timedelta(minutes=1)
    organization.save(update_fields=["expires_at", "updated_at"])
    assert cleanup_sandboxes() == 1
    assert not Organization.objects.filter(pk=organization.id).exists()
    assert not User.objects.filter(organization_id=organization.id).exists()
    assert not JournalEntry.objects.filter(organization_id=organization.id).exists()
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    assert not OutstandingToken.objects.filter(user_id=response.json()["user"]["id"]).exists()
    assert cleanup_sandboxes() == 0


def test_public_leads_benchmarks_and_openapi(client):
    lead = client.post("/api/v1/public/book-demo/", {
        "fullName": "Alex Morgan", "workEmail": "alex@example.com", "companyName": "Morgan Distribution", "phone": "+15550001234",
        "industry": "WHOLESALE_DISTRIBUTION", "warehouseCount": 3, "monthlyShipments": 2400, "skuCount": 1200,
        "message": "We need FIFO costing across three warehouses.", "consent": True,
    }, format="json")
    assert lead.status_code == 201, lead.content
    assert lead.json()["status"] == "received"
    assert client.post("/api/v1/public/book-demo/", {"consent": False}, format="json").status_code == 400
    benchmark = client.get("/api/v1/public/benchmarks/")
    assert benchmark.status_code == 200
    assert benchmark.json()["estimatedHoursSaved"] == benchmark.json()["manualAccountingHours"] - benchmark.json()["automatedAccountingHours"]
    schema = client.get("/api/schema/?format=json")
    assert schema.status_code == 200
    document = yaml.safe_load(schema.content)
    assert document["openapi"].startswith("3.")
    assert "/api/v1/auth/login/" in document["paths"]
    assert "/api/v1/dashboard/summary/" in document["paths"]
    assert document["components"]["securitySchemes"]["cookieAuth"]["in"] == "cookie"


def test_customer_directory_aggregates_do_not_cross_join(client, actor, organization, customer, sku, warehouse, invoice, opening_cash):
    from orders.services import create_sales_order, record_customer_payment

    create_sales_order(
        organization, actor, customer_id=customer.id, warehouse_id=warehouse.id, channel="B2B", currency="USD", exchange_rate=Decimal("1.00"),
        reference="SECOND-CUSTOMER-PURCHASE", lines=[{"sku_id": sku.id, "quantity": 2, "unit_price": Decimal("10.00")}],
    )
    record_customer_payment(
        organization, actor, customer_id=customer.id, invoice_id=invoice.id, payment_method="BANK", amount=Decimal("30.00"),
        currency="USD", exchange_rate=Decimal("1.00"), reference="DIRECTORY-PAYMENT", notes="Partial collection",
    )
    sign_in(client, actor)
    response = client.get("/api/v1/customers/")
    assert response.status_code == 200, response.content
    row = next(row for row in response.json()["results"] if row["id"] == str(customer.id))
    assert row["totalPurchasedMinor"] == 12000
    assert row["totalPaidMinor"] == 3000
    assert row["remainingDebtMinor"] == 7000
    assert row["lastPaymentDate"] is not None
    detail = client.get(f"/api/v1/customers/{customer.id}/")
    assert detail.status_code == 200
    assert detail.json()["totalPurchasedMinor"] == 12000


def test_approval_queue_notifications_and_rejection(client, actor, organization, vendor, sku, warehouse, opening_layer):
    from core.tasks import monitor_operational_alerts

    sign_in(client, actor)

    def create_pending(reference):
        response = client.post("/api/v1/procurement/purchase-orders/", {
            "supplierId": str(vendor.id), "destinationWarehouseId": str(warehouse.id), "currency": "USD", "fxRateToBase": "1.0000",
            "expectedAt": (timezone.now() + timedelta(days=7)).isoformat(), "reference": reference,
            "lines": [{"productId": str(sku.id), "orderedQuantity": 200, "unitCostMinor": 5000}],
        }, format="json", **csrf(client))
        assert response.status_code == 201, response.content
        assert response.json()["status"] == "Pending Approval"
        return PurchaseOrder.objects.get(reference=reference)

    first = create_pending("APPROVAL-REJECT")
    approval = ApprovalRequest.objects.get(purchase_order=first)
    assert monitor_operational_alerts() == 1
    assert client.get("/api/v1/notifications/unread-count/").json()["count"] == 1
    queue = client.get("/api/v1/approvals/")
    assert queue.status_code == 200
    assert queue.json()["results"][0]["entityNumber"] == first.number
    response = client.post(f"/api/v1/approvals/{approval.id}/reject/", {"reason": "Import budget exceeded this period."}, format="json", **csrf(client))
    assert response.status_code == 200, response.content
    assert response.json()["status"] == "Rejected"
    first.refresh_from_db()
    assert first.status == "CANCELLED"
    assert monitor_operational_alerts() == 0
    assert client.get("/api/v1/notifications/unread-count/").json()["count"] == 0

    second = create_pending("APPROVAL-ACCEPT")
    second_approval = ApprovalRequest.objects.get(purchase_order=second)
    response = client.post(f"/api/v1/approvals/{second_approval.id}/approve/", {}, format="json", **csrf(client))
    assert response.status_code == 200, response.content
    second.refresh_from_db()
    assert second.status == "APPROVED"
    audit = client.get("/api/v1/audit-logs/?entityType=PurchaseOrder")
    assert audit.status_code == 200
    assert any(item["action"] == "Purchase order rejected" for item in audit.json()["results"])


def test_login_rate_limit_is_enforced_per_ip(client, actor):
    from core.throttling import RedisRateThrottle

    with patch.dict(RedisRateThrottle.THROTTLE_RATES, {"login": "2/minute"}):
        sign_in(client, actor)
        sign_in(client, actor)
        response = client.post("/api/v1/auth/login/", {"email": actor.email, "password": "test-password-123"}, format="json")
    assert response.status_code == 429
    assert "Request was throttled" in response.content.decode()


def test_health_reports_dependency_failure(client):
    from redis.exceptions import RedisError

    response = client.get("/api/health/")
    assert response.status_code == 200
    assert response.json()["checks"] == {"postgres": True, "redis": True}
    with patch("core.views.cache.set", side_effect=RedisError("unavailable")):
        response = client.get("/api/health/")
    assert response.status_code == 503
    assert response.json()["checks"] == {"postgres": True, "redis": False}


def test_payment_replacement_reopens_invoice_and_preserves_audit(client, actor, organization, customer, invoice, opening_cash):
    from orders.services import record_customer_payment

    original = record_customer_payment(
        organization, actor, customer_id=customer.id, invoice_id=invoice.id, payment_method="BANK", amount=Decimal("100.00"),
        currency="USD", exchange_rate=Decimal("1.00"), reference="ORIGINAL-FULL-PAYMENT", notes="Original full collection",
    )
    invoice.refresh_from_db()
    assert invoice.status == "PAID"
    sign_in(client, actor)
    response = client.put(f"/api/v1/customer-payments/{original.id}/", {
        "paymentMethod": "BANK", "amountMinor": 5000, "currency": "USD", "fxRateToBase": "1.0000",
        "receivedAt": timezone.now().isoformat(), "reference": "REPLACEMENT-PARTIAL-PAYMENT", "notes": "Corrected collection amount",
    }, format="json", **csrf(client))
    assert response.status_code == 200, response.content
    original.refresh_from_db()
    invoice.refresh_from_db()
    customer.refresh_from_db()
    assert original.status == "REPLACED"
    assert original.replaced_by_payment_id is not None
    assert original.reversal_journal_entry_id is not None
    assert invoice.status == "ISSUED"
    assert customer.receivable_balance == Decimal("50.0000")
    replacement = original.replaced_by_payment
    assert replacement.reversal_of_payment_id == original.id
    assert replacement.allocations.get().invoice_id == invoice.id
    assert replacement.allocations.get().amount_base == Decimal("50.0000")
    assert all(entry.total_debit == entry.total_credit for entry in (original.journal_entry, original.reversal_journal_entry, replacement.journal_entry))


def test_fifo_simulation_reservation_release_and_stock_matrix(client, actor, sku, warehouse, opening_layer, opening_layer_two):
    sign_in(client, actor)
    layers = client.get(f"/api/v1/inventory/layers/?productId={sku.id}&warehouseId={warehouse.id}")
    assert layers.status_code == 200, layers.content
    assert [row["batchCode"] for row in layers.json()["results"]] == ["BATCH-A", "BATCH-B"]
    simulation = client.post(f"/api/v1/inventory/layers/{opening_layer.id}/simulate/", {"quantity": 150}, format="json", **csrf(client))
    assert simulation.status_code == 200, simulation.content
    assert simulation.json()["totalCostMinor"] == 162500
    assert [line["quantity"] for line in simulation.json()["layers"]] == [100, 50]
    assert [line["remainingQuantity"] for line in simulation.json()["layers"]] == [0, 50]
    matrix = client.get(f"/api/v1/inventory/stock/matrix/?warehouseId={warehouse.id}")
    assert matrix.status_code == 200, matrix.content
    assert matrix.json()[0]["currentFifoValueMinor"] == 225000
    reservation = client.post("/api/v1/inventory/stock/reserve/", {"productId": str(sku.id), "warehouseId": str(warehouse.id), "channel": "B2B", "reference": "FIRST-LOCK", "quantity": 150}, format="json", **csrf(client))
    assert reservation.status_code == 201, reservation.content
    rejected = client.post("/api/v1/inventory/stock/reserve/", {"productId": str(sku.id), "warehouseId": str(warehouse.id), "channel": "SHOPIFY", "reference": "SECOND-LOCK", "quantity": 51}, format="json", **csrf(client))
    assert rejected.status_code == 400
    released = client.post(f"/api/v1/inventory/reservations/{reservation.json()['id']}/release/", {}, format="json", **csrf(client))
    assert released.status_code == 200 and released.json()["status"] == "Released"
    final = client.post("/api/v1/inventory/stock/reserve/", {"productId": str(sku.id), "warehouseId": str(warehouse.id), "channel": "SHOPIFY", "reference": "FINAL-LOCK", "quantity": 200}, format="json", **csrf(client))
    assert final.status_code == 201
    matrix = client.get(f"/api/v1/inventory/stock/matrix/?warehouseId={warehouse.id}")
    assert matrix.json()[0]["reserved"] == 200
    assert matrix.json()[0]["availableToPromise"] == 0


def test_stock_transfer_and_cycle_count_api(client, actor, sku, warehouse, warehouse_two, opening_layer):
    sign_in(client, actor)
    transfer = client.post("/api/v1/inventory/transfers/", {
        "sourceWarehouseId": str(warehouse.id), "destinationWarehouseId": str(warehouse_two.id),
        "lines": [{"productId": str(sku.id), "quantity": 20}],
    }, format="json", **csrf(client))
    assert transfer.status_code == 201, transfer.content
    assert transfer.json()["lines"][0]["quantity"] == 20
    assert transfer.json()["lines"][0]["valueMinor"] == 20000
    assert StockBalance.objects.get(sku=sku, warehouse=warehouse).on_hand == 80
    assert StockBalance.objects.get(sku=sku, warehouse=warehouse_two).on_hand == 20
    adjustment = client.post("/api/v1/inventory/adjustments/", {
        "warehouseId": str(warehouse_two.id), "productId": str(sku.id), "countedQuantity": 15,
        "reason": "Physical cycle count found five damaged units.", "adjustmentType": "DAMAGE",
    }, format="json", **csrf(client))
    assert adjustment.status_code == 201, adjustment.content
    assert adjustment.json()["deltaQuantity"] == -5
    assert adjustment.json()["valueDeltaBaseMinor"] == -5000
    assert adjustment.json()["createdByRole"] == "Super Admin"
    assert StockBalance.objects.get(sku=sku, warehouse=warehouse_two).on_hand == 15


def test_operating_expense_api_and_csv_export(client, actor, warehouse, opening_cash):
    sign_in(client, actor)
    response = client.post("/api/v1/finance/expenses/", {
        "category": "DELIVERY_FUEL", "payee": "Fleet Fuel Services", "reference": "FUEL-API-001", "notes": "Delivery route fuel for the current week.",
        "warehouseId": str(warehouse.id), "paymentMethod": "BANK", "amountMinor": 5000, "currency": "USD", "fxRateToBase": "1.0000",
    }, format="json", **csrf(client))
    assert response.status_code == 201, response.content
    assert response.json()["amountBaseMinor"] == 5000
    assert response.json()["paymentMethod"] == "Bank"
    assert response.json()["createdByRole"] == "Super Admin"
    listed = client.get("/api/v1/finance/expenses/?category=DELIVERY_FUEL")
    assert listed.status_code == 200
    assert len(listed.json()["results"]) == 1
    assert listed.json()["next"] is None
    export = client.get("/api/v1/finance/expenses/export/?startDate=2000-01-01&endDate=2099-12-31")
    assert export.status_code == 200
    assert "DELIVERY_FUEL" in b"".join(export.streaming_content).decode()
    assert client.get("/api/v1/finance/trial-balance/").json()["balanced"]
    accounts = client.get("/api/v1/finance/accounts/")
    assert accounts.status_code == 200
    assert any(row["group"] == "Expenses" for row in accounts.json()["results"])
