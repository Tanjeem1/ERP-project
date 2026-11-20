from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from simple_history.models import HistoricalRecords

from core.models import ActorModel, AddressModel, ApprovalStatus, Currency, PaymentMethod, PaymentStatus, TenantModel, decimal_field, non_negative_decimal_field, positive_decimal_field


class OrderChannel(models.TextChoices):
    B2B = "B2B", "B2B Wholesale"
    SHOPIFY = "SHOPIFY", "Shopify Sync"
    DIRECT = "DIRECT", "Direct Import"
    POS = "POS", "Point of Sale"


class OrderStatus(models.TextChoices):
    PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
    ORDER_PLACED = "ORDER_PLACED", "Order Placed"
    PICK_PACK = "PICK_PACK", "Pick & Pack"
    SHIPPED = "SHIPPED", "Shipped"
    INVOICED = "INVOICED", "Invoiced"
    CANCELLED = "CANCELLED", "Cancelled"


class InvoiceStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ISSUED = "ISSUED", "Issued"
    PAID = "PAID", "Paid"
    VOID = "VOID", "Void"


class ReturnCondition(models.TextChoices):
    RESTOCKABLE = "RESTOCKABLE", "Restockable"
    DAMAGED_EXPIRED = "DAMAGED_EXPIRED", "Damaged/Expired"


class SalesReturnStatus(models.TextChoices):
    COMPLETED = "COMPLETED", "Completed"


class CreditNoteStatus(models.TextChoices):
    ISSUED = "ISSUED", "Issued"


class Customer(AddressModel, TenantModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=180)
    contact_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.USD)
    payment_terms_days = models.PositiveSmallIntegerField(default=30)
    tax_rate = decimal_field(default=Decimal("0.0000"), validators=[MinValueValidator(Decimal("0.0000")), MaxValueValidator(Decimal("100.0000"))])
    credit_limit = non_negative_decimal_field()
    receivable_balance = non_negative_decimal_field()

    history = HistoricalRecords()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "code"], name="orders_customer_code_unique")]
        indexes = [GinIndex(fields=["name", "code", "contact_name"], name="orders_customer_search_trgm", opclasses=["gin_trgm_ops", "gin_trgm_ops", "gin_trgm_ops"])]

    def __str__(self):
        return self.name


class SalesOrder(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="sales_orders")
    warehouse = models.ForeignKey("inventory.Warehouse", on_delete=models.PROTECT, related_name="sales_orders")
    channel = models.CharField(max_length=16, choices=OrderChannel.choices)
    status = models.CharField(max_length=24, choices=OrderStatus.choices, default=OrderStatus.ORDER_PLACED, db_index=True)
    approval_status = models.CharField(max_length=20, choices=ApprovalStatus.choices, default=ApprovalStatus.NOT_REQUIRED)
    approval_reason = models.TextField(blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="approved_sales_orders")
    approved_by_role = models.CharField(max_length=32, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    exchange_rate = positive_decimal_field(default=Decimal("1.0000"))
    reference = models.CharField(max_length=120)
    subtotal = non_negative_decimal_field()
    tax_amount = non_negative_decimal_field()
    total_amount = non_negative_decimal_field()
    subtotal_base = non_negative_decimal_field()
    tax_base = non_negative_decimal_field()
    total_base = non_negative_decimal_field()
    shipped_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)

    history = HistoricalRecords()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="orders_sales_order_number_unique")]
        indexes = [
            models.Index(fields=["organization", "status", "created_at"], name="orders_so_status_idx"),
            models.Index(fields=["organization", "customer", "created_at"], name="orders_so_customer_idx"),
            GinIndex(fields=["number", "reference"], name="orders_so_search_trgm", opclasses=["gin_trgm_ops", "gin_trgm_ops"]),
        ]


class SalesOrderItem(TenantModel):
    sales_order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name="items")
    sku = models.ForeignKey("inventory.SKU", on_delete=models.PROTECT, related_name="sales_order_items")
    quantity = positive_decimal_field()
    shipped_quantity = non_negative_decimal_field()
    unit_price = non_negative_decimal_field()
    reservation = models.OneToOneField("inventory.StockReservation", on_delete=models.PROTECT, null=True, blank=True, related_name="order_line")
    cogs_base = non_negative_decimal_field()
    returned_quantity = non_negative_decimal_field()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["sales_order", "sku"], name="orders_sales_order_sku_unique"),
            models.CheckConstraint(condition=models.Q(shipped_quantity__lte=models.F("quantity")), name="orders_shipped_lte_ordered"),
            models.CheckConstraint(condition=models.Q(returned_quantity__lte=models.F("shipped_quantity")), name="orders_returned_lte_shipped"),
        ]
        indexes = [models.Index(fields=["organization", "sku", "sales_order"], name="orders_item_purchase_idx")]


