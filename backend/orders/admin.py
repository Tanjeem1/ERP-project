from django.contrib import admin

from .models import CreditNote, Customer, CustomerPayment, Invoice, InvoiceLine, PaymentAllocation, SalesOrder, SalesOrderItem, SalesReturn, SalesReturnItem


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "organization", "credit_limit", "receivable_balance", "payment_terms_days", "currency")
    list_filter = ("currency", "payment_terms_days")
    search_fields = ("code", "name", "contact_name", "email")


class SalesOrderItemInline(admin.TabularInline):
    model = SalesOrderItem
    extra = 0


@admin.register(SalesOrder)
class SalesOrderAdmin(admin.ModelAdmin):
    list_display = ("number", "customer", "channel", "status", "total_base", "created_at")
    list_filter = ("channel", "status", "approval_status", "currency")
    search_fields = ("number", "reference", "customer__name")
    inlines = [SalesOrderItemInline]


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0
    readonly_fields = [field.name for field in InvoiceLine._meta.fields]


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("number", "order_number", "customer", "status", "total_base", "issued_at", "due_at")
    list_filter = ("status", "currency", "issued_at", "due_at")
    search_fields = ("number", "order_number", "customer__name")
    inlines = [InvoiceLineInline]


class PaymentAllocationInline(admin.TabularInline):
    model = PaymentAllocation
    extra = 0
    readonly_fields = [field.name for field in PaymentAllocation._meta.fields]


@admin.register(CustomerPayment)
class CustomerPaymentAdmin(admin.ModelAdmin):
    list_display = ("number", "customer", "payment_method", "amount_base", "received_at", "status")
    list_filter = ("payment_method", "status", "received_at")
    readonly_fields = [field.name for field in CustomerPayment._meta.fields]
    inlines = [PaymentAllocationInline]


class SalesReturnItemInline(admin.TabularInline):
    model = SalesReturnItem
    extra = 0
    readonly_fields = [field.name for field in SalesReturnItem._meta.fields]


@admin.register(SalesReturn)
class SalesReturnAdmin(admin.ModelAdmin):
    list_display = ("number", "order_number", "customer", "status", "restored_value_base", "shrinkage_base", "created_at")
    list_filter = ("status", "created_at")
    inlines = [SalesReturnItemInline]


@admin.register(CreditNote)
class CreditNoteAdmin(admin.ModelAdmin):
    list_display = ("number", "customer", "invoice", "amount_base", "issued_at", "status")
    list_filter = ("status", "issued_at")
    readonly_fields = [field.name for field in CreditNote._meta.fields]
