from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response

from core.services.actors import Permission, assert_permission
from core.services.money import from_minor_units
from core.viewsets import TenantViewSet
from procurement.models import GoodsReceiptNote, PurchaseOrder, Vendor, VendorPayment
from procurement.serializers import GoodsReceiptInputSerializer, GoodsReceiptSerializer, LandedCostPreviewSerializer, PurchaseOrderInputSerializer, PurchaseOrderSerializer, VendorInputSerializer, VendorPaymentInputSerializer, VendorPaymentSerializer, VendorSerializer
from procurement.services import approve_purchase_order, create_purchase_order, create_vendor, mark_purchase_order_in_transit, post_goods_receipt, preview_landed_costs, record_vendor_payment, reject_purchase_order, update_vendor, vendor_directory


class VendorViewSet(TenantViewSet):
    queryset = Vendor.objects.prefetch_related("purchase_orders").order_by("name")
    serializer_class = VendorSerializer
    input_serializer_class = VendorInputSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        if self.action in {"list", "retrieve"}:
            return vendor_directory(self.get_organization())
        return super().get_queryset()

    def create_record(self, serializer):
        return create_vendor(self.get_organization(), self.request.user, **serializer.validated_data)

    def update_record(self, instance, serializer):
        vendor = update_vendor(self.get_organization(), self.request.user, instance.id, **serializer.validated_data)
        return vendor_directory(self.get_organization()).get(pk=vendor.pk)

    @action(detail=True, methods=["post"], url_path="pay")
    def pay(self, request, pk=None):
        serializer = VendorPaymentInputSerializer(data={**request.data, "supplierId": str(pk)})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        payment = record_vendor_payment(
            self.get_organization(), self.request.user, vendor_id=pk, purchase_order_id=data.get("purchaseOrderId"),
            payment_method=data["paymentMethod"], amount=from_minor_units(data["amountMinor"]), currency=data["currency"],
            exchange_rate=data["fxRateToBase"], paid_at=data.get("paidAt"), reference=data["reference"], notes=data["notes"],
        )
        return Response(VendorPaymentSerializer(payment, context=self.get_serializer_context()).data, status=201)


class PurchaseOrderViewSet(TenantViewSet):
    queryset = PurchaseOrder.objects.select_related("vendor", "destination_warehouse").prefetch_related("items__sku", "approval_requests")
    serializer_class = PurchaseOrderSerializer
    input_serializer_class = PurchaseOrderInputSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        queryset = super().get_queryset().order_by("-created_at")
        if self.request.query_params.get("supplierId"):
            queryset = queryset.filter(vendor_id=self.request.query_params["supplierId"])
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"].upper().replace(" ", "_"))
        return queryset

    def create_record(self, serializer):
        data = serializer.validated_data
        return create_purchase_order(
            self.get_organization(), self.request.user, vendor_id=data["supplierId"],
            destination_warehouse_id=data["destinationWarehouseId"], currency=data["currency"],
            exchange_rate=data["fxRateToBase"], expected_at=data["expectedAt"], reference=data["reference"],
            lines=[{"sku_id": line["productId"], "quantity": line["orderedQuantity"], "unit_cost": from_minor_units(line["unitCostMinor"])} for line in data["lines"]],
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        return Response(self.get_serializer(approve_purchase_order(self.get_organization(), request.user, pk)).data)

    @action(detail=True, methods=["post"], url_path="in-transit")
    def in_transit(self, request, pk=None):
        return Response(self.get_serializer(mark_purchase_order_in_transit(self.get_organization(), request.user, pk)).data)

    def receipt_data(self, request, pk):
        serializer = GoodsReceiptInputSerializer(data={**request.data, "purchaseOrderId": str(pk)})
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    @action(detail=True, methods=["post"], url_path="preview")
    def preview(self, request, pk=None):
        data = self.receipt_data(request, pk)
        preview = preview_landed_costs(
            self.get_organization(), purchase_order_id=pk, warehouse_id=data["warehouseId"],
            allocation_method=data["allocationMethod"], costs=data["costs"], lines=data["lines"],
        )
        return Response(LandedCostPreviewSerializer(preview).data)

    @action(detail=True, methods=["post"], url_path="receive")
    def receive(self, request, pk=None):
        data = self.receipt_data(request, pk)
        receipt = post_goods_receipt(
            self.get_organization(), request.user, purchase_order_id=pk, warehouse_id=data["warehouseId"],
            allocation_method=data["allocationMethod"], costs=data["costs"], lines=data["lines"], received_at=data.get("receivedAt"),
        )
        return Response(GoodsReceiptSerializer(receipt).data, status=201)


class GoodsReceiptViewSet(TenantViewSet):
    queryset = GoodsReceiptNote.objects.select_related("purchase_order", "warehouse", "journal_entry").prefetch_related("items__landed_cost_allocation", "items__cost_layer")
    serializer_class = GoodsReceiptInputSerializer
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        return super().get_queryset().order_by("-received_at", "-created_at")

    @extend_schema(operation_id="procurement_receipts_list", responses=OpenApiTypes.OBJECT)
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response([GoodsReceiptSerializer(receipt).data for receipt in page])
        return Response([GoodsReceiptSerializer(receipt).data for receipt in queryset])

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def retrieve(self, request, *args, **kwargs):
        return Response(GoodsReceiptSerializer(self.get_object()).data)


class VendorPaymentViewSet(TenantViewSet):
    queryset = VendorPayment.objects.select_related("vendor", "purchase_order", "payment_account", "journal_entry")
    serializer_class = VendorPaymentSerializer
    input_serializer_class = VendorPaymentInputSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        queryset = super().get_queryset().order_by("-paid_at", "-created_at")
        if self.request.query_params.get("supplierId"):
            queryset = queryset.filter(vendor_id=self.request.query_params["supplierId"])
        return queryset

    def create_record(self, serializer):
        data = serializer.validated_data
        return record_vendor_payment(
            self.get_organization(), self.request.user, vendor_id=data["supplierId"], purchase_order_id=data.get("purchaseOrderId"),
            payment_method=data["paymentMethod"], amount=from_minor_units(data["amountMinor"]), currency=data["currency"],
            exchange_rate=data["fxRateToBase"], paid_at=data.get("paidAt"), reference=data["reference"], notes=data["notes"],
        )


PurchaseOrderViewSet.preview = extend_schema(request=GoodsReceiptInputSerializer, responses=OpenApiTypes.OBJECT)(PurchaseOrderViewSet.preview)
PurchaseOrderViewSet.receive = extend_schema(request=GoodsReceiptInputSerializer, responses={201: OpenApiTypes.OBJECT})(PurchaseOrderViewSet.receive)
