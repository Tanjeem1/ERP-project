from decimal import Decimal
from zoneinfo import ZoneInfo

from django.core.files.base import ContentFile
from django.http import FileResponse
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.api import address_input, minor
from core.services.cache import get_cached
from core.services.money import from_minor_units
from core.services.time import today_bounds
from core.viewsets import TenantViewSet
from orders.documents import invoice_pdf_bytes, receipt_pdf_bytes
from orders.models import CreditNote, Customer, CustomerPayment, Invoice, SalesOrder, SalesReturn
from orders.serializers import CollectionSummarySerializer, CreditNoteSerializer, CustomerInputSerializer, CustomerPaymentInputSerializer, CustomerPaymentSerializer, CustomerPaymentUpdateSerializer, CustomerSerializer, InvoiceSerializer, OrderHistoryItemSerializer, PosCheckoutInputSerializer, PosCheckoutResultSerializer, SalesOrderInputSerializer, SalesOrderQuantityInputSerializer, SalesOrderSerializer, SalesReturnInputSerializer, SalesReturnSerializer, SalesOrderLineSerializer
from orders.services import checkout_pos, create_customer, create_sales_order, create_sales_return, customer_directory, customer_purchase_history, record_customer_payment, replace_customer_payment, collection_summary, ship_order, update_customer, approve_sales_order, move_order_to_pick_pack, update_sales_order_line_quantity
from orders.tasks import render_invoice_pdf, render_payment_receipt
from orders.tasks import enqueue_document


