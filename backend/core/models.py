import uuid
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords


class Currency(models.TextChoices):
    USD = "USD", "USD"
    EUR = "EUR", "EUR"
    GBP = "GBP", "GBP"
    CNY = "CNY", "CNY"
    AED = "AED", "AED"
    INR = "INR", "INR"


class UserRole(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
    ACCOUNTANT = "ACCOUNTANT", "Accountant"
    WAREHOUSE_MANAGER = "WAREHOUSE_MANAGER", "Warehouse Manager"
    SALES_OFFICER = "SALES_OFFICER", "Sales Officer"


class ApprovalStatus(models.TextChoices):
    NOT_REQUIRED = "NOT_REQUIRED", "Not Required"
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class ApprovalReviewStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class ApprovalEntityType(models.TextChoices):
    PURCHASE_ORDER = "PURCHASE_ORDER", "Purchase Order"
    SALES_ORDER = "SALES_ORDER", "Sales Order"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    CHEQUE = "CHEQUE", "Cheque"
    MOBILE_BANKING = "MOBILE_BANKING", "Mobile Banking"


class PaymentStatus(models.TextChoices):
    POSTED = "POSTED", "Posted"
    REPLACED = "REPLACED", "Replaced"


class ExpenseCategory(models.TextChoices):
    WAREHOUSE_RENT = "WAREHOUSE_RENT", "Warehouse Rent"
    DELIVERY_FUEL = "DELIVERY_FUEL", "Delivery Fuel"
    FREIGHT_PORT_MISC = "FREIGHT_PORT_MISC", "Freight/Port Misc"
    STAFF_PAYROLL = "STAFF_PAYROLL", "Staff Payroll"
    UTILITIES = "UTILITIES", "Utilities"
    INVENTORY_SHRINKAGE = "INVENTORY_SHRINKAGE", "Inventory Shrinkage"


class JournalStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    REVERSED = "REVERSED", "Reversed"


class JournalSourceType(models.TextChoices):
    OPENING_BALANCE = "OPENING_BALANCE", "Opening Balance"
    PURCHASE_ORDER = "PURCHASE_ORDER", "Purchase Order"
    GOODS_RECEIPT = "GOODS_RECEIPT", "Goods Receipt"
    SALES_ORDER = "SALES_ORDER", "Sales Order"
    INVOICE = "INVOICE", "Invoice"
    STOCK_TRANSFER = "STOCK_TRANSFER", "Stock Transfer"
    EXPENSE = "EXPENSE", "Expense"
    CUSTOMER_PAYMENT = "CUSTOMER_PAYMENT", "Customer Payment"
    VENDOR_PAYMENT = "VENDOR_PAYMENT", "Vendor Payment"
    CREDIT_NOTE = "CREDIT_NOTE", "Credit Note"
    STOCK_AUDIT = "STOCK_AUDIT", "Stock Audit"
    SALES_RETURN = "SALES_RETURN", "Sales Return"
    STOCK_ADJUSTMENT = "STOCK_ADJUSTMENT", "Stock Adjustment"
    POS_SALE = "POS_SALE", "POS Sale"
    FISCAL_REVALUATION = "FISCAL_REVALUATION", "Fiscal Revaluation"


class ActivityType(models.TextChoices):
    PROCUREMENT = "PROCUREMENT", "Procurement"
    INVENTORY = "INVENTORY", "Inventory"
    SALES = "SALES", "Sales"
    FINANCE = "FINANCE", "Finance"
    SYSTEM = "SYSTEM", "System"


class DocumentKind(models.TextChoices):
    PURCHASE_ORDER = "PURCHASE_ORDER", "Purchase Order"
    GOODS_RECEIPT = "GOODS_RECEIPT", "Goods Receipt"
    SALES_ORDER = "SALES_ORDER", "Sales Order"
    INVOICE = "INVOICE", "Invoice"
    JOURNAL = "JOURNAL", "Journal Entry"
    TRANSFER = "TRANSFER", "Stock Transfer"
    RESERVATION = "RESERVATION", "Stock Reservation"
    ACTIVITY = "ACTIVITY", "Activity Event"
    EXPENSE = "EXPENSE", "Expense"
    CUSTOMER_PAYMENT = "CUSTOMER_PAYMENT", "Customer Payment"
    VENDOR_PAYMENT = "VENDOR_PAYMENT", "Vendor Payment"
    SALES_RETURN = "SALES_RETURN", "Sales Return"
    CREDIT_NOTE = "CREDIT_NOTE", "Credit Note"
    STOCK_AUDIT = "STOCK_AUDIT", "Stock Audit"
    ENTITY = "ENTITY", "Entity"


def decimal_field(*, default=Decimal("0.0000"), **kwargs):
    return models.DecimalField(max_digits=18, decimal_places=4, default=default, **kwargs)


def non_negative_decimal_field(**kwargs):
    validators = kwargs.pop("validators", [])
    return decimal_field(validators=[MinValueValidator(Decimal("0.0000")), *validators], **kwargs)


def positive_decimal_field(**kwargs):
    validators = kwargs.pop("validators", [])
    return decimal_field(validators=[MinValueValidator(Decimal("0.0001")), *validators], **kwargs)


def validate_timezone(value):
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as error:
        raise ValidationError("Enter a valid IANA timezone, such as Asia/Dhaka.") from error


def validate_approver_roles(value):
    if not isinstance(value, list) or not value:
        raise ValidationError("At least one approver role is required.")
    allowed = set(UserRole.values)
    if any(role not in allowed for role in value):
        raise ValidationError("Approver roles contain an unsupported role.")


class TimestampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantModel(TimestampedModel):
    organization = models.ForeignKey("core.Organization", on_delete=models.PROTECT, related_name="%(app_label)s_%(class)s_records")

    class Meta:
        abstract = True


class AddressModel(models.Model):
    address_line1 = models.CharField(max_length=180, blank=True)
    address_line2 = models.CharField(max_length=180, blank=True)
    city = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=24, blank=True)
    country_code = models.CharField(max_length=2, default="US")

    class Meta:
        abstract = True


