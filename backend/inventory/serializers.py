from decimal import Decimal

from rest_framework import serializers

from core.api import CurrencyField, address_value, decimal_number, minor, order_channel_label
from core.services.actors import Permission, ROLE_PERMISSIONS
from inventory.models import InventoryLayer, SKU, StockAdjustment, StockBalance, StockReservation, StockTransfer, Warehouse


class WarehouseSerializer(serializers.ModelSerializer):
    address = serializers.SerializerMethodField()
    capacityCbm = serializers.SerializerMethodField()
    temperatureControlled = serializers.BooleanField(source="temperature_controlled", read_only=True)
    type = serializers.CharField(source="get_type_display", read_only=True)
    status = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Warehouse
        fields = ["id", "code", "name", "type", "address", "capacityCbm", "temperatureControlled", "status"]

    def get_address(self, instance) -> dict:
        return address_value(instance)

    def get_capacityCbm(self, instance) -> float:
        return decimal_number(instance.capacity_cbm)


class WarehouseMasterInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=160)
    type = serializers.ChoiceField(choices=["BONDED", "DISTRIBUTION", "FULFILLMENT"])
    address = serializers.DictField(required=False, default=dict)
    capacityCbm = serializers.DecimalField(source="capacity_cbm", max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    temperatureControlled = serializers.BooleanField(source="temperature_controlled", required=False, default=False)
    status = serializers.ChoiceField(choices=["ACTIVE", "INACTIVE"], required=False, default="ACTIVE")

    def validate_address(self, value):
        from core.api import address_input

        return address_input(value)


class ProductSerializer(serializers.ModelSerializer):
    unitOfMeasure = serializers.CharField(source="unit_of_measure", read_only=True)
    weightKgPerUnit = serializers.SerializerMethodField()
    volumeCbmPerUnit = serializers.SerializerMethodField()
    salesPriceMinor = serializers.SerializerMethodField()
    costPriceMinor = serializers.SerializerMethodField()
    salesCurrency = serializers.CharField(source="currency", read_only=True)
    vatRateBasisPoints = serializers.SerializerMethodField()
    reorderPoint = serializers.SerializerMethodField()
    preferredSupplierId = serializers.UUIDField(source="preferred_vendor_id", read_only=True)
    active = serializers.BooleanField(source="is_active", read_only=True)

    class Meta:
        model = SKU
        fields = [
            "id", "sku", "name", "category", "description", "unitOfMeasure", "weightKgPerUnit", "volumeCbmPerUnit",
            "salesPriceMinor", "costPriceMinor", "salesCurrency", "barcode", "vatRateBasisPoints", "reorderPoint",
            "preferredSupplierId", "active",
        ]

    def get_weightKgPerUnit(self, instance) -> float:
        return decimal_number(instance.weight_kg)

    def get_volumeCbmPerUnit(self, instance) -> float:
        return decimal_number(instance.volume_cbm)

    def get_salesPriceMinor(self, instance) -> int:
        return minor(instance.selling_price)

    def get_costPriceMinor(self, instance) -> int | None:
        actor = self.context.get("actor")
        if not actor or not ROLE_PERMISSIONS.get(actor.role, {}).get(Permission.VIEW_COST_PRICES, False):
            return None
        return minor(instance.cost_price)

    def get_vatRateBasisPoints(self, instance) -> int:
        return int(instance.tax_rate * 100)

    def get_reorderPoint(self, instance) -> int:
        return int(instance.reorder_level)


class ProductMasterInputSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=180)
    category = serializers.CharField(max_length=120)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    unitOfMeasure = serializers.CharField(source="unit_of_measure", max_length=32)
    barcode = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    vatRateBasisPoints = serializers.IntegerField(source="tax_rate", min_value=0, max_value=10000, required=False, default=0)
    reorderPoint = serializers.IntegerField(source="reorder_level", min_value=0, required=False, default=0)
    weightKgPerUnit = serializers.DecimalField(source="weight_kg", max_digits=18, decimal_places=4, min_value=Decimal("0"))
    volumeCbmPerUnit = serializers.DecimalField(source="volume_cbm", max_digits=18, decimal_places=4, min_value=Decimal("0"))
    costPriceMinor = serializers.IntegerField(source="cost_price", min_value=0, required=False, default=0)
    salesPriceMinor = serializers.IntegerField(source="selling_price", min_value=0)
    salesCurrency = CurrencyField(source="currency")
    preferredSupplierId = serializers.UUIDField(source="preferred_vendor_id")
    active = serializers.BooleanField(source="is_active", required=False)

    def validate_vatRateBasisPoints(self, value):
        return Decimal(value) / 100

    def validate_costPriceMinor(self, value):
        from core.services.money import from_minor_units

        return from_minor_units(value)

    def validate_salesPriceMinor(self, value):
        from core.services.money import from_minor_units

        return from_minor_units(value)


