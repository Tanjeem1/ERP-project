from django.contrib import admin

from .models import InventoryLayer, SKU, StockAdjustment, StockBalance, StockReservation, StockTransfer, StockTransferItem, StockTransferLayer, Warehouse


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "organization", "type", "status", "capacity_cbm")
    list_filter = ("type", "status")
    search_fields = ("code", "name")


@admin.register(SKU)
class SKUAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "organization", "selling_price", "currency", "is_active")
    list_filter = ("is_active", "currency", "category")
    search_fields = ("sku", "name", "barcode")


@admin.register(StockBalance)
class StockBalanceAdmin(admin.ModelAdmin):
    list_display = ("sku", "warehouse", "on_hand", "reserved", "in_transit", "reorder_level")
    list_filter = ("warehouse",)
    search_fields = ("sku__sku", "sku__name")


@admin.register(InventoryLayer)
class InventoryLayerAdmin(admin.ModelAdmin):
    list_display = ("batch_code", "sku", "warehouse", "remaining_quantity", "unit_cost", "remaining_value", "received_at")
    list_filter = ("warehouse", "received_at")
    search_fields = ("batch_code", "sku__sku")


@admin.register(StockReservation)
class StockReservationAdmin(admin.ModelAdmin):
    list_display = ("reference", "sku", "warehouse", "channel", "quantity", "status", "expires_at")
    list_filter = ("channel", "status")


class StockTransferItemInline(admin.TabularInline):
    model = StockTransferItem
    extra = 0


@admin.register(StockTransfer)
class StockTransferAdmin(admin.ModelAdmin):
    list_display = ("number", "source_warehouse", "destination_warehouse", "status", "created_at")
    inlines = [StockTransferItemInline]


@admin.register(StockTransferLayer)
class StockTransferLayerAdmin(admin.ModelAdmin):
    list_display = ("transfer_item", "source_layer", "destination_layer", "quantity", "unit_cost", "value")


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(admin.ModelAdmin):
    list_display = ("number", "warehouse", "sku", "system_quantity", "counted_quantity", "delta_quantity", "created_at")
    list_filter = ("adjustment_type", "created_at")
    readonly_fields = [field.name for field in StockAdjustment._meta.fields]