class ActorModel(models.Model):
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_created",
    )
    created_by_role = models.CharField(max_length=32, choices=UserRole.choices, blank=True)

    class Meta:
        abstract = True


class Organization(TimestampedModel):
    legal_name = models.CharField(max_length=180)
    display_name = models.CharField(max_length=120)
    tax_id = models.CharField(max_length=80)
    base_currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.USD)
    timezone = models.CharField(max_length=64, default="UTC", validators=[validate_timezone])
    invoice_footer_note = models.TextField(blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address_line1 = models.CharField(max_length=180, blank=True)
    address_line2 = models.CharField(max_length=180, blank=True)
    city = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=24, blank=True)
    country_code = models.CharField(max_length=2, default="US")
    is_sandbox = models.BooleanField(default=False, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)

    history = HistoricalRecords()

    class Meta:
        indexes = [models.Index(fields=["is_sandbox", "expires_at"], name="core_org_sandbox_expiry_idx")]

    def __str__(self):
        return self.display_name


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        if not extra_fields.get("organization") and not extra_fields.get("is_superuser"):
            raise ValueError("A user must belong to an organization.")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", UserRole.SUPER_ADMIN)
        if not extra_fields.get("is_staff") or not extra_fields.get("is_superuser"):
            raise ValueError("A superuser must have staff and superuser permissions.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimestampedModel):
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name="users", null=True, blank=True)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=32, choices=UserRole.choices, default=UserRole.SALES_OFFICER)
    authz_version = models.PositiveIntegerField(default=1)
    last_logout_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()
    history = HistoricalRecords(excluded_fields=["password"])

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        indexes = [
            models.Index(fields=["organization", "role"], name="core_user_org_role_idx"),
            models.Index(fields=["email"], name="core_user_email_idx"),
        ]

    def save(self, *args, **kwargs):
        self.email = type(self).objects.normalize_email(self.email).lower()
        if self.pk and not self._state.adding:
            previous = type(self).objects.filter(pk=self.pk).values("role", "authz_version", "is_active").first()
            if previous and (previous["role"] != self.role or (previous["is_active"] and not self.is_active)):
                from django.core.cache import cache

                cache.delete(f"auth:user:{self.pk}:org:{self.organization_id}:v{previous['authz_version']}")
            if previous and previous["role"] != self.role:
                self.authz_version = previous["authz_version"] + 1
                if kwargs.get("update_fields") is not None:
                    kwargs["update_fields"] = {*kwargs["update_fields"], "authz_version"}
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class TeamInvitation(TenantModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REVOKED = "REVOKED", "Revoked"
        EXPIRED = "EXPIRED", "Expired"

    email = models.EmailField()
    role = models.CharField(max_length=32, choices=UserRole.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sent_invitations")
    accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="accepted_invitations")
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    history = HistoricalRecords(excluded_fields=["token_hash"])

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "email"], condition=models.Q(status="PENDING"), name="core_invitation_pending_unique"),
        ]
        indexes = [models.Index(fields=["organization", "status", "expires_at"], name="core_invite_status_idx")]


class ApprovalRule(TenantModel):
    entity_type = models.CharField(max_length=24, choices=ApprovalEntityType.choices)
    threshold_amount = non_negative_decimal_field(default=Decimal("5000.0000"))
    enforce_credit_limit = models.BooleanField(default=False)
    approver_roles = models.JSONField(default=list, validators=[validate_approver_roles])
    is_active = models.BooleanField(default=True)

    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "entity_type"], name="core_approval_rule_entity_unique"),
        ]


