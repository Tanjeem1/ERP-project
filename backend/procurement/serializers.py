from decimal import Decimal

from rest_framework import serializers

from core.api import CurrencyField, PaymentAccountMethodField, decimal_number, minor, payment_label, purchase_status_label, approval_label, role_label
from core.services.money import base_value, from_minor_units
from procurement.models import GoodsReceiptNote, PurchaseOrder, PurchaseOrderItem, Vendor, VendorPayment


class VendorSerializer(serializers.ModelSerializer):
    contactName = serializers.CharField(source="contact_name", read_only=True)
    paymentTermsDays = serializers.IntegerField(source="payment_terms_days", read_only=True)
    countryCode = serializers.CharField(source="country_code", read_only=True)
    payableBalanceMinor = serializers.SerializerMethodField()
    totalPurchasedMinor = serializers.SerializerMethodField()
    totalPaidMinor = serializers.SerializerMethodField()
    lastPaymentDate = serializers.SerializerMethodField()
    shipmentReferences = serializers.SerializerMethodField()
    status = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Vendor
        fields = ["id", "code", "name", "contactName", "email", "currency", "paymentTermsDays", "countryCode", "status", "payableBalanceMinor", "totalPurchasedMinor", "totalPaidMinor", "lastPaymentDate", "shipmentReferences"]

    def get_payableBalanceMinor(self, instance) -> int:
        return minor(instance.payable_balance)

    def get_totalPurchasedMinor(self, instance) -> int:
        return minor(getattr(instance, "total_purchased", Decimal("0.00")))

    def get_totalPaidMinor(self, instance) -> int:
        return minor(getattr(instance, "total_paid", Decimal("0.00")))

    def get_lastPaymentDate(self, instance) -> str | None:
        value = getattr(instance, "last_payment_date", None)
        return value.isoformat() if value else None

    def get_shipmentReferences(self, instance) -> list[str]:
        return [order.reference for order in instance.purchase_orders.all() if order.reference]


class VendorInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=180, trim_whitespace=True)
    contactName = serializers.CharField(source="contact_name", max_length=150, trim_whitespace=True)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    currency = CurrencyField(default="USD")
    paymentTermsDays = serializers.IntegerField(source="payment_terms_days", min_value=0, max_value=365, default=30)
    countryCode = serializers.CharField(source="country_code", min_length=2, max_length=2, default="US")
    status = serializers.ChoiceField(choices=["ACTIVE", "ON_HOLD"], default="ACTIVE")


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    productId = serializers.UUIDField(source="sku_id", read_only=True)
    orderedQuantity = serializers.SerializerMethodField()
    receivedQuantity = serializers.SerializerMethodField()
    unitCostMinor = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrderItem
        fields = ["id", "productId", "orderedQuantity", "receivedQuantity", "unitCostMinor"]

    def get_orderedQuantity(self, instance) -> int:
        return int(instance.ordered_quantity)

    def get_receivedQuantity(self, instance) -> int:
        return int(instance.received_quantity)

    def get_unitCostMinor(self, instance) -> int:
        return minor(instance.unit_cost)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplierId = serializers.UUIDField(source="vendor_id", read_only=True)
    destinationWarehouseId = serializers.UUIDField(source="destination_warehouse_id", read_only=True)
    status = serializers.SerializerMethodField()
    approvalStatus = serializers.SerializerMethodField()
    approvalReason = serializers.CharField(source="approval_reason", allow_blank=True)
    approvedByRole = serializers.SerializerMethodField()
    currency = serializers.CharField(read_only=True)
    fxRateToBase = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    approvedAt = serializers.DateTimeField(source="approved_at", read_only=True, allow_null=True)
    expectedAt = serializers.DateTimeField(source="expected_at", read_only=True)
    lines = PurchaseOrderLineSerializer(source="items", many=True, read_only=True)
    totalAmountMinor = serializers.SerializerMethodField()
    totalBaseAmountMinor = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "number", "supplierId", "destinationWarehouseId", "status", "approvalStatus", "approvalReason",
            "approvedByRole", "currency", "fxRateToBase", "reference", "createdAt", "approvedAt", "expectedAt",
            "lines", "totalAmountMinor", "totalBaseAmountMinor",
        ]

    def get_status(self, instance) -> str:
        return purchase_status_label(instance.status)

    def get_approvalStatus(self, instance) -> str:
        return approval_label(instance.approval_status)

    def get_approvedByRole(self, instance) -> str | None:
        return role_label(instance.approved_by_role) if instance.approved_by_role else None

    def get_fxRateToBase(self, instance) -> float:
        return decimal_number(instance.exchange_rate)

    def get_totalAmountMinor(self, instance) -> int:
        return minor(instance.total_amount)

    def get_totalBaseAmountMinor(self, instance) -> int:
        return minor(instance.total_base_amount)


class PurchaseOrderLineInputSerializer(serializers.Serializer):
    productId = serializers.UUIDField()
    orderedQuantity = serializers.IntegerField(min_value=1)
    unitCostMinor = serializers.IntegerField(min_value=0)


