from datetime import date
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model, password_validation
from django.utils import timezone
from rest_framework import serializers

from core.api import CurrencyField, address_input, address_value, minor, role_label
from core.models import ApprovalRequest, AuditEvent, DemoRequest, Notification, Organization, TeamInvitation, User, UserRole


class OrganizationSerializer(serializers.ModelSerializer):
    legalName = serializers.CharField(source="legal_name", read_only=True)
    displayName = serializers.CharField(source="display_name", read_only=True)
    taxId = serializers.CharField(source="tax_id", read_only=True)
    baseCurrency = serializers.CharField(source="base_currency", read_only=True)
    invoiceFooterNote = serializers.CharField(source="invoice_footer_note", read_only=True)
    address = serializers.SerializerMethodField()
    isSandbox = serializers.BooleanField(source="is_sandbox", read_only=True)
    expiresAt = serializers.DateTimeField(source="expires_at", read_only=True, allow_null=True)

    class Meta:
        model = Organization
        fields = ["id", "legalName", "displayName", "taxId", "baseCurrency", "timezone", "invoiceFooterNote", "email", "phone", "address", "isSandbox", "expiresAt"]

    def get_address(self, instance) -> dict:
        return address_value(instance)


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    roleCode = serializers.CharField(source="role", read_only=True)
    fullName = serializers.CharField(source="full_name", read_only=True)
    organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = get_user_model()
        fields = ["id", "email", "fullName", "role", "roleCode", "organization"]

    def get_role(self, instance) -> str:
        return role_label(instance.role)


class RegisterSerializer(serializers.Serializer):
    legalName = serializers.CharField(max_length=180, trim_whitespace=True)
    displayName = serializers.CharField(max_length=120, trim_whitespace=True)
    taxId = serializers.CharField(max_length=80, trim_whitespace=True)
    baseCurrency = CurrencyField()
    timezone = serializers.CharField(max_length=64)
    invoiceFooterNote = serializers.CharField(required=False, allow_blank=True, default="")
    currencyConversionRate = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"), default=Decimal("1.0000"), write_only=True)
    email = serializers.EmailField(required=False)
    contactEmail = serializers.EmailField(required=False, write_only=True)
    password = serializers.CharField(min_length=12, write_only=True, trim_whitespace=False)
    fullName = serializers.CharField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    address = serializers.DictField(required=False, default=dict, write_only=True)

    def validate_timezone(self, value):
        from core.models import validate_timezone

        validate_timezone(value)
        return value

    def validate_address(self, value):
        return address_input(value)

    def validate(self, attrs):
        email = (attrs.get("email") or attrs.get("contactEmail") or "").strip().lower()
        if not email:
            raise serializers.ValidationError({"email": "A work email is required."})
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({"email": "An account already exists for this email."})
        attrs["email"] = email
        password_validation.validate_password(attrs["password"])
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        return value.strip().lower()


class FiscalSettingsSerializer(serializers.Serializer):
    legalName = serializers.CharField(max_length=180, trim_whitespace=True)
    displayName = serializers.CharField(max_length=120, trim_whitespace=True)
    taxId = serializers.CharField(max_length=80, trim_whitespace=True)
    baseCurrency = CurrencyField()
    timezone = serializers.CharField(max_length=64)
    invoiceFooterNote = serializers.CharField(required=False, allow_blank=True, default="")
    currencyConversionRate = serializers.DecimalField(max_digits=18, decimal_places=4, min_value=Decimal("0.0001"))

    def validate_timezone(self, value):
        from core.models import validate_timezone

        validate_timezone(value)
        return value


class TeamInviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=UserRole.choices)

    def validate_email(self, value):
        return value.strip().lower()


class TeamRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=UserRole.choices)


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=32, max_length=128, write_only=True)
    password = serializers.CharField(min_length=12, write_only=True, trim_whitespace=False)
    fullName = serializers.CharField(max_length=150, trim_whitespace=True)

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value


class RoleSwitchSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=UserRole.choices)


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, write_only=True)


class TeamInvitationSerializer(serializers.ModelSerializer):
    invitedBy = serializers.EmailField(source="invited_by.email", read_only=True)
    invitedAt = serializers.DateTimeField(source="created_at", read_only=True)
    expiresAt = serializers.DateTimeField(source="expires_at", read_only=True)
    acceptedAt = serializers.DateTimeField(source="accepted_at", read_only=True, allow_null=True)
    status = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = TeamInvitation
        fields = ["id", "email", "role", "status", "expiresAt", "acceptedAt", "invitedBy", "invitedAt"]


