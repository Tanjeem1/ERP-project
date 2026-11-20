from decimal import Decimal

from django.db.models import F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.response import Response
from rest_framework.decorators import action

from core.api import address_input, minor
from core.services.actors import Permission, assert_permission
from core.viewsets import StableCursorPagination, TenantViewSet
from inventory.models import InventoryLayer, SKU, StockAdjustment, StockBalance, StockReservation, StockTransfer, Warehouse


class FifoCursorPagination(StableCursorPagination):
    ordering = ("received_at", "created_at", "id")
from inventory.serializers import FifoSimulationInputSerializer, InventoryLayerSerializer, ProductMasterInputSerializer, ProductSerializer, ReservationSerializer, ReserveStockInputSerializer, StockAdjustmentInputSerializer, StockAdjustmentSerializer, StockBalanceSerializer, StockTransferInputSerializer, StockTransferSerializer, WarehouseMasterInputSerializer, WarehouseSerializer
from inventory.services import create_sku, create_stock_adjustment, create_warehouse, release_stock_reservation, reserve_stock_atomic, simulate_fifo, transfer_stock_atomic, update_sku, update_warehouse


class WarehouseViewSet(TenantViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    input_serializer_class = WarehouseMasterInputSerializer

    def create_record(self, serializer):
        data = serializer.validated_data.copy()
        address = data.pop("address", {})
        return create_warehouse(self.get_organization(), self.request.user, **data, **address)

    def update_record(self, instance, serializer):
        data = serializer.validated_data.copy()
        data.update(data.pop("address", {}))
        return update_warehouse(self.get_organization(), self.request.user, instance.id, **data)


class SKUViewSet(TenantViewSet):
    queryset = SKU.objects.select_related("preferred_vendor")
    serializer_class = ProductSerializer
    input_serializer_class = ProductMasterInputSerializer

    def get_queryset(self):
        queryset = super().get_queryset().order_by("sku")
        if self.request.query_params.get("active") is not None:
            queryset = queryset.filter(is_active=self.request.query_params["active"].lower() == "true")
        return queryset

    def create_record(self, serializer):
        return create_sku(self.get_organization(), self.request.user, **serializer.validated_data)

    def update_record(self, instance, serializer):
        data = serializer.validated_data.copy()
        if "preferred_vendor_id" in data:
            data["preferred_vendor"] = data.pop("preferred_vendor_id")
        return update_sku(self.get_organization(), self.request.user, instance.id, **data)

    @action(detail=False, methods=["get"], url_path="by-barcode")
    def by_barcode(self, request):
        code = request.query_params.get("code", "").strip()
        if not code:
            return Response({"detail": "The code query parameter is required."}, status=400)
        product = self.get_queryset().get(barcode=code)
        return Response(self.get_serializer(product).data)


class StockViewSet(TenantViewSet):
    http_method_names = ["get", "post", "head", "options"]
    queryset = StockBalance.objects.select_related("sku", "warehouse")
    serializer_class = StockBalanceSerializer

    def get_queryset(self):
        queryset = super().get_queryset().annotate(
            fifo_value=Coalesce(Sum("sku__inventory_layers__remaining_value", filter=Q(sku__inventory_layers__warehouse_id=F("warehouse_id"))), Value(Decimal("0.0000")))
        ).order_by("warehouse__code", "sku__sku")
        if self.request.query_params.get("warehouseId"):
            queryset = queryset.filter(warehouse_id=self.request.query_params["warehouseId"])
        if self.request.query_params.get("productId"):
            queryset = queryset.filter(sku_id=self.request.query_params["productId"])
        return queryset

    @action(detail=False, methods=["get"], url_path="matrix")
    def matrix(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @action(detail=False, methods=["post"], url_path="reserve")
    def reserve(self, request):
        serializer = ReserveStockInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        reservation = reserve_stock_atomic(
            self.get_organization(), self.request.user, sku_id=data["productId"], warehouse_id=data["warehouseId"],
            channel=data["channel"], reference=data["reference"], quantity=data["quantity"], expires_at=data.get("expiresAt"),
        )
        return Response(ReservationSerializer(reservation, context=self.get_serializer_context()).data, status=201)


class ReservationViewSet(TenantViewSet):
    http_method_names = ["get", "post", "head", "options"]
    queryset = StockReservation.objects.select_related("sku", "warehouse")
    serializer_class = ReservationSerializer

    def get_queryset(self):
        queryset = super().get_queryset().order_by("-created_at")
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"].upper())
        return queryset

    @action(detail=True, methods=["post"], url_path="release")
    def release(self, request, pk=None):
        assert_permission(request.user, self.get_organization(), Permission.MANAGE_INVENTORY)
        reservation = release_stock_reservation(self.get_organization(), request.user, pk)
        return Response(self.get_serializer(reservation).data)


class InventoryLayerViewSet(TenantViewSet):
    pagination_class = FifoCursorPagination
    queryset = InventoryLayer.objects.select_related("sku", "warehouse")
    serializer_class = InventoryLayerSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        queryset = super().get_queryset()
        if self.request.query_params.get("productId"):
            queryset = queryset.filter(sku_id=self.request.query_params["productId"])
        if self.request.query_params.get("warehouseId"):
            queryset = queryset.filter(warehouse_id=self.request.query_params["warehouseId"])
        return queryset.order_by("received_at", "created_at", "id")

    @action(detail=True, methods=["post"], url_path="simulate")
    def simulate(self, request, pk=None):
        assert_permission(request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        serializer = FifoSimulationInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        layer = self.get_object()
        result = simulate_fifo(self.get_organization(), layer.sku_id, layer.warehouse_id, serializer.validated_data["quantity"])
        return Response({
            "quantity": int(result["quantity"]),
            "totalCostMinor": minor(result["total_cost"]),
            "wacComparisonMinor": minor(result["wac_comparison"]),
            "layers": [{
                "layerId": str(item["layer"].id), "batchCode": item["layer"].batch_code, "quantity": int(item["quantity"]),
                "unitCostMinor": minor(item["layer"].unit_cost), "valueMinor": minor(item["value"]), "remainingQuantity": int(item["remaining_quantity"]),
            } for item in result["layers"]],
        })


class StockTransferViewSet(TenantViewSet):
    queryset = StockTransfer.objects.select_related("source_warehouse", "destination_warehouse").prefetch_related("items__layer_allocations")
    serializer_class = StockTransferSerializer
    input_serializer_class = StockTransferInputSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        return super().get_queryset().order_by("-created_at")

    def create_record(self, serializer):
        data = serializer.validated_data
        return transfer_stock_atomic(
            self.get_organization(), self.request.user, source_warehouse_id=data["sourceWarehouseId"],
            destination_warehouse_id=data["destinationWarehouseId"],
            lines=[{"sku_id": line["productId"], "quantity": line["quantity"]} for line in data["lines"]],
        )


class StockAdjustmentViewSet(TenantViewSet):
    queryset = StockAdjustment.objects.select_related("warehouse", "sku", "journal_entry")
    serializer_class = StockAdjustmentSerializer
    input_serializer_class = StockAdjustmentInputSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_COST_PRICES)
        return super().get_queryset().order_by("-created_at")

    def create_record(self, serializer):
        data = serializer.validated_data
        return create_stock_adjustment(
            self.get_organization(), self.request.user, warehouse_id=data["warehouseId"], sku_id=data["productId"],
            counted_quantity=data["countedQuantity"], reason=data["reason"], adjustment_type=data["adjustmentType"],
        )
