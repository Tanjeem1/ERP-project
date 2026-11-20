import hashlib
import json
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError
from django.http import JsonResponse
from django.urls import Resolver404, resolve
from django.utils import timezone
from rest_framework.exceptions import APIException

from core.authentication import CachedJWTAuthentication
from core.models import IdempotencyRecord
from core.services.cache import jsonable


class ApiTrailingSlashMiddleware:
    """Keep API posts working when a proxy drops Django's trailing slash."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info
        if path.startswith("/api/") and not path.endswith("/"):
            candidate = f"{path}/"
            try:
                resolve(candidate)
            except Resolver404:
                pass
            else:
                request.path_info = candidate
                request.path = candidate
        return self.get_response(request)


class RequestBodySizeLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            content_length = int(request.META.get("CONTENT_LENGTH", "0") or "0")
        except ValueError:
            return JsonResponse({"detail": "Invalid Content-Length header."}, status=400)
        if content_length > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
            return JsonResponse({"detail": "Request body exceeds the configured size limit."}, status=413)
        return self.get_response(request)


class IdempotencyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def replay(record):
        response = JsonResponse(record.response_body, status=record.response_status, safe=False)
        response["Idempotency-Replayed"] = "true"
        response["Cache-Control"] = "no-store"
        return response

    def __call__(self, request):
        request.idempotency_record = None
        key = request.headers.get("Idempotency-Key", "")
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"} or not request.path.startswith("/api/v1/") or not key:
            return self.get_response(request)
        if len(key) > 128 or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:." for character in key):
            return JsonResponse({"detail": "Idempotency-Key contains unsupported characters."}, status=400)
        user = request.user
        if not getattr(user, "is_authenticated", False) or not getattr(user, "organization_id", None):
            try:
                authenticated = CachedJWTAuthentication().authenticate(request)
            except APIException as error:
                return JsonResponse({"detail": str(error.detail)}, status=error.status_code)
            if authenticated is not None:
                user, request.auth = authenticated
                request.user = user
        organization = getattr(user, "organization", None)
        if organization is None or not getattr(user, "is_authenticated", False):
            return JsonResponse({"detail": "Authentication is required for an idempotent request."}, status=401)
        request_path = request.get_full_path()
        request_hash = hashlib.sha256(f"{request.method}:{request_path}:{user.pk}:{organization.pk}:".encode() + request.body).hexdigest()
        try:
            record = IdempotencyRecord.objects.get(organization=organization, key=key)
        except IdempotencyRecord.DoesNotExist:
            record = None
        if record is not None and record.expires_at <= timezone.now():
            record.delete()
            record = None
        if record is None:
            try:
                record = IdempotencyRecord.objects.create(
                    organization=organization, actor=user, key=key, request_path=request_path,
                    request_hash=request_hash, expires_at=timezone.now() + timedelta(hours=24),
                )
            except IntegrityError:
                record = IdempotencyRecord.objects.get(organization=organization, key=key)
        elif record.request_hash != request_hash:
            return JsonResponse({"detail": "The idempotency key was already used with a different payload."}, status=409)
        elif record.response_status:
            return self.replay(record)
        else:
            return JsonResponse({"detail": "A request with this idempotency key is already in progress."}, status=409)
        if record.request_hash != request_hash:
            return JsonResponse({"detail": "The idempotency key was already used with a different payload."}, status=409)
        if record.response_status:
            return self.replay(record)
        if record.actor_id != user.id:
            return JsonResponse({"detail": "This idempotency key belongs to another user."}, status=409)
        request.idempotency_record = record
        response = self.get_response(request)
        if response.status_code >= 500:
            record.delete()
            return response
        if not getattr(response, "streaming", False):
            if hasattr(response, "data"):
                body = response.data
            else:
                try:
                    body = json.loads(response.content.decode())
                except (ValueError, UnicodeDecodeError):
                    body = {"status": "completed"}
            record.response_status = response.status_code
            record.response_body = jsonable(body)
            if isinstance(body, dict) and body.get("id"):
                try:
                    record.resource_id = uuid.UUID(str(body["id"]))
                    record.resource_type = request.resolver_match.view_name if request.resolver_match else ""
                except (ValueError, TypeError):
                    pass
            record.save(update_fields=["response_status", "response_body", "resource_id", "resource_type", "updated_at"])
        return response