class PurchaseOrderInputSerializer(serializers.Serializer):
    supplierId = serializers.UUIDField()
    destinationWarehouseId = serializers.UUIDField()
    currency = CurrencyField()
    fxRateToBase = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    expectedAt = serializers.DateTimeField()
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    lines = PurchaseOrderLineInputSerializer(many=True, min_length=1)

    def validate_lines(self, value):
        if len({line["productId"] for line in value}) != len(value):
            raise serializers.ValidationError("Each SKU can appear only once in a purchase order.")
        return value


class LandedCostAmountsInputSerializer(serializers.Serializer):
    freightMinor = serializers.IntegerField(min_value=0)
    customsMinor = serializers.IntegerField(min_value=0)
    portHandlingMinor = serializers.IntegerField(min_value=0)
    insuranceMinor = serializers.IntegerField(min_value=0)
    currency = CurrencyField()
    fxRateToBase = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))

    def to_internal_value(self, data):
        values = super().to_internal_value(data)
        return {
            "freight": from_minor_units(values["freightMinor"]),
            "customs": from_minor_units(values["customsMinor"]),
            "port_handling": from_minor_units(values["portHandlingMinor"]),
            "insurance": from_minor_units(values["insuranceMinor"]),
            "currency": values["currency"],
            "exchange_rate": values["fxRateToBase"],
        }


class GoodsReceiptLineInputSerializer(serializers.Serializer):
    purchaseOrderLineId = serializers.UUIDField(source="purchase_order_item_id")
    quantity = serializers.IntegerField(min_value=1)


class GoodsReceiptInputSerializer(serializers.Serializer):
    purchaseOrderId = serializers.UUIDField()
    warehouseId = serializers.UUIDField()
    allocationMethod = serializers.ChoiceField(choices=["weight", "volume", "value"])
    costs = LandedCostAmountsInputSerializer()
    lines = GoodsReceiptLineInputSerializer(many=True, min_length=1)
    receivedAt = serializers.DateTimeField(required=False, allow_null=True)

    def validate_lines(self, value):
        if len({line["purchase_order_item_id"] for line in value}) != len(value):
            raise serializers.ValidationError("Each purchase order line can appear only once in a receipt.")
        return value


