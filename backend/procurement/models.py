from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MaxValueValidator
from django.db import models
from simple_history.models import HistoricalRecords

from core.models import ActorModel, ApprovalStatus, Currency, PaymentMethod, TenantModel, non_negative_decimal_field, positive_decimal_field


class VendorStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    ON_HOLD = "ON_HOLD", "On Hold"


class PurchaseOrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
    APPROVED = "APPROVED", "Approved"
    IN_TRANSIT = "IN_TRANSIT", "In Transit"
    RECEIVED = "RECEIVED", "Received"
    CANCELLED = "CANCELLED", "Cancelled"


class LandedCostAllocationMethod(models.TextChoices):
    WEIGHT = "WEIGHT", "Weight"
    VOLUME = "VOLUME", "Volume"
    VALUE = "VALUE", "Value"


class Vendor(TenantModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=180)
    contact_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.USD)
    payment_terms_days = models.PositiveSmallIntegerField(default=30)
    country_code = models.CharField(max_length=2, default="US")
    status = models.CharField(max_length=16, choices=VendorStatus.choices, default=VendorStatus.ACTIVE)
    payable_balance = non_negative_decimal_field()

    history = HistoricalRecords()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "code"], name="procurement_vendor_code_unique")]
        indexes = [GinIndex(fields=["name", "code"], name="procurement_vendor_search_trgm", opclasses=["gin_trgm_ops", "gin_trgm_ops"])]

    def __str__(self):
        return self.name


class PurchaseOrder(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="purchase_orders")
    destination_warehouse = models.ForeignKey("inventory.Warehouse", on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=24, choices=PurchaseOrderStatus.choices, default=PurchaseOrderStatus.DRAFT, db_index=True)
    approval_status = models.CharField(max_length=20, choices=ApprovalStatus.choices, default=ApprovalStatus.NOT_REQUIRED)
    approval_reason = models.TextField(blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="approved_purchase_orders")
    approved_by_role = models.CharField(max_length=32, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    exchange_rate = positive_decimal_field(default=Decimal("1.0000"))
    reference = models.CharField(max_length=120)
    expected_at = models.DateTimeField()
    total_amount = non_negative_decimal_field()
    total_base_amount = non_negative_decimal_field()

    history = HistoricalRecords()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="procurement_po_number_unique")]
        indexes = [
            models.Index(fields=["organization", "status", "created_at"], name="procurement_po_status_idx"),
            GinIndex(fields=["number", "reference"], name="procurement_po_search_trgm", opclasses=["gin_trgm_ops", "gin_trgm_ops"]),
        ]


class PurchaseOrderItem(TenantModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    sku = models.ForeignKey("inventory.SKU", on_delete=models.PROTECT, related_name="purchase_order_items")
    ordered_quantity = positive_decimal_field()
    received_quantity = non_negative_decimal_field()
    unit_cost = non_negative_decimal_field()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["purchase_order", "sku"], name="procurement_po_sku_unique"),
            models.CheckConstraint(condition=models.Q(received_quantity__lte=models.F("ordered_quantity")), name="procurement_received_lte_ordered"),
        ]
        indexes = [models.Index(fields=["organization", "sku"], name="procurement_po_item_sku_idx")]


class GoodsReceiptNote(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name="goods_receipts")
    purchase_order_number = models.CharField(max_length=48)
    warehouse = models.ForeignKey("inventory.Warehouse", on_delete=models.PROTECT, related_name="goods_receipts")
    received_at = models.DateTimeField(db_index=True)
    allocation_method = models.CharField(max_length=16, choices=LandedCostAllocationMethod.choices)
    freight_source = non_negative_decimal_field()
    customs_source = non_negative_decimal_field()
    port_handling_source = non_negative_decimal_field()
    insurance_source = non_negative_decimal_field()
    cost_currency = models.CharField(max_length=3, choices=Currency.choices)
    cost_exchange_rate = positive_decimal_field(default=Decimal("1.0000"))
    total_goods_base = non_negative_decimal_field()
    total_landed_cost_base = non_negative_decimal_field()
    total_inventory_base = non_negative_decimal_field()
    journal_entry = models.OneToOneField("finance.JournalEntry", on_delete=models.PROTECT, related_name="goods_receipt")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="procurement_grn_number_unique")]
        indexes = [models.Index(fields=["organization", "purchase_order", "received_at"], name="procurement_grn_po_idx")]


class GoodsReceiptItem(TenantModel):
    receipt = models.ForeignKey(GoodsReceiptNote, on_delete=models.CASCADE, related_name="items")
    purchase_order_item = models.ForeignKey(PurchaseOrderItem, on_delete=models.PROTECT, related_name="receipt_items")
    sku = models.ForeignKey("inventory.SKU", on_delete=models.PROTECT, related_name="receipt_items")
    quantity = positive_decimal_field()
    source_unit_cost = non_negative_decimal_field()
    base_unit_cost = non_negative_decimal_field()
    base_goods_cost = non_negative_decimal_field()
    basis_quantity = non_negative_decimal_field()
    basis_share = non_negative_decimal_field(validators=[MaxValueValidator(Decimal("1.0000"))])
    allocated_landed_cost = non_negative_decimal_field()
    true_unit_cost = non_negative_decimal_field()
    true_total_cost = non_negative_decimal_field()
    cost_layer = models.OneToOneField("inventory.InventoryLayer", on_delete=models.PROTECT, related_name="receipt_item")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["receipt", "purchase_order_item"], name="procurement_receipt_line_unique")]
        indexes = [models.Index(fields=["organization", "sku", "receipt"], name="procurement_receipt_sku_idx")]


class LandedCostAllocation(TenantModel):
    receipt_item = models.OneToOneField(GoodsReceiptItem, on_delete=models.CASCADE, related_name="landed_cost_allocation")
    method = models.CharField(max_length=16, choices=LandedCostAllocationMethod.choices)
    freight_base = non_negative_decimal_field()
    customs_base = non_negative_decimal_field()
    port_handling_base = non_negative_decimal_field()
    insurance_base = non_negative_decimal_field()
    remainder_cents = models.JSONField(default=dict)

    @property
    def total_base(self):
        return self.freight_base + self.customs_base + self.port_handling_base + self.insurance_base


class VendorPayment(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="payments")
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, null=True, blank=True, related_name="payments")
    payment_method = models.CharField(max_length=20, choices=[(PaymentMethod.CASH.value, PaymentMethod.CASH.label), (PaymentMethod.BANK.value, PaymentMethod.BANK.label), (PaymentMethod.MOBILE_BANKING.value, PaymentMethod.MOBILE_BANKING.label)])
    payment_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, related_name="vendor_payments")
    amount = positive_decimal_field()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    exchange_rate = positive_decimal_field(default=Decimal("1.0000"))
    amount_base = positive_decimal_field()
    paid_at = models.DateTimeField(db_index=True)
    reference = models.CharField(max_length=120)
    notes = models.TextField(blank=True)
    journal_entry = models.OneToOneField("finance.JournalEntry", on_delete=models.PROTECT, related_name="vendor_payment")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="procurement_vendor_payment_unique")]
        indexes = [models.Index(fields=["organization", "vendor", "paid_at"], name="procurement_vendor_payment_idx")]