class ApprovalRequestSerializer(serializers.ModelSerializer):
    entityType = serializers.SerializerMethodField()
    entityId = serializers.SerializerMethodField()
    entityNumber = serializers.SerializerMethodField()
    requestedBy = serializers.EmailField(source="requested_by.email", read_only=True)
    requestedByRole = serializers.SerializerMethodField()
    reviewedBy = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    reviewedAt = serializers.DateTimeField(source="reviewed_at", read_only=True, allow_null=True)
    status = serializers.CharField(source="get_status_display", read_only=True)
    amountBaseMinor = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalRequest
        fields = ["id", "entityType", "entityId", "entityNumber", "status", "reason", "requestedBy", "requestedByRole", "reviewedBy", "createdAt", "reviewedAt", "amountBaseMinor"]

    def get_entityType(self, instance) -> str:
        return "Purchase Order" if instance.purchase_order_id else "Sales Order"

    def get_entityId(self, instance) -> str:
        return str(instance.purchase_order_id or instance.sales_order_id)

    def get_entityNumber(self, instance) -> str:
        return (instance.purchase_order or instance.sales_order).number

    def get_requestedByRole(self, instance) -> str:
        return role_label(instance.requested_by_role)

    def get_reviewedBy(self, instance) -> str | None:
        return instance.reviewed_by.email if instance.reviewed_by else None

    def get_amountBaseMinor(self, instance) -> int:
        entity = instance.purchase_order or instance.sales_order
        return minor(entity.total_base_amount if instance.purchase_order_id else entity.total_base)


class NotificationSerializer(serializers.ModelSerializer):
    readAt = serializers.DateTimeField(source="read_at", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    expiresAt = serializers.DateTimeField(source="expires_at", read_only=True, allow_null=True)

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "message", "href", "readAt", "createdAt", "expiresAt"]


class AuditEventSerializer(serializers.ModelSerializer):
    timestamp = serializers.DateTimeField(source="created_at", read_only=True)
    userId = serializers.UUIDField(source="actor_id", read_only=True, allow_null=True)
    userName = serializers.CharField(source="actor_name", read_only=True)
    role = serializers.SerializerMethodField()
    entityType = serializers.CharField(source="entity_type", read_only=True)
    entityId = serializers.UUIDField(source="entity_id", read_only=True)
    oldValue = serializers.JSONField(source="old_value", read_only=True)
    newValue = serializers.JSONField(source="new_value", read_only=True)

    class Meta:
        model = AuditEvent
        fields = ["id", "timestamp", "userId", "userName", "role", "action", "entityType", "entityId", "oldValue", "newValue"]

    def get_role(self, instance) -> str:
        return role_label(instance.actor_role)


class DemoRequestSerializer(serializers.ModelSerializer):
    workEmail = serializers.EmailField(source="work_email")
    companyName = serializers.CharField(source="company_name", max_length=180, trim_whitespace=True)
    fullName = serializers.CharField(source="full_name", max_length=150, trim_whitespace=True)
    warehouseCount = serializers.IntegerField(source="warehouse_count", min_value=1, max_value=100000)
    monthlyShipments = serializers.IntegerField(source="monthly_shipments", min_value=0, max_value=100000000)
    skuCount = serializers.IntegerField(source="sku_count", min_value=0, max_value=100000000)
    consent = serializers.BooleanField()

    class Meta:
        model = DemoRequest
        fields = ["fullName", "workEmail", "companyName", "phone", "industry", "warehouseCount", "monthlyShipments", "skuCount", "message", "consent"]

    def validate_work_email(self, value):
        return value.strip().lower()

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Consent is required before our sales team can contact you.")
        return True


class DateRangeSerializer(serializers.Serializer):
    startDate = serializers.DateField(required=False)
    endDate = serializers.DateField(required=False)

    def validate(self, attrs):
        organization = self.context.get("organization")
        today = timezone.now().astimezone(ZoneInfo(organization.timezone)).date() if organization else timezone.now().date()
        start = attrs.get("startDate") or date(2000, 1, 1)
        end = attrs.get("endDate") or today
        if start > end:
            raise serializers.ValidationError("Start date must be on or before end date.")
        attrs["startDate"] = start
        attrs["endDate"] = end
        return attrs


class HealthCheckSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["ok", "degraded"])
    checks = serializers.DictField(child=serializers.BooleanField())
    durationMs = serializers.FloatField()


class AuthenticatedPayloadSerializer(serializers.Serializer):
    user = UserSerializer()
    organization = OrganizationSerializer()
    sandbox = serializers.DictField(required=False)


class TeamSettingsSerializer(serializers.Serializer):
    members = UserSerializer(many=True)
    invitations = TeamInvitationSerializer(many=True)


class DemoAcceptedSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.CharField()
    createdAt = serializers.DateTimeField()


class PublicBenchmarkSerializer(serializers.Serializer):
    scenario = serializers.CharField()
    monthlyShipments = serializers.IntegerField()
    warehouses = serializers.IntegerField()
    manualAccountingHours = serializers.FloatField()
    automatedAccountingHours = serializers.FloatField()
    estimatedHoursSaved = serializers.FloatField()
    assumptions = serializers.DictField(child=serializers.FloatField())


class SearchResultSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    type = serializers.CharField()
    title = serializers.CharField()
    subtitle = serializers.CharField()
    href = serializers.CharField()
    module = serializers.CharField()
    score = serializers.FloatField()


class SearchResponseSerializer(serializers.Serializer):
    results = SearchResultSerializer(many=True)


class RejectionReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=2000, trim_whitespace=True)


class FiscalSettingsResponseSerializer(OrganizationSerializer):
    revaluationJournalId = serializers.UUIDField(required=False, allow_null=True)

    class Meta(OrganizationSerializer.Meta):
        fields = [*OrganizationSerializer.Meta.fields, "revaluationJournalId"]
