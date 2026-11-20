import hashlib
import secrets
import time
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.core.mail import send_mail
from django.db import IntegrityError, connections, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view, action, permission_classes, throttle_classes
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.authentication import clear_auth_cookies, invalidate_authenticated_user, issue_tokens, refresh_token_user, set_auth_cookies
from core.models import ApprovalRequest, ApprovalReviewStatus, AuditEvent, DemoRequest, Notification, TeamInvitation, User, UserRole
from core.serializers import AcceptInvitationSerializer, ApprovalRequestSerializer, AuditEventSerializer, AuthenticatedPayloadSerializer, DemoAcceptedSerializer, DemoRequestSerializer, FiscalSettingsResponseSerializer, FiscalSettingsSerializer, HealthCheckSerializer, LoginSerializer, NotificationSerializer, PublicBenchmarkSerializer, RefreshSerializer, RegisterSerializer, RejectionReasonSerializer, RoleSwitchSerializer, SearchResponseSerializer, TeamInvitationSerializer, TeamInviteSerializer, TeamRoleSerializer, TeamSettingsSerializer, UserSerializer
from core.services.actors import Permission, assert_permission, record_audit
from core.services.fiscal import update_fiscal_settings
from core.services.organizations import provision_organization
from core.services.sandbox import provision_sandbox
from core.services.search import global_search
from core.services.time import local_date_range
from core.viewsets import TenantViewSet
from orders.services import approve_sales_order, reject_sales_order
from procurement.services import approve_purchase_order, reject_purchase_order


@extend_schema(responses=HealthCheckSerializer, auth=[])
@never_cache
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def health_check(request):
    started = time.monotonic()
    checks = {"postgres": False, "redis": False}
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["postgres"] = True
    except Exception:
        pass
    try:
        cache.set("health:probe", "ok", timeout=5)
        checks["redis"] = cache.get("health:probe") == "ok"
    except Exception:
        pass
    healthy = all(checks.values())
    return Response(
        {"status": "ok" if healthy else "degraded", "checks": checks, "durationMs": round((time.monotonic() - started) * 1000, 2)},
        status=200 if healthy else 503,
    )


def authenticated_payload(user):
    return {"user": UserSerializer(user).data, "organization": UserSerializer(user).data["organization"]}


def cookie_authenticated_response(request, user, status=200):
    response = Response(authenticated_payload(user), status=status)
    return set_auth_cookies(response, request, issue_tokens(user))


def require_cookie_csrf(request):
    header = request.headers.get("X-CSRFToken", "")
    cookie = request.COOKIES.get("csrftoken", "")
    if not header or not cookie or not constant_time_compare(header, cookie):
        raise PermissionDenied("CSRF verification failed.")


