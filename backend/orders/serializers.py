from decimal import Decimal

from rest_framework import serializers

from core.api import CurrencyField, PaymentMethodField, address_value, decimal_number, minor, order_channel_label, order_status_label, approval_label, payment_label, role_label
from core.services.actors import Permission, ROLE_PERMISSIONS
from orders.models import CreditNote, Customer, CustomerPayment, Invoice, InvoiceLine, PaymentAllocation, SalesOrder, SalesOrderItem, SalesReturn, SalesReturnItem


def can_view_cost(context):
    actor = context.get("actor")
    return bool(actor and ROLE_PERMISSIONS.get(actor.role, {}).get(Permission.VIEW_COST_PRICES, False))


class CustomerSerializer(serializers.ModelSerializer):
    contactName = serializers.CharField(source="contact_name", read_only=True)
    paymentTermsDays = serializers.IntegerField(source="payment_terms_days", read_only=True)
    billingAddress = serializers.SerializerMethodField()
    taxRateBasisPoints = serializers.SerializerMethodField()
    creditLimitBaseMinor = serializers.SerializerMethodField()
    totalPurchasedMinor = serializers.SerializerMethodField()
    totalPaidMinor = serializers.SerializerMethodField()
    remainingDebtMinor = serializers.SerializerMethodField()
    lastPaymentDate = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id", "code", "name", "contactName", "email", "currency", "paymentTermsDays", "billingAddress",
            "taxRateBasisPoints", "creditLimitBaseMinor", "totalPurchasedMinor", "totalPaidMinor",
            "remainingDebtMinor", "lastPaymentDate",
        ]

    def get_billingAddress(self, instance) -> dict:
        return address_value(instance)

    def get_taxRateBasisPoints(self, instance) -> int:
        return int(instance.tax_rate * 100)

    def get_creditLimitBaseMinor(self, instance) -> int:
        return minor(instance.credit_limit)

    def get_totalPurchasedMinor(self, instance) -> int:
        return minor(getattr(instance, "total_purchased", Decimal("0.00")))

    def get_totalPaidMinor(self, instance) -> int:
        return minor(getattr(instance, "total_paid", Decimal("0.00")))

    def get_remainingDebtMinor(self, instance) -> int:
        return minor(instance.receivable_balance)

    def get_lastPaymentDate(self, instance) -> str | None:
        value = getattr(instance, "last_payment_date", None)
        return value.isoformat() if value else None


class CustomerInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=180)
    contactName = serializers.CharField(source="contact_name", max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    currency = CurrencyField(default="USD")
    paymentTermsDays = serializers.IntegerField(source="payment_terms_days", min_value=0, max_value=365, default=30)
    billingAddress = serializers.DictField(required=False, default=dict)
    taxRateBasisPoints = serializers.IntegerField(min_value=0, max_value=10000, default=0)
    creditLimitBaseMinor = serializers.IntegerField(min_value=0, default=0)


class SalesOrderLineSerializer(serializers.ModelSerializer):
    productId = serializers.UUIDField(source="sku_id")
    quantity = serializers.SerializerMethodField()
    shippedQuantity = serializers.SerializerMethodField()
    unitPriceMinor = serializers.SerializerMethodField()
    reservationId = serializers.UUIDField(source="reservation_id", allow_null=True)
    cogsBaseMinor = serializers.SerializerMethodField()
    returnedQuantity = serializers.SerializerMethodField()

    class Meta:
        model = SalesOrderItem
        fields = ["id", "productId", "quantity", "shippedQuantity", "unitPriceMinor", "reservationId", "cogsBaseMinor", "returnedQuantity"]

    def get_quantity(self, instance) -> int:
        return int(instance.quantity)

    def get_shippedQuantity(self, instance) -> int:
        return int(instance.shipped_quantity)

    def get_unitPriceMinor(self, instance) -> int:
        return minor(instance.unit_price)

    def get_cogsBaseMinor(self, instance) -> int | None:
        return minor(instance.cogs_base) if can_view_cost(self.context) else None

    def get_returnedQuantity(self, instance) -> int:
        return int(instance.returned_quantity)


class SalesOrderSerializer(serializers.ModelSerializer):
    customerId = serializers.UUIDField(source="customer_id")
    warehouseId = serializers.UUIDField(source="warehouse_id")
    channel = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    approvalStatus = serializers.SerializerMethodField()
    approvalReason = serializers.CharField(source="approval_reason", allow_blank=True)
    approvedByRole = serializers.SerializerMethodField()
    approvedAt = serializers.DateTimeField(source="approved_at", read_only=True, allow_null=True)
    fxRateToBase = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    shippedAt = serializers.DateTimeField(source="shipped_at", read_only=True, allow_null=True)
    invoiceId = serializers.SerializerMethodField()
    lines = SalesOrderLineSerializer(source="items", many=True, read_only=True)
    subtotalMinor = serializers.SerializerMethodField()
    taxMinor = serializers.SerializerMethodField()
    totalMinor = serializers.SerializerMethodField()
    totalBaseMinor = serializers.SerializerMethodField()
    version = serializers.IntegerField(read_only=True)

    class Meta:
        model = SalesOrder
        fields = [
            "id", "number", "customerId", "warehouseId", "channel", "status", "approvalStatus", "approvalReason",
            "approvedByRole", "approvedAt", "currency", "fxRateToBase", "reference", "createdAt", "shippedAt",
            "invoiceId", "lines", "subtotalMinor", "taxMinor", "totalMinor", "totalBaseMinor", "version",
        ]

    def get_channel(self, instance) -> str:
        return order_channel_label(instance.channel)

    def get_status(self, instance) -> str:
        return order_status_label(instance.status)

    def get_approvalStatus(self, instance) -> str:
        return approval_label(instance.approval_status)

    def get_approvedByRole(self, instance) -> str | None:
        return role_label(instance.approved_by_role) if instance.approved_by_role else None

    def get_fxRateToBase(self, instance) -> float:
        return decimal_number(instance.exchange_rate)

    def get_invoiceId(self, instance) -> str | None:
        return str(instance.invoice.id) if hasattr(instance, "invoice") else None

    def get_subtotalMinor(self, instance) -> int:
        return minor(instance.subtotal)

    def get_taxMinor(self, instance) -> int:
        return minor(instance.tax_amount)

    def get_totalMinor(self, instance) -> int:
        return minor(instance.total_amount)

    def get_totalBaseMinor(self, instance) -> int:
        return minor(instance.total_base)


class SalesOrderLineInputSerializer(serializers.Serializer):
    productId = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    unitPriceMinor = serializers.IntegerField(min_value=0)


class SalesOrderInputSerializer(serializers.Serializer):
    customerId = serializers.UUIDField()
    warehouseId = serializers.UUIDField()
    channel = serializers.ChoiceField(choices=["B2B", "SHOPIFY", "DIRECT", "POS"])
    currency = CurrencyField()
    fxRateToBase = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    lines = SalesOrderLineInputSerializer(many=True, min_length=1)

    def validate_lines(self, value):
        if len({line["productId"] for line in value}) != len(value):
            raise serializers.ValidationError("Each SKU can appear only once in an order.")
        return value


class SalesOrderQuantityInputSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class InvoiceLineSerializer(serializers.ModelSerializer):
    productId = serializers.UUIDField(source="sku_id")
    quantity = serializers.SerializerMethodField()
    unitPriceMinor = serializers.SerializerMethodField()
    totalMinor = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceLine
        fields = ["id", "productId", "description", "quantity", "unitPriceMinor", "totalMinor"]

    def get_quantity(self, instance) -> int:
        return int(instance.quantity)

    def get_unitPriceMinor(self, instance) -> int:
        return minor(instance.unit_price)

    def get_totalMinor(self, instance) -> int:
        return minor(instance.total_price)


class InvoiceSerializer(serializers.ModelSerializer):
    orderId = serializers.UUIDField(source="sales_order_id")
    orderNumber = serializers.CharField(source="order_number", read_only=True)
    customerId = serializers.UUIDField(source="customer_id")
    status = serializers.CharField(source="get_status_display", read_only=True)
    fxRateToBase = serializers.SerializerMethodField()
    issuedAt = serializers.DateTimeField(source="issued_at", read_only=True)
    dueAt = serializers.DateTimeField(source="due_at", read_only=True)
    billingAddress = serializers.SerializerMethodField()
    lines = InvoiceLineSerializer(many=True, read_only=True)
    subtotalMinor = serializers.SerializerMethodField()
    taxMinor = serializers.SerializerMethodField()
    totalMinor = serializers.SerializerMethodField()
    subtotalBaseMinor = serializers.SerializerMethodField()
    taxBaseMinor = serializers.SerializerMethodField()
    totalBaseMinor = serializers.SerializerMethodField()
    cogsBaseMinor = serializers.SerializerMethodField()
    journalEntryIds = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "orderId", "orderNumber", "customerId", "status", "currency", "fxRateToBase",
            "issuedAt", "dueAt", "billingAddress", "lines", "subtotalMinor", "taxMinor", "totalMinor",
            "subtotalBaseMinor", "taxBaseMinor", "totalBaseMinor", "cogsBaseMinor", "journalEntryIds",
        ]

    def get_fxRateToBase(self, instance) -> float:
        return decimal_number(instance.exchange_rate)

    def get_billingAddress(self, instance) -> dict:
        return address_value(instance)

    def get_subtotalMinor(self, instance) -> int:
        return minor(instance.subtotal)

    def get_taxMinor(self, instance) -> int:
        return minor(instance.tax_amount)

    def get_totalMinor(self, instance) -> int:
        return minor(instance.total_amount)

    def get_subtotalBaseMinor(self, instance) -> int:
        return minor(instance.subtotal_base)

    def get_taxBaseMinor(self, instance) -> int:
        return minor(instance.tax_base)

    def get_totalBaseMinor(self, instance) -> int:
        return minor(instance.total_base)

    def get_cogsBaseMinor(self, instance) -> int | None:
        return minor(instance.cogs_base) if can_view_cost(self.context) else None

    def get_journalEntryIds(self, instance) -> list[str]:
        return [str(entry.id) for entry in instance.journal_entries.all()]