class ApprovalRequest(TenantModel):
    rule = models.ForeignKey(ApprovalRule, on_delete=models.PROTECT, related_name="requests")
    purchase_order = models.ForeignKey("procurement.PurchaseOrder", on_delete=models.PROTECT, null=True, blank=True, related_name="approval_requests")
    sales_order = models.ForeignKey("orders.SalesOrder", on_delete=models.PROTECT, null=True, blank=True, related_name="approval_requests")
    status = models.CharField(max_length=16, choices=ApprovalReviewStatus.choices, default=ApprovalReviewStatus.PENDING, db_index=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="approval_requests")
    requested_by_role = models.CharField(max_length=32, choices=UserRole.choices)
    reason = models.TextField()
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_approvals")
    reviewed_at = models.DateTimeField(null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(purchase_order__isnull=False, sales_order__isnull=True)
                    | models.Q(purchase_order__isnull=True, sales_order__isnull=False)
                ),
                name="core_approval_exactly_one_entity",
            ),
        ]
        indexes = [models.Index(fields=["organization", "status", "created_at"], name="core_approval_queue_idx")]


class Notification(TenantModel):
    class Kind(models.TextChoices):
        LOW_STOCK = "LOW_STOCK", "Low Stock"
        OVERDUE_DEBT = "OVERDUE_DEBT", "Overdue Debt"
        PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
        SYSTEM = "SYSTEM", "System"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    role = models.CharField(max_length=32, choices=UserRole.choices, blank=True)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    title = models.CharField(max_length=180)
    message = models.TextField()
    href = models.CharField(max_length=500, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["organization", "user", "read_at"], name="core_notification_unread_idx")]


class DemoRequest(TimestampedModel):
    class Industry(models.TextChoices):
        WHOLESALE_DISTRIBUTION = "WHOLESALE_DISTRIBUTION", "Wholesale Distribution"
        FMCG = "FMCG", "FMCG"
        RETAIL_ECOMMERCE = "RETAIL_ECOMMERCE", "Retail E-commerce"
        IMPORT_EXPORT = "IMPORT_EXPORT", "Import/Export"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        QUALIFIED = "QUALIFIED", "Qualified"
        CLOSED = "CLOSED", "Closed"

    full_name = models.CharField(max_length=150)
    work_email = models.EmailField()
    company_name = models.CharField(max_length=180)
    phone = models.CharField(max_length=40, blank=True)
    industry = models.CharField(max_length=32, choices=Industry.choices, default=Industry.OTHER)
    warehouse_count = non_negative_decimal_field(default=Decimal("1.0000"))
    monthly_shipments = non_negative_decimal_field()
    sku_count = non_negative_decimal_field()
    message = models.TextField(blank=True)
    source_path = models.CharField(max_length=255, default="/book-demo")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)
    consent = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["work_email", "created_at"], name="core_demo_request_email_idx")]


class IdempotencyRecord(TenantModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="idempotency_records")
    key = models.CharField(max_length=128)
    request_path = models.CharField(max_length=255)
    request_hash = models.CharField(max_length=64)
    response_status = models.PositiveSmallIntegerField(default=0)
    response_body = models.JSONField(default=dict)
    resource_type = models.CharField(max_length=80, blank=True)
    resource_id = models.UUIDField(null=True, blank=True)
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "key"], name="core_idempotency_key_unique")]
        indexes = [models.Index(fields=["organization", "expires_at"], name="core_idempotency_expiry_idx")]


class AuditEvent(TenantModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="audit_events")
    actor_name = models.CharField(max_length=150, blank=True)
    actor_role = models.CharField(max_length=32, choices=[*UserRole.choices, ("SYSTEM", "System")], default="SYSTEM")
    action = models.CharField(max_length=180)
    entity_type = models.CharField(max_length=80)
    entity_id = models.UUIDField()
    old_value = models.JSONField(default=dict)
    new_value = models.JSONField(default=dict)
    request_id = models.UUIDField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "entity_type", "entity_id"], name="core_audit_entity_idx"),
            models.Index(fields=["organization", "created_at"], name="core_audit_created_idx"),
        ]


class ActivityEvent(TenantModel):
    event_type = models.CharField(max_length=16, choices=ActivityType.choices)
    title = models.CharField(max_length=180)
    description = models.TextField()
    reference = models.CharField(max_length=120)
    href = models.CharField(max_length=500)
    journal_entries = models.ManyToManyField("finance.JournalEntry", related_name="activity_events", blank=True)

    class Meta:
        indexes = [models.Index(fields=["organization", "event_type", "created_at"], name="core_activity_feed_idx")]


class DocumentSequence(TenantModel):
    kind = models.CharField(max_length=32, choices=DocumentKind.choices)
    sequence_name = models.CharField(max_length=63, unique=True)
    next_value = models.BigIntegerField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "kind"], name="core_document_sequence_unique")]