def require_super_admin(request):
    if request.user.role != UserRole.SUPER_ADMIN:
        raise PermissionDenied("Only a Super Admin can manage organization settings and team access.")


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "register"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            organization, user = provision_organization(
                legal_name=data["legalName"], display_name=data["displayName"], tax_id=data["taxId"],
                base_currency=data["baseCurrency"], timezone=data["timezone"], invoice_footer_note=data["invoiceFooterNote"],
                email=data["email"], password=data["password"], full_name=data["fullName"], phone=data["phone"], **data["address"],
            )
        except IntegrityError as error:
            raise ValidationError({"email": "An account already exists for this email."}) from error
        return cookie_authenticated_response(request, user, status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.select_related("organization").filter(email__iexact=serializer.validated_data["email"]).first()
        if user is None or not user.is_active or not user.check_password(serializer.validated_data["password"]):
            raise AuthenticationFailed("The email or password is incorrect.")
        if user.organization.is_sandbox and user.organization.expires_at and user.organization.expires_at <= timezone.now():
            raise AuthenticationFailed("This demonstration workspace has expired.")
        return cookie_authenticated_response(request, user)


class RefreshView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "login"

    def post(self, request):
        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw_token = serializer.validated_data.get("refresh") or request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE"])
        if not raw_token:
            raise AuthenticationFailed("A refresh token is required.")
        if not serializer.validated_data.get("refresh"):
            require_cookie_csrf(request)
        user, previous_token = refresh_token_user(raw_token)
        previous_token.blacklist()
        return cookie_authenticated_response(request, user)


class LogoutView(APIView):
    def post(self, request):
        raw_token = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE"])
        if raw_token:
            require_cookie_csrf(request)
            try:
                RefreshToken(raw_token).blacklist()
            except TokenError:
                pass
        invalidate_authenticated_user(request.user)
        request.user.last_logout_at = timezone.now().replace(microsecond=0)
        request.user.authz_version += 1
        request.user.save(update_fields=["last_logout_at", "authz_version", "updated_at"])
        invalidate_authenticated_user(request.user)
        response = Response(status=204)
        clear_auth_cookies(response)
        response.delete_cookie("csrftoken", path="/")
        return response


class MeView(APIView):
    def get(self, request):
        return Response(authenticated_payload(request.user))


class SandboxView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "sandbox"

    def post(self, request):
        organization, user = provision_sandbox()
        response = cookie_authenticated_response(request, user, status=201)
        response.data["sandbox"] = {"id": str(organization.id), "expiresAt": organization.expires_at.isoformat()}
        return response


class SandboxRoleView(APIView):
    def post(self, request):
        organization = request.user.organization
        if not organization.is_sandbox or (organization.expires_at and organization.expires_at <= timezone.now()):
            raise PermissionDenied("Role switching is available only in an active demonstration workspace.")
        serializer = RoleSwitchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old_role = request.user.role
        request.user.role = serializer.validated_data["role"]
        request.user.save(update_fields=["role", "updated_at"])
        invalidate_authenticated_user(request.user)
        record_audit(organization, request.user, "Sandbox role switched", "User", request.user.id, old_value={"role": old_role}, new_value={"role": request.user.role})
        return cookie_authenticated_response(request, request.user)


class BookDemoView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "demo_request"

    def post(self, request):
        serializer = DemoRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        ip_address = forwarded_for.split(",")[-1].strip() or request.META.get("REMOTE_ADDR")
        lead = serializer.save(source_path=request.path, ip_address=ip_address or None)
        return Response({"id": str(lead.id), "status": "received", "createdAt": lead.created_at.isoformat()}, status=201)


class PublicBenchmarksView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request):
        key = "public:benchmarks:v1"
        data = cache.get(key)
        if data is None:
            shipments = 2400
            warehouses = 3
            manual_minutes = shipments * 4 + warehouses * 8 * 60
            automated_minutes = shipments * 0.5 + warehouses * 2 * 60
            data = {
                "scenario": "Illustrative operating model, not a customer performance claim.",
                "monthlyShipments": shipments,
                "warehouses": warehouses,
                "manualAccountingHours": round(manual_minutes / 60, 2),
                "automatedAccountingHours": round(automated_minutes / 60, 2),
                "estimatedHoursSaved": round((manual_minutes - automated_minutes) / 60, 2),
                "assumptions": {"manualMinutesPerShipment": 4, "automatedMinutesPerShipment": 0.5, "manualHoursPerWarehouse": 8, "automatedHoursPerWarehouse": 2},
            }
            cache.set(key, data, timeout=3600)
        return Response(data)


class FiscalSettingsView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data["organization"])

    def patch(self, request):
        require_super_admin(request)
        serializer = FiscalSettingsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        organization = request.user.organization
        data = {
            "legal_name": organization.legal_name, "display_name": organization.display_name, "tax_id": organization.tax_id,
            "base_currency": organization.base_currency, "timezone": organization.timezone,
            "invoice_footer_note": organization.invoice_footer_note, "currency_conversion_rate": "1.0000",
        }
        data.update(serializer.validated_data)
        revaluation = update_fiscal_settings(organization, request.user, **data)
        invalidate_authenticated_user(request.user)
        payload = UserSerializer(organization.users.get(pk=request.user.id)).data["organization"]
        payload["revaluationJournalId"] = str(revaluation.id) if revaluation else None
        return Response(payload)


class TeamSettingsView(APIView):
    def get(self, request):
        require_super_admin(request)
        organization = request.user.organization
        invitations = TeamInvitation.objects.filter(organization=organization).select_related("invited_by").order_by("-created_at")
        members = User.objects.filter(organization=organization).select_related("organization").order_by("email")
        return Response({"members": UserSerializer(members, many=True).data, "invitations": TeamInvitationSerializer(invitations, many=True).data})

    def post(self, request):
        require_super_admin(request)
        serializer = TeamInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        organization = request.user.organization
        if User.objects.filter(email__iexact=data["email"]).exists():
            raise ValidationError({"email": "This email already belongs to a user account."})
        if TeamInvitation.objects.filter(organization=organization, email__iexact=data["email"], status=TeamInvitation.Status.PENDING).exists():
            raise ValidationError({"email": "A pending invitation already exists for this email."})
        raw_token = secrets.token_urlsafe(40)
        invitation = TeamInvitation.objects.create(
            organization=organization, email=data["email"], role=data["role"], token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            invited_by=request.user, expires_at=timezone.now() + timedelta(days=7),
        )
        base_url = getattr(settings, "PUBLIC_APP_URL", "http://localhost:3000")
        send_mail(
            "Your NexusLedger ERP team invitation",
            f"You were invited to {organization.display_name} as {invitation.get_role_display()}. Accept your invitation: {base_url}/register?invitation={raw_token}",
            getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@nexusledger.com"), [invitation.email], fail_silently=False,
        )
        record_audit(organization, request.user, "Team invitation created", "TeamInvitation", invitation.id, new_value={"email": invitation.email, "role": invitation.role})
        return Response(TeamInvitationSerializer(invitation).data, status=201)