class PaymentAllocationSerializer(serializers.ModelSerializer):
    invoiceId = serializers.UUIDField(source="invoice_id")
    amountBaseMinor = serializers.SerializerMethodField()

    class Meta:
        model = PaymentAllocation
        fields = ["invoiceId", "amountBaseMinor"]

    def get_amountBaseMinor(self, instance) -> int:
        return minor(instance.amount_base)


class CustomerPaymentSerializer(serializers.ModelSerializer):
    customerId = serializers.UUIDField(source="customer_id")
    paymentMethod = serializers.SerializerMethodField()
    paymentAccountId = serializers.UUIDField(source="payment_account_id")
    amountMinor = serializers.SerializerMethodField()
    fxRateToBase = serializers.SerializerMethodField()
    amountBaseMinor = serializers.SerializerMethodField()
    receivedAt = serializers.DateTimeField(source="received_at", read_only=True)
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    status = serializers.CharField(source="get_status_display", read_only=True)
    journalEntryId = serializers.UUIDField(source="journal_entry_id")
    reversalJournalEntryId = serializers.UUIDField(source="reversal_journal_entry_id", allow_null=True)
    replacedByPaymentId = serializers.UUIDField(source="replaced_by_payment_id", allow_null=True)
    reversalOfPaymentId = serializers.UUIDField(source="reversal_of_payment_id", allow_null=True)
    createdByRole = serializers.SerializerMethodField()

    class Meta:
        model = CustomerPayment
        fields = [
            "id", "number", "customerId", "paymentMethod", "paymentAccountId", "amountMinor", "currency",
            "fxRateToBase", "amountBaseMinor", "receivedAt", "reference", "notes", "allocations", "status",
            "journalEntryId", "reversalJournalEntryId", "replacedByPaymentId", "reversalOfPaymentId", "createdByRole",
        ]

    def get_paymentMethod(self, instance) -> str:
        return payment_label(instance.payment_method)

    def get_amountMinor(self, instance) -> int:
        return minor(instance.amount)

    def get_fxRateToBase(self, instance) -> float:
        return decimal_number(instance.exchange_rate)

    def get_amountBaseMinor(self, instance) -> int:
        return minor(instance.amount_base)

    def get_createdByRole(self, instance) -> str:
        return role_label(instance.created_by_role)