class StockBalanceSerializer(serializers.ModelSerializer):
    productId = serializers.UUIDField(source="sku_id", read_only=True)
    warehouseId = serializers.UUIDField(source="warehouse_id", read_only=True)
    onHand = serializers.SerializerMethodField()
    reserved = serializers.SerializerMethodField()
    availableToPromise = serializers.SerializerMethodField()
    inTransit = serializers.SerializerMethodField()
    reorderPoint = serializers.SerializerMethodField()
    currentFifoValueMinor = serializers.SerializerMethodField()
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = StockBalance
        fields = ["id", "productId", "warehouseId", "onHand", "reserved", "availableToPromise", "inTransit", "reorderPoint", "currentFifoValueMinor", "updatedAt"]

    def get_onHand(self, instance) -> int:
        return int(instance.on_hand)

    def get_reserved(self, instance) -> int:
        return int(instance.reserved)

    def get_availableToPromise(self, instance) -> int:
        return int(instance.available_to_promise)

    def get_inTransit(self, instance) -> int:
        return int(instance.in_transit)

    def get_reorderPoint(self, instance) -> int:
        return int(instance.reorder_level)

    def get_currentFifoValueMinor(self, instance) -> int | None:
        actor = self.context.get("actor")
        if not actor or not ROLE_PERMISSIONS.get(actor.role, {}).get(Permission.VIEW_COST_PRICES, False):
            return None
        return minor(getattr(instance, "fifo_value", Decimal("0.00")))


class InventoryLayerSerializer(serializers.ModelSerializer):
    batchCode = serializers.CharField(source="batch_code", read_only=True)
    productId = serializers.UUIDField(source="sku_id", read_only=True)
    warehouseId = serializers.UUIDField(source="warehouse_id", read_only=True)
    purchaseOrderId = serializers.UUIDField(source="purchase_order_id", allow_null=True)
    goodsReceiptId = serializers.UUIDField(source="goods_receipt_id", allow_null=True)
    receivedAt = serializers.DateTimeField(source="received_at", read_only=True)
    expiresAt = serializers.DateTimeField(source="expires_at", read_only=True, allow_null=True)
    initialQuantity = serializers.SerializerMethodField()
    remainingQuantity = serializers.SerializerMethodField()
    sourceUnitCostMinor = serializers.SerializerMethodField()
    sourceCurrency = serializers.CharField(source="source_currency", read_only=True)
    unitCostMinor = serializers.SerializerMethodField()
    allocatedLandedUnitCostMinor = serializers.SerializerMethodField()
    remainingValueMinor = serializers.SerializerMethodField()

    class Meta:
        model = InventoryLayer
        fields = [
            "id", "productId", "warehouseId", "purchaseOrderId", "goodsReceiptId", "batchCode", "receivedAt",
            "expiresAt", "initialQuantity", "remainingQuantity", "sourceUnitCostMinor", "sourceCurrency",
            "unitCostMinor", "allocatedLandedUnitCostMinor", "remainingValueMinor",
        ]

    def get_initialQuantity(self, instance) -> int:
        return int(instance.initial_quantity)

    def get_remainingQuantity(self, instance) -> int:
        return int(instance.remaining_quantity)

    def get_sourceUnitCostMinor(self, instance) -> int:
        return minor(instance.source_unit_cost)

    def get_unitCostMinor(self, instance) -> int:
        return minor(instance.unit_cost)

    def get_allocatedLandedUnitCostMinor(self, instance) -> int:
        return minor(instance.allocated_landed_unit_cost)

    def get_remainingValueMinor(self, instance) -> int:
        return minor(instance.remaining_value)