class TeamMemberRoleView(APIView):
    def patch(self, request, user_id):
        require_super_admin(request)
        serializer = TeamRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = User.objects.select_related("organization").get(organization=request.user.organization, pk=user_id, is_active=True)
        new_role = serializer.validated_data["role"]
        if target.role == new_role:
            return Response(UserSerializer(target).data)
        if target.role == UserRole.SUPER_ADMIN and not User.objects.filter(organization=target.organization, role=UserRole.SUPER_ADMIN, is_active=True).exclude(pk=target.pk).exists():
            raise ValidationError("The organization must retain at least one Super Admin.")
        old_role = target.role
        target.role = new_role
        target.save(update_fields=["role", "updated_at"])
        invalidate_authenticated_user(target)
        record_audit(target.organization, request.user, "Team member role updated", "User", target.id, old_value={"role": old_role}, new_value={"role": target.role})
        return Response(UserSerializer(target).data)


class RevokeInvitationView(APIView):
    def post(self, request, invitation_id):
        require_super_admin(request)
        invitation = TeamInvitation.objects.get(organization=request.user.organization, pk=invitation_id, status=TeamInvitation.Status.PENDING)
        invitation.status = TeamInvitation.Status.REVOKED
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=["status", "revoked_at", "updated_at"])
        record_audit(request.user.organization, request.user, "Team invitation revoked", "TeamInvitation", invitation.id, new_value={"status": invitation.status})
        return Response(TeamInvitationSerializer(invitation).data)


class AcceptInvitationView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "register"

    @transaction.atomic
    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token_hash = hashlib.sha256(serializer.validated_data["token"].encode()).hexdigest()
        invitation = TeamInvitation.objects.select_for_update().select_related("organization").filter(token_hash=token_hash, status=TeamInvitation.Status.PENDING).first()
        if invitation is None or invitation.expires_at <= timezone.now():
            raise ValidationError("This invitation is invalid, revoked, or expired.")
        if User.objects.filter(email__iexact=invitation.email).exists():
            raise ValidationError("A user account already exists for this invitation email.")
        data = serializer.validated_data
        user = User.objects.create_user(email=invitation.email, password=data["password"], organization=invitation.organization, full_name=data["fullName"], role=invitation.role)
        invitation.status = TeamInvitation.Status.ACCEPTED
        invitation.accepted_by = user
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["status", "accepted_by", "accepted_at", "updated_at"])
        record_audit(invitation.organization, user, "Team invitation accepted", "User", user.id, new_value={"role": user.role})
        return cookie_authenticated_response(request, user, status=201)


class ApprovalViewSet(TenantViewSet):
    queryset = ApprovalRequest.objects.select_related("requested_by", "reviewed_by", "purchase_order", "sales_order", "rule")
    serializer_class = ApprovalRequestSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.APPROVE_TRANSACTIONS)
        queryset = super().get_queryset().order_by("-created_at")
        status = self.request.query_params.get("status", ApprovalReviewStatus.PENDING)
        if status != "ALL":
            queryset = queryset.filter(status=status.upper())
        return queryset

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        approval = self.get_object()
        if approval.purchase_order_id:
            approve_purchase_order(self.get_organization(), request.user, approval.purchase_order_id)
        else:
            approve_sales_order(self.get_organization(), request.user, approval.sales_order_id)
        approval.refresh_from_db()
        return Response(self.get_serializer(approval).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        serializer = RejectionReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        approval = self.get_object()
        if approval.purchase_order_id:
            reject_purchase_order(self.get_organization(), request.user, approval.purchase_order_id, reason)
        else:
            reject_sales_order(self.get_organization(), request.user, approval.sales_order_id, reason)
        approval.refresh_from_db()
        return Response(self.get_serializer(approval).data)


class NotificationViewSet(TenantViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer

    def get_queryset(self):
        user = self.request.user
        recipients = Q(user=user) | (Q(user=None) & Q(role__in=["", user.role]))
        if user.role == UserRole.SUPER_ADMIN:
            recipients |= Q(user=None)
        return super().get_queryset().filter(recipients).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())).order_by("-created_at")

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=True, methods=["post"], url_path="read")
    def read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at", "updated_at"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        updated = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now(), updated_at=timezone.now())
        return Response({"updated": updated})