class Invoice(AddressModel, TenantModel):
    number = models.CharField(max_length=48)
    sales_order = models.OneToOneField(SalesOrder, on_delete=models.PROTECT, related_name="invoice")
    order_number = models.CharField(max_length=48)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="invoices")
    status = models.CharField(max_length=16, choices=InvoiceStatus.choices, default=InvoiceStatus.ISSUED, db_index=True)
    currency = models.CharField(max_length=3, choices=Currency.choices)
    exchange_rate = positive_decimal_field(default=Decimal("1.0000"))
    issued_at = models.DateTimeField(db_index=True)
    due_at = models.DateTimeField(db_index=True)
    subtotal = non_negative_decimal_field()
    tax_amount = non_negative_decimal_field()
    total_amount = non_negative_decimal_field()
    subtotal_base = non_negative_decimal_field()
    tax_base = non_negative_decimal_field()
    total_base = non_negative_decimal_field()
    cogs_base = non_negative_decimal_field()
    journal_entries = models.ManyToManyField("finance.JournalEntry", related_name="invoices", blank=True)
    pdf_file = models.FileField(upload_to="invoices/%Y/%m/", blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="orders_invoice_number_unique")]
        indexes = [
            models.Index(fields=["organization", "customer", "issued_at"], name="orders_invoice_ar_aging_idx"),
            models.Index(fields=["organization", "status", "due_at"], name="orders_invoice_overdue_idx"),
            GinIndex(fields=["number", "order_number"], name="orders_invoice_search_trgm", opclasses=["gin_trgm_ops", "gin_trgm_ops"]),
        ]


class InvoiceLine(TenantModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    sku = models.ForeignKey("inventory.SKU", on_delete=models.PROTECT, related_name="invoice_lines")
    description = models.CharField(max_length=255)
    quantity = positive_decimal_field()
    unit_price = non_negative_decimal_field()
    total_price = non_negative_decimal_field()
    position = models.PositiveSmallIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["invoice", "sku"], name="orders_invoice_sku_unique"),
            models.UniqueConstraint(fields=["invoice", "position"], name="orders_invoice_line_position_unique"),
        ]


class CustomerPayment(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="payments")
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    payment_account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, related_name="customer_payments")
    amount = positive_decimal_field()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    exchange_rate = positive_decimal_field(default=Decimal("1.0000"))
    amount_base = positive_decimal_field()
    received_at = models.DateTimeField(db_index=True)
    reference = models.CharField(max_length=120)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=PaymentStatus.choices, default=PaymentStatus.POSTED, db_index=True)
    journal_entry = models.OneToOneField("finance.JournalEntry", on_delete=models.PROTECT, related_name="customer_payment")
    reversal_journal_entry = models.OneToOneField("finance.JournalEntry", on_delete=models.PROTECT, null=True, blank=True, related_name="customer_payment_reversal")
    replaced_by_payment = models.OneToOneField("self", on_delete=models.PROTECT, null=True, blank=True, related_name="replacement_of")
    reversal_of_payment = models.OneToOneField("self", on_delete=models.PROTECT, null=True, blank=True, related_name="reversal")
    receipt_file = models.FileField(upload_to="receipts/%Y/%m/", blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="orders_customer_payment_unique")]
        indexes = [
            models.Index(fields=["organization", "customer", "received_at"], name="orders_collection_cutoff_idx"),
            models.Index(fields=["organization", "status", "received_at"], name="orders_collection_status_idx"),
        ]


class PaymentAllocation(TenantModel):
    payment = models.ForeignKey(CustomerPayment, on_delete=models.CASCADE, related_name="allocations")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payment_allocations")
    amount_base = positive_decimal_field()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["payment", "invoice"], name="orders_payment_invoice_unique")]
        indexes = [models.Index(fields=["organization", "invoice"], name="orders_pay_alloc_invoice_idx")]


class SalesReturn(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    sales_order = models.ForeignKey(SalesOrder, on_delete=models.PROTECT, related_name="returns")
    order_number = models.CharField(max_length=48)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="returns")
    warehouse = models.ForeignKey("inventory.Warehouse", on_delete=models.PROTECT, related_name="sales_returns")
    reason = models.TextField()
    status = models.CharField(max_length=16, choices=SalesReturnStatus.choices, default=SalesReturnStatus.COMPLETED)
    restored_value_base = non_negative_decimal_field()
    shrinkage_base = non_negative_decimal_field()
    journal_entries = models.ManyToManyField("finance.JournalEntry", related_name="sales_returns", blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="orders_return_number_unique")]
        indexes = [models.Index(fields=["organization", "sales_order", "created_at"], name="orders_return_order_idx")]


class SalesReturnItem(TenantModel):
    sales_return = models.ForeignKey(SalesReturn, on_delete=models.CASCADE, related_name="items")
    order_item = models.ForeignKey(SalesOrderItem, on_delete=models.PROTECT, related_name="return_items")
    sku = models.ForeignKey("inventory.SKU", on_delete=models.PROTECT, related_name="return_items")
    quantity = positive_decimal_field()
    condition = models.CharField(max_length=20, choices=ReturnCondition.choices)
    unit_price = non_negative_decimal_field()
    unit_cost_base = non_negative_decimal_field()
    restored_layer = models.OneToOneField("inventory.InventoryLayer", on_delete=models.PROTECT, null=True, blank=True, related_name="return_item")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["sales_return", "order_item", "condition"], name="orders_return_line_condition_unique")]


class CreditNote(TenantModel):
    number = models.CharField(max_length=48)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="credit_notes")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, null=True, blank=True, related_name="credit_notes")
    sales_return = models.OneToOneField(SalesReturn, on_delete=models.PROTECT, related_name="credit_note")
    amount_base = positive_decimal_field()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    issued_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=16, choices=CreditNoteStatus.choices, default=CreditNoteStatus.ISSUED)
    journal_entry = models.OneToOneField("finance.JournalEntry", on_delete=models.PROTECT, related_name="credit_note")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="orders_credit_note_unique")]
        indexes = [models.Index(fields=["organization", "customer", "issued_at"], name="orders_credit_customer_idx")]