class CustomerPaymentInputSerializer(serializers.Serializer):
    customerId = serializers.UUIDField()
    invoiceId = serializers.UUIDField(required=False, allow_null=True)
    paymentMethod = PaymentMethodField()
    amountMinor = serializers.IntegerField(min_value=1)
    currency = CurrencyField()
    fxRateToBase = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    receivedAt = serializers.DateTimeField(required=False, allow_null=True)
    reference = serializers.CharField(max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class CustomerPaymentUpdateSerializer(serializers.Serializer):
    paymentMethod = PaymentMethodField()
    amountMinor = serializers.IntegerField(min_value=1)
    currency = CurrencyField()
    fxRateToBase = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    receivedAt = serializers.DateTimeField()
    reference = serializers.CharField(max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class CreditNoteSerializer(serializers.ModelSerializer):
    customerId = serializers.UUIDField(source="customer_id")
    invoiceId = serializers.UUIDField(source="invoice_id", allow_null=True)
    returnId = serializers.UUIDField(source="sales_return_id")
    amountBaseMinor = serializers.SerializerMethodField()
    issuedAt = serializers.DateTimeField(source="issued_at", read_only=True)
    status = serializers.CharField(source="get_status_display", read_only=True)
    journalEntryId = serializers.UUIDField(source="journal_entry_id")

    class Meta:
        model = CreditNote
        fields = ["id", "number", "customerId", "invoiceId", "returnId", "amountBaseMinor", "currency", "issuedAt", "status", "journalEntryId"]

    def get_amountBaseMinor(self, instance) -> int:
        return minor(instance.amount_base)


class SalesReturnLineSerializer(serializers.ModelSerializer):
    orderLineId = serializers.UUIDField(source="order_item_id")
    productId = serializers.UUIDField(source="sku_id")
    quantity = serializers.SerializerMethodField()
    condition = serializers.CharField(source="get_condition_display", read_only=True)
    unitPriceMinor = serializers.SerializerMethodField()
    unitCostBaseMinor = serializers.SerializerMethodField()
    restoredLayerId = serializers.UUIDField(source="restored_layer_id", allow_null=True)

    class Meta:
        model = SalesReturnItem
        fields = ["orderLineId", "productId", "quantity", "condition", "unitPriceMinor", "unitCostBaseMinor", "restoredLayerId"]

    def get_quantity(self, instance) -> int:
        return int(instance.quantity)

    def get_unitPriceMinor(self, instance) -> int:
        return minor(instance.unit_price)

    def get_unitCostBaseMinor(self, instance) -> int | None:
        return minor(instance.unit_cost_base) if can_view_cost(self.context) else None


class SalesReturnSerializer(serializers.ModelSerializer):
    orderId = serializers.UUIDField(source="sales_order_id")
    orderNumber = serializers.CharField(source="order_number", read_only=True)
    customerId = serializers.UUIDField(source="customer_id")
    warehouseId = serializers.UUIDField(source="warehouse_id")
    status = serializers.CharField(source="get_status_display", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    createdByRole = serializers.SerializerMethodField()
    lines = SalesReturnLineSerializer(source="items", many=True, read_only=True)
    creditNoteId = serializers.SerializerMethodField()
    restoredValueBaseMinor = serializers.SerializerMethodField()
    shrinkageBaseMinor = serializers.SerializerMethodField()
    journalEntryIds = serializers.SerializerMethodField()

    class Meta:
        model = SalesReturn
        fields = [
            "id", "number", "orderId", "orderNumber", "customerId", "warehouseId", "reason", "status",
            "createdAt", "createdByRole", "lines", "creditNoteId", "restoredValueBaseMinor", "shrinkageBaseMinor", "journalEntryIds",
        ]

    def get_createdByRole(self, instance) -> str:
        return role_label(instance.created_by_role)

    def get_creditNoteId(self, instance) -> str:
        return str(instance.credit_note.id)

    def get_restoredValueBaseMinor(self, instance) -> int:
        return minor(instance.restored_value_base)

    def get_shrinkageBaseMinor(self, instance) -> int:
        return minor(instance.shrinkage_base)

    def get_journalEntryIds(self, instance) -> list[str]:
        return [str(entry.id) for entry in instance.journal_entries.all()]


class SalesReturnLineInputSerializer(serializers.Serializer):
    orderLineId = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    condition = serializers.ChoiceField(choices=["RESTOCKABLE", "DAMAGED_EXPIRED"])


class SalesReturnInputSerializer(serializers.Serializer):
    orderId = serializers.UUIDField()
    reason = serializers.CharField(max_length=2000)
    lines = SalesReturnLineInputSerializer(many=True, min_length=1)

    def validate_lines(self, value):
        keys = {(line["orderLineId"], line["condition"]) for line in value}
        if len(keys) != len(value):
            raise serializers.ValidationError("Each order line and return condition can appear only once.")
        return value


class PosPaymentInputSerializer(serializers.Serializer):
    method = PaymentMethodField()
    amountMinor = serializers.IntegerField(min_value=0)


class PosCheckoutInputSerializer(serializers.Serializer):
    customerId = serializers.UUIDField()
    warehouseId = serializers.UUIDField()
    lines = SalesOrderLineInputSerializer(many=True, min_length=1)
    payments = PosPaymentInputSerializer(many=True, allow_empty=True)
    exchangeRate = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"), default=Decimal("1.0000"))
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class OrderHistoryItemSerializer(SalesOrderLineSerializer):
    orderId = serializers.UUIDField(source="sales_order_id")
    orderNumber = serializers.CharField(source="sales_order.number", read_only=True)
    createdAt = serializers.DateTimeField(source="sales_order.created_at", read_only=True)
    status = serializers.SerializerMethodField()
    sku = serializers.CharField(source="sku.sku", read_only=True)
    productName = serializers.CharField(source="sku.name", read_only=True)

    class Meta(SalesOrderLineSerializer.Meta):
        fields = ["orderId", "orderNumber", "createdAt", "status", "sku", "productName", *SalesOrderLineSerializer.Meta.fields]

    def get_status(self, instance) -> str:
        return order_status_label(instance.sales_order.status)


class CollectionSummarySerializer(serializers.Serializer):
    collectedTodayMinor = serializers.IntegerField()
    collectedThisMonthMinor = serializers.IntegerField()
    collectedRangeMinor = serializers.IntegerField()
    salesRangeMinor = serializers.IntegerField()
    totalMarketDebtMinor = serializers.IntegerField()
    aging = serializers.DictField(child=serializers.IntegerField())
    rangeStart = serializers.DateTimeField()
    rangeEnd = serializers.DateTimeField()


class PosCheckoutResultSerializer(serializers.Serializer):
    order = SalesOrderSerializer()
    invoice = InvoiceSerializer(allow_null=True)
    payments = CustomerPaymentSerializer(many=True)
    customerDueMinor = serializers.IntegerField()
