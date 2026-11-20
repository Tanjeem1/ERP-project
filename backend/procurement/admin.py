from django.contrib import admin

from .models import GoodsReceiptItem, GoodsReceiptNote, LandedCostAllocation, PurchaseOrder, PurchaseOrderItem, Vendor, VendorPayment


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "organization", "currency", "payment_terms_days", "payable_balance", "status")
    list_filter = ("status", "currency", "country_code")
    search_fields = ("code", "name", "contact_name", "email")


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("number", "vendor", "status", "currency", "total_amount", "expected_at")
    list_filter = ("status", "currency", "approval_status")
    search_fields = ("number", "reference", "vendor__name")
    inlines = [PurchaseOrderItemInline]


class GoodsReceiptItemInline(admin.TabularInline):
    model = GoodsReceiptItem
    extra = 0


@admin.register(GoodsReceiptNote)
class GoodsReceiptNoteAdmin(admin.ModelAdmin):
    list_display = ("number", "purchase_order_number", "warehouse", "allocation_method", "total_inventory_base", "received_at")
    list_filter = ("allocation_method", "warehouse", "received_at")
    inlines = [GoodsReceiptItemInline]


@admin.register(LandedCostAllocation)
class LandedCostAllocationAdmin(admin.ModelAdmin):
    list_display = ("receipt_item", "method", "freight_base", "customs_base", "port_handling_base", "insurance_base")


@admin.register(VendorPayment)
class VendorPaymentAdmin(admin.ModelAdmin):
    list_display = ("number", "vendor", "payment_method", "amount", "currency", "amount_base", "paid_at")
    list_filter = ("payment_method", "currency", "paid_at")
    readonly_fields = [field.name for field in VendorPayment._meta.fields]
