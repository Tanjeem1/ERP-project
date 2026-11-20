from decimal import Decimal

from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from simple_history.models import HistoricalRecords

from core.models import ActorModel, AddressModel, Currency, TenantModel, decimal_field, non_negative_decimal_field, positive_decimal_field


class WarehouseType(models.TextChoices):
    BONDED = "BONDED", "Bonded"
    DISTRIBUTION = "DISTRIBUTION", "Distribution"
    FULFILLMENT = "FULFILLMENT", "Fulfillment"


class WarehouseStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class ReservationChannel(models.TextChoices):
    B2B = "B2B", "B2B Wholesale"
    SHOPIFY = "SHOPIFY", "Shopify Sync"
    DIRECT = "DIRECT", "Direct Import"
    MANUAL = "MANUAL", "Manual"
    POS = "POS", "Point of Sale"


class ReservationStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    CONSUMED = "CONSUMED", "Consumed"
    RELEASED = "RELEASED", "Released"


class TransferStatus(models.TextChoices):
    COMPLETED = "COMPLETED", "Completed"


class StockAdjustmentType(models.TextChoices):
    CYCLE_COUNT = "CYCLE_COUNT", "Cycle Count"
    SHRINKAGE = "SHRINKAGE", "Shrinkage"
    DAMAGE = "DAMAGE", "Damage"


class Warehouse(AddressModel, TenantModel):
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=160)
    type = models.CharField(max_length=20, choices=WarehouseType.choices, default=WarehouseType.DISTRIBUTION)
    capacity_cbm = non_negative_decimal_field()
    temperature_controlled = models.BooleanField(default=False)
    status = models.CharField(max_length=16, choices=WarehouseStatus.choices, default=WarehouseStatus.ACTIVE, db_index=True)

    history = HistoricalRecords()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "code"], name="inventory_warehouse_code_unique")]
        indexes = [GinIndex(fields=["name"], name="inventory_warehouse_name_trgm", opclasses=["gin_trgm_ops"])]

    def __str__(self):
        return f"{self.code} · {self.name}"


class SKU(TenantModel):
    sku = models.CharField(max_length=64)
    name = models.CharField(max_length=180)
    category = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    unit_of_measure = models.CharField(max_length=32, default="unit")
    barcode = models.CharField(max_length=128, blank=True)
    tax_rate = decimal_field(default=Decimal("0.0000"), validators=[MinValueValidator(Decimal("0.0000")), MaxValueValidator(Decimal("100.0000"))])
    reorder_level = non_negative_decimal_field()
    weight_kg = non_negative_decimal_field()
    volume_cbm = non_negative_decimal_field()
    cost_price = non_negative_decimal_field()
    selling_price = non_negative_decimal_field()
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.USD)
    preferred_vendor = models.ForeignKey("procurement.Vendor", on_delete=models.PROTECT, related_name="preferred_skus")
    is_active = models.BooleanField(default=True, db_index=True)

    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "sku"], name="inventory_sku_code_unique"),
            models.UniqueConstraint(fields=["organization", "barcode"], condition=models.Q(barcode__gt=""), name="inventory_sku_barcode_unique"),
        ]
        indexes = [GinIndex(fields=["sku", "name", "barcode"], name="inventory_sku_search_trgm", opclasses=["gin_trgm_ops", "gin_trgm_ops", "gin_trgm_ops"])]

    def __str__(self):
        return f"{self.sku} · {self.name}"


class StockBalance(TenantModel):
    sku = models.ForeignKey(SKU, on_delete=models.PROTECT, related_name="stock_balances")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="stock_balances")
    on_hand = non_negative_decimal_field()
    reserved = non_negative_decimal_field()
    in_transit = non_negative_decimal_field()
    reorder_level = non_negative_decimal_field()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "sku", "warehouse"], name="inventory_balance_position_unique"),
            models.CheckConstraint(condition=models.Q(reserved__lte=models.F("on_hand")), name="inventory_reserved_not_above_on_hand"),
        ]
        indexes = [models.Index(fields=["organization", "warehouse", "sku"], name="inventory_balance_matrix_idx")]

    @property
    def available_to_promise(self):
        return self.on_hand - self.reserved