class CustomerViewSet(TenantViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    input_serializer_class = CustomerInputSerializer

    def get_queryset(self):
        if self.action in {"list", "retrieve"}:
            return customer_directory(self.get_organization())
        return super().get_queryset()

    def create_record(self, serializer):
        data = serializer.validated_data.copy()
        data["tax_rate"] = Decimal(data.pop("taxRateBasisPoints")) / 100
        data["credit_limit"] = from_minor_units(data.pop("creditLimitBaseMinor"))
        data.update(address_input(data.pop("billingAddress", {})))
        return create_customer(self.get_organization(), self.request.user, **data)

    def update_record(self, instance, serializer):
        data = serializer.validated_data.copy()
        data.pop("code", None)
        if "taxRateBasisPoints" in data:
            data["tax_rate"] = Decimal(data.pop("taxRateBasisPoints")) / 100
        if "creditLimitBaseMinor" in data:
            data["credit_limit"] = from_minor_units(data.pop("creditLimitBaseMinor"))
        if "billingAddress" in data:
            data.update(address_input(data.pop("billingAddress")))
        customer = update_customer(self.get_organization(), self.request.user, instance.id, **data)
        return customer_directory(self.get_organization()).get(pk=customer.pk)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        history = customer_purchase_history(self.get_organization(), pk)
        return Response(OrderHistoryItemSerializer(history, many=True, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="receive-payment")
    def receive_payment(self, request, pk=None):
        serializer = CustomerPaymentInputSerializer(data={**request.data, "customerId": str(pk)})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        payment = record_customer_payment(
            self.get_organization(), self.request.user, customer_id=pk, payment_method=data["paymentMethod"],
            amount=from_minor_units(data["amountMinor"]), currency=data["currency"], exchange_rate=data["fxRateToBase"],
            received_at=data.get("receivedAt"), reference=data["reference"], notes=data["notes"], invoice_id=data.get("invoiceId"),
        )
        enqueue_document(render_payment_receipt, payment.id)
        return Response(CustomerPaymentSerializer(payment, context=self.get_serializer_context()).data, status=201)


class CustomerPaymentViewSet(TenantViewSet):
    http_method_names = ["get", "post", "put", "head", "options"]
    queryset = CustomerPayment.objects.select_related("customer", "payment_account", "journal_entry").prefetch_related("allocations__invoice")
    serializer_class = CustomerPaymentSerializer
    input_serializer_class = CustomerPaymentInputSerializer

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return CustomerPaymentUpdateSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        queryset = super().get_queryset().order_by("-received_at", "-created_at")
        if self.request.query_params.get("customerId"):
            queryset = queryset.filter(customer_id=self.request.query_params["customerId"])
        return queryset

    def create_record(self, serializer):
        data = serializer.validated_data
        payment = record_customer_payment(
            self.get_organization(), self.request.user, customer_id=data["customerId"], payment_method=data["paymentMethod"],
            amount=from_minor_units(data["amountMinor"]), currency=data["currency"], exchange_rate=data["fxRateToBase"],
            received_at=data.get("receivedAt"), reference=data["reference"], notes=data["notes"], invoice_id=data.get("invoiceId"),
        )
        enqueue_document(render_payment_receipt, payment.id)
        return payment

    def update_record(self, instance, serializer):
        data = serializer.validated_data
        payment = replace_customer_payment(
            self.get_organization(), self.request.user, instance.id, payment_method=data["paymentMethod"],
            amount=from_minor_units(data["amountMinor"]), currency=data["currency"], exchange_rate=data["fxRateToBase"],
            received_at=data["receivedAt"], reference=data["reference"], notes=data["notes"],
        )
        enqueue_document(render_payment_receipt, payment.id)
        return payment

    @action(detail=True, methods=["get"], url_path="receipt")
    def receipt(self, request, pk=None):
        payment = self.get_object()
        if not payment.receipt_file:
            payment.receipt_file.save(f"{payment.number}.pdf", ContentFile(receipt_pdf_bytes(payment)), save=True)
        return FileResponse(payment.receipt_file.open("rb"), content_type="application/pdf", filename=f"{payment.number}.pdf")


class SalesOrderViewSet(TenantViewSet):
    queryset = SalesOrder.objects.select_related("customer", "warehouse", "invoice").prefetch_related("items__sku", "items__reservation")
    serializer_class = SalesOrderSerializer
    input_serializer_class = SalesOrderInputSerializer

    def get_queryset(self):
        queryset = super().get_queryset().order_by("-created_at")
        params = self.request.query_params
        if params.get("customerId"):
            queryset = queryset.filter(customer_id=params["customerId"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"].upper().replace(" ", "_").replace("&", "").replace("__", "_"))
        if params.get("channel"):
            queryset = queryset.filter(channel=params["channel"].upper())
        return queryset

    def create_record(self, serializer):
        data = serializer.validated_data
        return create_sales_order(
            self.get_organization(), self.request.user, customer_id=data["customerId"], warehouse_id=data["warehouseId"],
            channel=data["channel"], currency=data["currency"], exchange_rate=data["fxRateToBase"], reference=data["reference"],
            lines=[{"sku_id": line["productId"], "quantity": line["quantity"], "unit_price": from_minor_units(line["unitPriceMinor"])} for line in data["lines"]],
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        order = approve_sales_order(self.get_organization(), self.request.user, pk)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"], url_path="pick-pack")
    def pick_pack(self, request, pk=None):
        order = move_order_to_pick_pack(self.get_organization(), self.request.user, pk)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"], url_path="ship")
    def ship(self, request, pk=None):
        shipment = ship_order(self.get_organization(), self.request.user, pk)
        enqueue_document(render_invoice_pdf, shipment.invoice.id)
        return Response(InvoiceSerializer(shipment.invoice, context=self.get_serializer_context()).data, status=201)

    @action(detail=True, methods=["patch"], url_path=r"lines/(?P<item_id>[^/.]+)/quantity")
    def update_line_quantity(self, request, pk=None, item_id=None):
        serializer = SalesOrderQuantityInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = update_sales_order_line_quantity(self.get_organization(), request.user, pk, item_id, serializer.validated_data["quantity"])
        return Response(SalesOrderLineSerializer(item, context=self.get_serializer_context()).data)


class InvoiceViewSet(TenantViewSet):
    queryset = Invoice.objects.select_related("customer", "sales_order", "organization").prefetch_related("lines__sku", "journal_entries")
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        queryset = super().get_queryset().order_by("-issued_at", "-created_at")
        if self.request.query_params.get("customerId"):
            queryset = queryset.filter(customer_id=self.request.query_params["customerId"])
        return queryset

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        if not invoice.pdf_file:
            invoice.pdf_file.save(f"{invoice.number}.pdf", ContentFile(invoice_pdf_bytes(invoice)), save=True)
        return FileResponse(invoice.pdf_file.open("rb"), content_type="application/pdf", filename=f"{invoice.number}.pdf")


class SalesReturnViewSet(TenantViewSet):
    queryset = SalesReturn.objects.select_related("sales_order", "customer", "warehouse", "credit_note").prefetch_related("items__sku", "items__restored_layer", "journal_entries")
    serializer_class = SalesReturnSerializer
    input_serializer_class = SalesReturnInputSerializer

    def create_record(self, serializer):
        data = serializer.validated_data
        return create_sales_return(
            self.get_organization(), self.request.user, order_id=data["orderId"], reason=data["reason"],
            lines=[{"order_item_id": line["orderLineId"], "quantity": line["quantity"], "condition": line["condition"]} for line in data["lines"]],
        )


class CreditNoteViewSet(TenantViewSet):
    queryset = CreditNote.objects.select_related("customer", "invoice", "sales_return", "journal_entry")
    serializer_class = CreditNoteSerializer


class CollectionViewSet(viewsets.ViewSet):
    @extend_schema(responses=CollectionSummarySerializer)
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        organization = request.user.organization
        local_today = today_bounds(organization)[1].astimezone(ZoneInfo(organization.timezone)).date()
        start_date = request.query_params.get("from_date", request.query_params.get("startDate", local_today.isoformat()))
        end_date = request.query_params.get("to_date", request.query_params.get("endDate", local_today.isoformat()))

        def serialize(summary):
            return {
                "collectedTodayMinor": minor(summary["collected_today"]),
                "collectedThisMonthMinor": minor(summary["collected_this_month"]),
                "collectedRangeMinor": minor(summary["collected_range"]),
                "salesRangeMinor": minor(summary["sales_range"]),
                "totalMarketDebtMinor": minor(summary["total_market_debt"]),
                "aging": {key: minor(value) for key, value in summary["aging"].items()},
                "rangeStart": summary["range_start"].isoformat(),
                "rangeEnd": summary["range_end"].isoformat(),
            }

        data = get_cached("collections", organization, f"summary:{start_date}:{end_date}", lambda: serialize(collection_summary(organization, start_date, end_date)), timeout=30)
        return Response(data)


class PosViewSet(viewsets.GenericViewSet):
    http_method_names = ["post", "head", "options"]
    queryset = SalesOrder.objects.none()
    serializer_class = PosCheckoutInputSerializer

    def get_organization(self):
        return self.request.user.organization

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "organization": self.request.user.organization, "actor": self.request.user}

    @extend_schema(request=PosCheckoutInputSerializer, responses=PosCheckoutResultSerializer)
    def create(self, request, *args, **kwargs):
        serializer = PosCheckoutInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = checkout_pos(
            self.get_organization(), self.request.user, customer_id=data["customerId"], warehouse_id=data["warehouseId"],
            lines=[{"sku_id": line["productId"], "quantity": line["quantity"], "unit_price": from_minor_units(line["unitPriceMinor"])} for line in data["lines"]],
            payments=[(payment["method"], from_minor_units(payment["amountMinor"])) for payment in data["payments"]],
            exchange_rate=data["exchangeRate"], reference=data["reference"],
        )
        if result.invoice:
            enqueue_document(render_invoice_pdf, result.invoice.id)
        for payment in result.payments:
            enqueue_document(render_payment_receipt, payment.id)
        context = self.get_serializer_context()
        return Response({
            "order": SalesOrderSerializer(result.order, context=context).data,
            "invoice": InvoiceSerializer(result.invoice, context=context).data if result.invoice else None,
            "payments": [CustomerPaymentSerializer(payment, context=context).data for payment in result.payments],
            "customerDueMinor": minor(result.customer_due),
        }, status=201 if result.invoice else 202)


SalesOrderViewSet.update_line_quantity = extend_schema(
    parameters=[OpenApiParameter("item_id", str, OpenApiParameter.PATH)],
    request=SalesOrderQuantityInputSerializer,
    responses=SalesOrderLineSerializer,
)(SalesOrderViewSet.update_line_quantity)
SalesOrderViewSet.ship = extend_schema(request=None, responses={201: InvoiceSerializer})(SalesOrderViewSet.ship)
InvoiceViewSet.pdf = extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})(InvoiceViewSet.pdf)
CustomerPaymentViewSet.receipt = extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})(CustomerPaymentViewSet.receipt)