class AuditLogViewSet(TenantViewSet):
    queryset = AuditEvent.objects.select_related("actor")
    serializer_class = AuditEventSerializer

    def get_queryset(self):
        assert_permission(self.request.user, self.get_organization(), Permission.VIEW_GOVERNANCE)
        queryset = super().get_queryset().order_by("-created_at")
        params = self.request.query_params
        if params.get("entityType"):
            queryset = queryset.filter(entity_type=params["entityType"])
        if params.get("entityId"):
            queryset = queryset.filter(entity_id=params["entityId"])
        if params.get("startDate") or params.get("endDate"):
            start, end = local_date_range(self.get_organization(), params.get("startDate", "2000-01-01"), params.get("endDate", "2999-12-31"))
            queryset = queryset.filter(created_at__gte=start, created_at__lte=end)
        return queryset


class SearchView(APIView):
    throttle_scope = "search"

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response({"results": []})
        if len(query) > 100:
            raise ValidationError({"q": "Search queries are limited to 100 characters."})
        return Response({"results": global_search(request.user.organization, request.user, query, limit=10)})


RegisterView = extend_schema(request=RegisterSerializer, responses=AuthenticatedPayloadSerializer)(RegisterView)
LoginView = extend_schema(request=LoginSerializer, responses=AuthenticatedPayloadSerializer)(LoginView)
RefreshView = extend_schema(request=RefreshSerializer, responses=AuthenticatedPayloadSerializer)(RefreshView)
LogoutView = extend_schema(request=None, responses=None)(LogoutView)
MeView = extend_schema(responses=AuthenticatedPayloadSerializer)(MeView)
SandboxView = extend_schema(request=None, responses=AuthenticatedPayloadSerializer)(SandboxView)
SandboxRoleView = extend_schema(request=RoleSwitchSerializer, responses=AuthenticatedPayloadSerializer)(SandboxRoleView)
BookDemoView = extend_schema(request=DemoRequestSerializer, responses=DemoAcceptedSerializer)(BookDemoView)
PublicBenchmarksView = extend_schema(responses=PublicBenchmarkSerializer)(PublicBenchmarksView)
FiscalSettingsView.get = extend_schema(responses=FiscalSettingsResponseSerializer)(FiscalSettingsView.get)
FiscalSettingsView.patch = extend_schema(request=FiscalSettingsSerializer, responses=FiscalSettingsResponseSerializer)(FiscalSettingsView.patch)
TeamSettingsView.get = extend_schema(responses=TeamSettingsSerializer)(TeamSettingsView.get)
TeamSettingsView.post = extend_schema(request=TeamInviteSerializer, responses=TeamInvitationSerializer)(TeamSettingsView.post)
TeamMemberRoleView = extend_schema(request=TeamRoleSerializer, responses=UserSerializer)(TeamMemberRoleView)
RevokeInvitationView = extend_schema(request=None, responses=TeamInvitationSerializer)(RevokeInvitationView)
AcceptInvitationView = extend_schema(request=AcceptInvitationSerializer, responses=AuthenticatedPayloadSerializer)(AcceptInvitationView)
ApprovalViewSet.approve = extend_schema(request=None, responses=ApprovalRequestSerializer)(ApprovalViewSet.approve)
ApprovalViewSet.reject = extend_schema(request=RejectionReasonSerializer, responses=ApprovalRequestSerializer)(ApprovalViewSet.reject)
NotificationViewSet.read = extend_schema(request=None, responses=NotificationSerializer)(NotificationViewSet.read)
NotificationViewSet.read_all = extend_schema(request=None, responses=None)(NotificationViewSet.read_all)
SearchView.get = extend_schema(parameters=[OpenApiParameter("q", str, required=True)], responses=SearchResponseSerializer)(SearchView.get)


RegisterView.authentication_classes = []
LoginView.authentication_classes = []
RefreshView.authentication_classes = []
SandboxView.authentication_classes = []
BookDemoView.authentication_classes = []
PublicBenchmarksView.authentication_classes = []
AcceptInvitationView.authentication_classes = []
health_check.cls.authentication_classes = []