class ReservationSerializer(serializers.ModelSerializer):
    productId = serializers.UUIDField(source="sku_id", read_only=True)
    warehouseId = serializers.UUIDField(source="warehouse_id", read_only=True)
    channel = serializers.SerializerMethodField()
    quantity = serializers.SerializerMethodField()
    status = serializers.CharField(source="get_status_display", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    expiresAt = serializers.DateTimeField(source="expires_at", read_only=True)
    resolvedAt = serializers.DateTimeField(source="resolved_at", read_only=True, allow_null=True)

    class Meta:
        model = StockReservation
        fields = ["id", "reference", "productId", "warehouseId", "channel", "quantity", "status", "createdAt", "expiresAt", "resolvedAt"]

    def get_channel(self, instance) -> str:
        return "Manual" if instance.channel == "MANUAL" else order_channel_label(instance.channel)

    def get_quantity(self, instance) -> int:
        return int(instance.quantity)


class StockTransferSerializer(serializers.ModelSerializer):
    sourceWarehouseId = serializers.UUIDField(source="source_warehouse_id", read_only=True)
    destinationWarehouseId = serializers.UUIDField(source="destination_warehouse_id", read_only=True)
    status = serializers.CharField(source="get_status_display", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    lines = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = ["id", "number", "sourceWarehouseId", "destinationWarehouseId", "status", "createdAt", "lines"]

    def get_lines(self, instance) -> list[dict]:
        return [
            {
                "productId": str(item.sku_id),
                "quantity": int(item.quantity),
                "costLayerIds": [str(allocation.source_layer_id) for allocation in item.layer_allocations.all()],
                "valueMinor": minor(item.value),
            }
            for item in instance.items.all()
        ]


class StockAdjustmentSerializer(serializers.ModelSerializer):
    warehouseId = serializers.UUIDField(source="warehouse_id", read_only=True)
    productId = serializers.UUIDField(source="sku_id", read_only=True)
    systemQuantity = serializers.SerializerMethodField()
    countedQuantity = serializers.SerializerMethodField()
    deltaQuantity = serializers.SerializerMethodField()
    valueDeltaBaseMinor = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    createdByRole = serializers.SerializerMethodField()
    journalEntryId = serializers.UUIDField(source="journal_entry_id", allow_null=True)

    class Meta:
        model = StockAdjustment
        fields = ["id", "number", "warehouseId", "productId", "systemQuantity", "countedQuantity", "deltaQuantity", "valueDeltaBaseMinor", "reason", "createdAt", "createdByRole", "journalEntryId"]

    def get_systemQuantity(self, instance) -> int:
        return int(instance.system_quantity)

    def get_countedQuantity(self, instance) -> int:
        return int(instance.counted_quantity)

    def get_deltaQuantity(self, instance) -> int:
        return int(instance.delta_quantity)

    def get_valueDeltaBaseMinor(self, instance) -> int:
        return minor(instance.value_delta)

    def get_createdByRole(self, instance) -> str:
        from core.api import role_label

        return role_label(instance.created_by_role)


class ReserveStockInputSerializer(serializers.Serializer):
    productId = serializers.UUIDField()
    warehouseId = serializers.UUIDField()
    channel = serializers.ChoiceField(choices=["B2B", "SHOPIFY", "DIRECT", "MANUAL", "POS"])
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    quantity = serializers.IntegerField(min_value=1)
    expiresAt = serializers.DateTimeField(required=False, allow_null=True)


class TransferLineInputSerializer(serializers.Serializer):
    productId = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class StockTransferInputSerializer(serializers.Serializer):
    sourceWarehouseId = serializers.UUIDField()
    destinationWarehouseId = serializers.UUIDField()
    lines = TransferLineInputSerializer(many=True, min_length=1)

    def validate_lines(self, value):
        if len({line["productId"] for line in value}) != len(value):
            raise serializers.ValidationError("Each SKU can appear only once in a transfer.")
        return value


class StockAdjustmentInputSerializer(serializers.Serializer):
    warehouseId = serializers.UUIDField()
    productId = serializers.UUIDField()
    countedQuantity = serializers.IntegerField(min_value=0)
    reason = serializers.CharField(max_length=500)
    adjustmentType = serializers.ChoiceField(choices=["CYCLE_COUNT", "SHRINKAGE", "DAMAGE"], required=False, default="CYCLE_COUNT")


class FifoSimulationInputSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)
