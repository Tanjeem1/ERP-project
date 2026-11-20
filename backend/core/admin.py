from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import ApprovalRequest, ApprovalRule, AuditEvent, DemoRequest, DocumentSequence, IdempotencyRecord, Notification, Organization, TeamInvitation, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("display_name", "base_currency", "timezone", "is_sandbox", "expires_at")
    list_filter = ("base_currency", "is_sandbox")
    search_fields = ("display_name", "legal_name", "tax_id")


@admin.register(User)
class NexusUserAdmin(UserAdmin):
    list_display = ("email", "full_name", "organization", "role", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff", "organization")
    search_fields = ("email", "full_name")
    ordering = ("email",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Organization", {"fields": ("organization", "full_name", "role", "authz_version")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Security", {"fields": ("last_login", "last_logout_at")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "organization", "full_name", "role", "is_active", "is_staff", "password1", "password2")}),
    )
    filter_horizontal = ("groups", "user_permissions")


@admin.register(TeamInvitation)
class TeamInvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "organization", "role", "status", "expires_at")
    list_filter = ("status", "role")
    search_fields = ("email",)
    readonly_fields = ("token_hash", "accepted_by", "accepted_at")


@admin.register(ApprovalRule)
class ApprovalRuleAdmin(admin.ModelAdmin):
    list_display = ("organization", "entity_type", "threshold_amount", "enforce_credit_limit", "is_active")
    list_filter = ("entity_type", "is_active")


@admin.register(ApprovalRequest)
class ApprovalRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "status", "requested_by", "reviewed_by", "created_at")
    list_filter = ("status", "created_at")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "organization", "user", "kind", "read_at", "created_at")
    list_filter = ("kind", "read_at")


@admin.register(DemoRequest)
class DemoRequestAdmin(admin.ModelAdmin):
    list_display = ("company_name", "work_email", "industry", "status", "created_at")
    list_filter = ("industry", "status", "created_at")
    search_fields = ("company_name", "work_email", "full_name")


@admin.register(IdempotencyRecord)
class IdempotencyRecordAdmin(admin.ModelAdmin):
    list_display = ("key", "organization", "request_path", "response_status", "expires_at")
    readonly_fields = [field.name for field in IdempotencyRecord._meta.fields]


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("action", "entity_type", "entity_id", "actor_name", "actor_role", "created_at")
    list_filter = ("entity_type", "actor_role", "created_at")
    readonly_fields = [field.name for field in AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(DocumentSequence)
class DocumentSequenceAdmin(admin.ModelAdmin):
    list_display = ("organization", "kind", "sequence_name", "next_value")
    list_filter = ("kind",)