class InventoryLayer(TenantModel):
    sku = models.ForeignKey(SKU, on_delete=models.PROTECT, related_name="inventory_layers")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="inventory_layers")
    purchase_order = models.ForeignKey("procurement.PurchaseOrder", on_delete=models.PROTECT, null=True, blank=True, related_name="inventory_layers")
    goods_receipt = models.ForeignKey("procurement.GoodsReceiptNote", on_delete=models.PROTECT, null=True, blank=True, related_name="inventory_layers")
    batch_code = models.CharField(max_length=80)
    received_at = models.DateTimeField(db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    initial_quantity = positive_decimal_field()
    remaining_quantity = non_negative_decimal_field()
    source_unit_cost = non_negative_decimal_field()
    source_currency = models.CharField(max_length=3, choices=Currency.choices)
    unit_cost = non_negative_decimal_field()
    allocated_landed_unit_cost = non_negative_decimal_field()
    remaining_value = non_negative_decimal_field()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "sku", "warehouse", "batch_code"], name="inventory_layer_batch_unique"),
            models.CheckConstraint(condition=models.Q(remaining_quantity__lte=models.F("initial_quantity")), name="inventory_layer_remaining_lte_initial"),
        ]
        indexes = [models.Index(fields=["organization", "sku", "warehouse", "received_at"], name="inventory_layer_fifo_idx")]


class StockReservation(ActorModel, TenantModel):
    reference = models.CharField(max_length=120)
    sku = models.ForeignKey(SKU, on_delete=models.PROTECT, related_name="reservations")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="reservations")
    sales_order_item = models.OneToOneField("orders.SalesOrderItem", on_delete=models.PROTECT, null=True, blank=True, related_name="order_item")
    channel = models.CharField(max_length=16, choices=ReservationChannel.choices)
    quantity = positive_decimal_field()
    status = models.CharField(max_length=16, choices=ReservationStatus.choices, default=ReservationStatus.ACTIVE, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["organization", "status", "expires_at"], name="inv_reservation_active_idx")]


class StockTransfer(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    source_warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="outgoing_transfers")
    destination_warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="incoming_transfers")
    status = models.CharField(max_length=16, choices=TransferStatus.choices, default=TransferStatus.COMPLETED)
    notes = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "number"], name="inventory_transfer_number_unique"),
            models.CheckConstraint(condition=~models.Q(source_warehouse=models.F("destination_warehouse")), name="inventory_transfer_distinct_warehouses"),
        ]
        indexes = [models.Index(fields=["organization", "created_at"], name="inventory_transfer_created_idx")]


class StockTransferItem(TenantModel):
    transfer = models.ForeignKey(StockTransfer, on_delete=models.CASCADE, related_name="items")
    sku = models.ForeignKey(SKU, on_delete=models.PROTECT, related_name="transfer_items")
    quantity = positive_decimal_field()
    value = non_negative_decimal_field()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["transfer", "sku"], name="inventory_transfer_sku_unique")]


class StockTransferLayer(TenantModel):
    transfer_item = models.ForeignKey(StockTransferItem, on_delete=models.CASCADE, related_name="layer_allocations")
    source_layer = models.ForeignKey(InventoryLayer, on_delete=models.PROTECT, related_name="transfer_sources")
    destination_layer = models.ForeignKey(InventoryLayer, on_delete=models.PROTECT, null=True, blank=True, related_name="transfer_destinations")
    quantity = positive_decimal_field()
    unit_cost = non_negative_decimal_field()
    value = non_negative_decimal_field()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["transfer_item", "source_layer"], name="inventory_transfer_layer_unique")]


class StockAdjustment(ActorModel, TenantModel):
    number = models.CharField(max_length=48)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="stock_adjustments")
    sku = models.ForeignKey(SKU, on_delete=models.PROTECT, related_name="stock_adjustments")
    system_quantity = non_negative_decimal_field()
    counted_quantity = non_negative_decimal_field()
    delta_quantity = decimal_field()
    value_delta = decimal_field()
    reason = models.TextField()
    adjustment_type = models.CharField(max_length=20, choices=StockAdjustmentType.choices, default=StockAdjustmentType.CYCLE_COUNT)
    journal_entry = models.OneToOneField("finance.JournalEntry", on_delete=models.PROTECT, related_name="stock_adjustment", null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "number"], name="inventory_adjustment_number_unique")]
        indexes = [models.Index(fields=["organization", "warehouse", "sku", "created_at"], name="inv_adjustment_history_idx")]
