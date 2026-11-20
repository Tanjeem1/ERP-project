from django.contrib import admin

from .models import Account, JournalEntry, JournalLine, OperatingExpense


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "organization", "group", "normal_balance", "balance", "is_active")
    list_filter = ("group", "normal_balance", "is_active")
    search_fields = ("code", "name")


class JournalLineInline(admin.TabularInline):
    model = JournalLine
    extra = 0
    can_delete = False
    readonly_fields = [field.name for field in JournalLine._meta.fields]

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(JournalEntry)
class JournalEntryAdmin(admin.ModelAdmin):
    list_display = ("number", "source_number", "source_type", "status", "total_debit", "total_credit", "timestamp")
    list_filter = ("status", "source_type", "currency", "timestamp")
    search_fields = ("number", "source_number", "description")
    readonly_fields = [field.name for field in JournalEntry._meta.fields]
    inlines = [JournalLineInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(OperatingExpense)
class OperatingExpenseAdmin(admin.ModelAdmin):
    list_display = ("number", "category", "payee", "payment_method", "amount", "amount_base", "expense_date")
    list_filter = ("category", "payment_method", "expense_date")
    readonly_fields = [field.name for field in OperatingExpense._meta.fields]
