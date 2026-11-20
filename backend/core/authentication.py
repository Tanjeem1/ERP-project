from datetime import datetime
from uuid import UUID

from django.conf import settings
from django.core.cache import cache
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import Organization, User


ACCESS_COOKIE_NAME = "nexusledger_access"
AUTH_CACHE_SECONDS = 300


def auth_cache_key(user):
    return f"auth:user:{user.pk}:org:{user.organization_id}:v{user.authz_version}"


def cached_user_payload(user):
    organization = user.organization
    return {
        "user": {
            "id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role,
            "authz_version": user.authz_version, "is_active": user.is_active, "is_staff": user.is_staff,
            "is_superuser": user.is_superuser, "organization_id": str(user.organization_id),
            "last_logout_at": user.last_logout_at.isoformat() if user.last_logout_at else None,
            "created_at": user.created_at.isoformat(), "updated_at": user.updated_at.isoformat(),
            "last_login": user.last_login.isoformat() if user.last_login else None,
        },
        "organization": {
            "id": str(organization.id), "created_at": organization.created_at.isoformat(), "updated_at": organization.updated_at.isoformat(),
            "legal_name": organization.legal_name, "display_name": organization.display_name,
            "tax_id": organization.tax_id, "base_currency": organization.base_currency, "timezone": organization.timezone,
            "invoice_footer_note": organization.invoice_footer_note, "email": organization.email, "phone": organization.phone,
            "address_line1": organization.address_line1, "address_line2": organization.address_line2, "city": organization.city,
            "region": organization.region, "postal_code": organization.postal_code, "country_code": organization.country_code,
            "is_sandbox": organization.is_sandbox, "expires_at": organization.expires_at.isoformat() if organization.expires_at else None,
        },
    }


def cache_authenticated_user(user):
    cache.set(auth_cache_key(user), cached_user_payload(user), AUTH_CACHE_SECONDS)


def invalidate_authenticated_user(user):
    cache.delete(auth_cache_key(user))


def ensure_active_organization(organization):
    if organization.is_sandbox and organization.expires_at and organization.expires_at <= timezone.now():
        raise InvalidToken("This demonstration workspace has expired.")


def issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    refresh["organization_id"] = str(user.organization_id)
    refresh["authz_version"] = user.authz_version
    refresh["role"] = user.role
    refresh["email"] = user.email
    refresh["full_name"] = user.full_name
    cache_authenticated_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def set_auth_cookies(response, request, tokens):
    secure = settings.SIMPLE_JWT["AUTH_COOKIE_SECURE"]
    response.set_cookie(
        ACCESS_COOKIE_NAME, tokens["access"], max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        secure=secure, httponly=True, samesite="Lax", path="/",
    )
    response.set_cookie(
        settings.SIMPLE_JWT["AUTH_COOKIE"], tokens["refresh"], max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        secure=secure, httponly=True, samesite="Lax", path=settings.SIMPLE_JWT["AUTH_COOKIE_PATH"],
    )
    response.set_cookie("csrftoken", get_token(request), secure=secure, httponly=False, samesite="Lax", path="/")
    response.set_cookie(
        "nexusledger_session", "1", max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        secure=secure, httponly=False, samesite="Lax", path="/",
    )
    response["Cache-Control"] = "private, no-store"
    return response


def clear_auth_cookies(response):
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(settings.SIMPLE_JWT["AUTH_COOKIE"], path=settings.SIMPLE_JWT["AUTH_COOKIE_PATH"])
    response.delete_cookie("nexusledger_session", path="/")
    response["Cache-Control"] = "private, no-store"
    return response


class CachedJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        raw_token = self.get_raw_token(header) if header is not None else self.get_raw_jwt(request)
        if raw_token is None:
            return None
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token

    def get_raw_jwt(self, request):
        header = self.get_header(request)
        if header is not None:
            return self.get_raw_token(header)
        cookie_token = request.COOKIES.get(ACCESS_COOKIE_NAME)
        if cookie_token is None:
            return None
        if request.method not in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            csrf_header = request.headers.get("X-CSRFToken", "")
            csrf_cookie = request.COOKIES.get("csrftoken", "")
            if not csrf_header or not csrf_cookie or not constant_time_compare(csrf_header, csrf_cookie):
                raise PermissionDenied("CSRF verification failed.")
        return cookie_token.encode()

    def get_user(self, validated_token):
        user_id = validated_token.get("user_id")
        organization_id = validated_token.get("organization_id")
        authz_version = validated_token.get("authz_version")
        token_role = validated_token.get("role")
        if not user_id or not organization_id or not authz_version or not token_role:
            raise InvalidToken("The token is missing required identity claims.")
        key = f"auth:user:{user_id}:org:{organization_id}:v{authz_version}"
        cached = cache.get(key)
        if cached is not None and "created_at" not in cached["user"]:
            cached = None
        if cached is not None:
            cached_user = cached["user"]
            if not cached_user["is_active"]:
                raise InvalidToken("This user account is inactive.")
            if cached_user["role"] != token_role or cached_user["authz_version"] != authz_version:
                raise InvalidToken("The token role or authorization version is no longer valid.")
            logout_at = cached_user.get("last_logout_at")
            if logout_at and validated_token["iat"] < datetime.fromisoformat(logout_at).timestamp():
                raise InvalidToken("The token was issued before the latest logout.")
            user = User(
                id=UUID(cached_user["id"]), email=cached_user["email"], full_name=cached_user["full_name"], role=cached_user["role"],
                authz_version=cached_user["authz_version"], is_active=cached_user["is_active"], is_staff=cached_user["is_staff"],
                is_superuser=cached_user["is_superuser"], organization_id=UUID(cached_user["organization_id"]),
                last_logout_at=datetime.fromisoformat(logout_at) if logout_at else None,
                created_at=datetime.fromisoformat(cached_user["created_at"]), updated_at=datetime.fromisoformat(cached_user["updated_at"]),
                last_login=datetime.fromisoformat(cached_user["last_login"]) if cached_user["last_login"] else None,
            )
            user._state.adding = False
            user._state.db = "default"
            organization_data = {
                **cached["organization"],
                "id": UUID(cached["organization"]["id"]),
                "created_at": datetime.fromisoformat(cached["organization"]["created_at"]),
                "updated_at": datetime.fromisoformat(cached["organization"]["updated_at"]),
                "expires_at": datetime.fromisoformat(cached["organization"]["expires_at"]) if cached["organization"]["expires_at"] else None,
            }
            user.organization = Organization(**organization_data)
            user.organization._state.adding = False
            user.organization._state.db = "default"
            ensure_active_organization(user.organization)
            return user
        try:
            user = User.objects.select_related("organization").get(pk=user_id, organization_id=organization_id, is_active=True)
        except User.DoesNotExist as error:
            raise InvalidToken("The user or organization is no longer active.") from error
        if user.authz_version != authz_version or user.role != token_role:
            invalidate_authenticated_user(user)
            raise InvalidToken("The token role or authorization version is no longer valid.")
        if user.last_logout_at and validated_token["iat"] < user.last_logout_at.timestamp():
            raise InvalidToken("The token was issued before the latest logout.")
        ensure_active_organization(user.organization)
        cache_authenticated_user(user)
        return user


def refresh_token_user(refresh_token):
    try:
        token = RefreshToken(refresh_token)
    except TokenError as error:
        raise InvalidToken("The refresh token is invalid, expired, or revoked.") from error
    user_id = token.get("user_id")
    organization_id = token.get("organization_id")
    authz_version = token.get("authz_version")
    if not user_id or not organization_id or not authz_version or not token.get("role"):
        raise InvalidToken("The token is missing required identity claims.")
    try:
        user = User.objects.select_related("organization").get(pk=user_id, organization_id=organization_id, is_active=True)
    except User.DoesNotExist as error:
        raise InvalidToken("The user or organization is no longer active.") from error
    if user.authz_version != authz_version or user.role != token.get("role"):
        raise InvalidToken("The token role or authorization version is no longer valid.")
    if user.last_logout_at and token["iat"] < user.last_logout_at.timestamp():
        raise InvalidToken("The refresh token was issued before the latest logout.")
    ensure_active_organization(user.organization)
    return user, token