class VendorPaymentInputSerializer(serializers.Serializer):
    supplierId = serializers.UUIDField()
    purchaseOrderId = serializers.UUIDField(required=False, allow_null=True)
    paymentMethod = PaymentAccountMethodField()
    amountMinor = serializers.IntegerField(min_value=1)
    currency = CurrencyField()
    fxRateToBase = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))
    paidAt = serializers.DateTimeField(required=False, allow_null=True)
    reference = serializers.CharField(max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class VendorPaymentSerializer(serializers.ModelSerializer):
    supplierId = serializers.UUIDField(source="vendor_id", read_only=True)
    purchaseOrderId = serializers.UUIDField(source="purchase_order_id", allow_null=True)
    paymentMethod = serializers.SerializerMethodField()
    paymentAccountId = serializers.UUIDField(source="payment_account_id", read_only=True)
    amountMinor = serializers.SerializerMethodField()
    currency = serializers.CharField(read_only=True)
    fxRateToBase = serializers.SerializerMethodField()
    amountBaseMinor = serializers.SerializerMethodField()
    paidAt = serializers.DateTimeField(source="paid_at", read_only=True)
    journalEntryId = serializers.UUIDField(source="journal_entry_id", read_only=True)
    createdByRole = serializers.SerializerMethodField()

    class Meta:
        model = VendorPayment
        fields = ["id", "number", "supplierId", "purchaseOrderId", "paymentMethod", "paymentAccountId", "amountMinor", "currency", "fxRateToBase", "amountBaseMinor", "paidAt", "reference", "notes", "journalEntryId", "createdByRole"]

    def get_paymentMethod(self, instance) -> str:
        return payment_label(instance.payment_method, vendor=True)

    def get_amountMinor(self, instance) -> int:
        return minor(instance.amount)

    def get_fxRateToBase(self, instance) -> float:
        return decimal_number(instance.exchange_rate)

    def get_amountBaseMinor(self, instance) -> int:
        return minor(instance.amount_base)

    def get_createdByRole(self, instance) -> str:
        return role_label(instance.created_by_role)


class LandedCostPreviewSerializer:
    def __init__(self, preview):
        self.preview = preview

    @property
    def data(self):
        return {
            "purchaseOrderId": str(self.preview.purchase_order_id),
            "warehouseId": str(self.preview.warehouse_id),
            "allocationMethod": self.preview.allocation_method.lower(),
            "costs": {
                "freightMinor": minor(self.preview.costs["freight"]),
                "customsMinor": minor(self.preview.costs["customs"]),
                "portHandlingMinor": minor(self.preview.costs["port_handling"]),
                "insuranceMinor": minor(self.preview.costs["insurance"]),
                "currency": self.preview.costs["currency"],
                "fxRateToBase": decimal_number(self.preview.costs["exchange_rate"]),
                "base": {
                    "freightMinor": minor(self.preview.costs["base"]["freight"]),
                    "customsMinor": minor(self.preview.costs["base"]["customs"]),
                    "portHandlingMinor": minor(self.preview.costs["base"]["port_handling"]),
                    "insuranceMinor": minor(self.preview.costs["base"]["insurance"]),
                },
            },
            "lines": [
                {
                    "purchaseOrderLineId": str(line.purchase_order_item_id),
                    "productId": str(line.sku_id),
                    "sku": line.sku,
                    "productName": line.product_name,
                    "quantity": int(line.quantity),
                    "sourceUnitCostMinor": minor(line.source_unit_cost),
                    "baseUnitCostMinor": decimal_number(line.base_unit_cost * 100),
                    "baseGoodsCostMinor": minor(line.base_goods_cost),
                    "basisQuantity": decimal_number(line.basis_quantity),
                    "basisShare": decimal_number(line.basis_share),
                    "allocatedFreightMinor": minor(line.allocations["freight"]),
                    "allocatedCustomsMinor": minor(line.allocations["customs"]),
                    "allocatedPortHandlingMinor": minor(line.allocations["port_handling"]),
                    "allocatedInsuranceMinor": minor(line.allocations["insurance"]),
                    "allocatedLandedCostMinor": minor(line.allocated_landed_cost),
                    "trueUnitCostMinor": decimal_number(line.true_unit_cost * 100),
                    "trueTotalCostMinor": minor(line.true_total_cost),
                }
                for line in self.preview.lines
            ],
            "totalGoodsBaseMinor": minor(self.preview.total_goods_base),
            "totalAllocatedCostMinor": minor(self.preview.total_allocated_cost),
            "totalInventoryBaseMinor": minor(self.preview.total_inventory_base),
            "totalDebitMinor": minor(self.preview.total_debit),
            "totalCreditMinor": minor(self.preview.total_credit),
        }


class GoodsReceiptSerializer:
    def __init__(self, receipt):
        self.receipt = receipt

    @property
    def data(self):
        receipt = self.receipt
        return {
            "id": str(receipt.id),
            "number": receipt.number,
            "purchaseOrderId": str(receipt.purchase_order_id),
            "purchaseOrderNumber": receipt.purchase_order_number,
            "warehouseId": str(receipt.warehouse_id),
            "receivedAt": receipt.received_at.isoformat(),
            "allocationMethod": receipt.allocation_method.lower(),
            "landedCosts": {
                "freightMinor": minor(receipt.freight_source),
                "customsMinor": minor(receipt.customs_source),
                "portHandlingMinor": minor(receipt.port_handling_source),
                "insuranceMinor": minor(receipt.insurance_source),
                "currency": receipt.cost_currency,
                "fxRateToBase": decimal_number(receipt.cost_exchange_rate),
                "base": {
                    "freightMinor": minor(base_value(receipt.freight_source, receipt.cost_exchange_rate)),
                    "customsMinor": minor(base_value(receipt.customs_source, receipt.cost_exchange_rate)),
                    "portHandlingMinor": minor(base_value(receipt.port_handling_source, receipt.cost_exchange_rate)),
                    "insuranceMinor": minor(base_value(receipt.insurance_source, receipt.cost_exchange_rate)),
                },
            },
            "lines": [
                {
                    "id": str(line.id),
                    "purchaseOrderLineId": str(line.purchase_order_item_id),
                    "productId": str(line.sku_id),
                    "quantity": int(line.quantity),
                    "sourceUnitCostMinor": minor(line.source_unit_cost),
                    "baseUnitCostMinor": decimal_number(line.base_unit_cost * 100),
                    "baseGoodsCostMinor": minor(line.base_goods_cost),
                    "basisQuantity": decimal_number(line.basis_quantity),
                    "basisShare": decimal_number(line.basis_share),
                    "allocatedFreightMinor": minor(line.landed_cost_allocation.freight_base),
                    "allocatedCustomsMinor": minor(line.landed_cost_allocation.customs_base),
                    "allocatedPortHandlingMinor": minor(line.landed_cost_allocation.port_handling_base),
                    "allocatedInsuranceMinor": minor(line.landed_cost_allocation.insurance_base),
                    "allocatedLandedCostMinor": minor(line.allocated_landed_cost),
                    "trueUnitCostMinor": decimal_number(line.true_unit_cost * 100),
                    "trueTotalCostMinor": minor(line.true_total_cost),
                    "costLayerId": str(line.cost_layer_id),
                }
                for line in receipt.items.select_related("landed_cost_allocation", "cost_layer").all()
            ],
            "totalGoodsBaseMinor": minor(receipt.total_goods_base),
            "totalLandedCostBaseMinor": minor(receipt.total_landed_cost_base),
            "totalInventoryBaseMinor": minor(receipt.total_inventory_base),
            "journalEntryId": str(receipt.journal_entry_id),
        }
