from decimal import Decimal

from rest_framework import serializers

from core.models import Currency, PaymentMethod
from core.services.money import decimal_value, from_minor_units, money


PAYMENT_ACCOUNT_CHOICES = [
    (PaymentMethod.CASH.value, PaymentMethod.CASH.label),
    (PaymentMethod.BANK.value, PaymentMethod.BANK.label),
    (PaymentMethod.MOBILE_BANKING.value, PaymentMethod.MOBILE_BANKING.label),
]


class CurrencyField(serializers.ChoiceField):
    def __init__(self, **kwargs):
        super().__init__(choices=Currency.choices, **kwargs)


class PaymentMethodField(serializers.ChoiceField):
    def __init__(self, **kwargs):
        super().__init__(choices=PaymentMethod.choices, **kwargs)


class PaymentAccountMethodField(serializers.ChoiceField):
    def __init__(self, **kwargs):
        super().__init__(choices=PAYMENT_ACCOUNT_CHOICES, **kwargs)


class NonNegativeDecimalField(serializers.DecimalField):
    def __init__(self, **kwargs):
        kwargs.setdefault("max_digits", 18)
        kwargs.setdefault("decimal_places", 4)
        kwargs.setdefault("min_value", Decimal("0.0000"))
        super().__init__(**kwargs)


class PositiveDecimalField(NonNegativeDecimalField):
    def __init__(self, **kwargs):
        kwargs["min_value"] = Decimal("0.0001")
        super().__init__(**kwargs)


def decimal_number(value):
    return float(decimal_value(value))


def minor(value):
    return int(money(value) * 100)


def minor_input(value):
    if isinstance(value, bool) or not isinstance(value, int):
        raise serializers.ValidationError("Minor currency units must be integers.")
    return from_minor_units(value)


def address_value(instance):
    return {
        "line1": instance.address_line1,
        "line2": instance.address_line2,
        "city": instance.city,
        "region": instance.region,
        "postalCode": instance.postal_code,
        "countryCode": instance.country_code,
    }


def date_value(value):
    return value.isoformat() if value else None


def address_input(value, *, required=False):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Address must be an object.")
    fields = {
        "line1": ("address_line1", 180),
        "line2": ("address_line2", 180),
        "city": ("city", 100),
        "region": ("region", 100),
        "postalCode": ("postal_code", 24),
        "countryCode": ("country_code", 2),
    }
    unknown = set(value) - set(fields)
    if unknown:
        raise serializers.ValidationError(f"Unsupported address fields: {', '.join(sorted(unknown))}.")
    result = {}
    for external, (internal, max_length) in fields.items():
        field_value = value.get(external, "")
        if not isinstance(field_value, str):
            raise serializers.ValidationError({external: "This field must be a string."})
        field_value = field_value.strip()
        if len(field_value) > max_length:
            raise serializers.ValidationError({external: f"Ensure this field has no more than {max_length} characters."})
        if required and external in {"line1", "city", "region", "postalCode", "countryCode"} and not field_value:
            raise serializers.ValidationError({external: "This field is required."})
        result[internal] = field_value.upper() if external == "countryCode" else field_value
    if "countryCode" in value and len(result["country_code"]) != 2:
        raise serializers.ValidationError({"countryCode": "Use a two-letter ISO country code."})
    return result


def choice_label(value, choices):
    return dict(choices)[value]


def payment_label(value, vendor=False):
    labels = {"CASH": "Cash", "BANK": "Bank" if vendor else "Bank Transfer", "CHEQUE": "Cheque", "MOBILE_BANKING": "Mobile Banking"}
    return labels[value]


def role_label(value):
    labels = {
        "SUPER_ADMIN": "Super Admin",
        "ACCOUNTANT": "Accountant",
        "WAREHOUSE_MANAGER": "Warehouse Manager",
        "SALES_OFFICER": "Sales Officer",
        "SYSTEM": "System",
    }
    return labels.get(value, value)


def order_channel_label(value):
    return {"B2B": "B2B Wholesale", "SHOPIFY": "Shopify Sync", "DIRECT": "Direct Import", "POS": "Point of Sale"}[value]


def purchase_status_label(value):
    return {
        "DRAFT": "Draft",
        "PENDING_APPROVAL": "Pending Approval",
        "APPROVED": "Approved",
        "IN_TRANSIT": "In Transit",
        "RECEIVED": "Received",
        "CANCELLED": "Cancelled",
    }[value]


def order_status_label(value):
    return {
        "PENDING_APPROVAL": "Pending Approval",
        "ORDER_PLACED": "Order Placed",
        "PICK_PACK": "Pick & Pack",
        "SHIPPED": "Shipped",
        "INVOICED": "Invoiced",
        "CANCELLED": "Cancelled",
    }[value]


def approval_label(value):
    return {"NOT_REQUIRED": "Not Required", "PENDING": "Pending", "APPROVED": "Approved", "REJECTED": "Rejected"}[value]


def source_label(value):
    labels = {
        "OPENING_BALANCE": "Opening Balance",
        "PURCHASE_ORDER": "Purchase Order",
        "GOODS_RECEIPT": "Goods Receipt",
        "SALES_ORDER": "Sales Order",
        "INVOICE": "Invoice",
        "STOCK_TRANSFER": "Stock Transfer",
        "EXPENSE": "Expense",
        "CUSTOMER_PAYMENT": "Customer Payment",
        "VENDOR_PAYMENT": "Vendor Payment",
        "CREDIT_NOTE": "Credit Note",
        "STOCK_AUDIT": "Stock Audit",
        "SALES_RETURN": "Sales Return",
        "STOCK_ADJUSTMENT": "Stock Audit",
        "POS_SALE": "POS Sale",
        "FISCAL_REVALUATION": "Fiscal Revaluation",
    }
    return labels.get(value, value)


def json_decimal(value):
    return str(decimal_value(value))
