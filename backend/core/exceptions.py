import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError
from django.db.models import ObjectDoesNotExist
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


logger = logging.getLogger(__name__)


def exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        return Response({"detail": str(exc)}, status=400)
    if isinstance(exc, DjangoPermissionDenied):
        return Response({"detail": str(exc) or "Permission denied."}, status=403)
    if isinstance(exc, AuthenticationFailed):
        exc.status_code = 401
        response = drf_exception_handler(exc, context)
        response["WWW-Authenticate"] = 'Bearer realm="nexusledger"'
        return response
    if isinstance(exc, ObjectDoesNotExist):
        return Response({"detail": "The requested record does not exist in this organization."}, status=404)
    if isinstance(exc, DatabaseError):
        logger.exception("Database integrity error during API mutation", exc_info=exc)
        return Response({"detail": "The operation could not be committed because of a database integrity constraint."}, status=409)
    if isinstance(exc, DRFValidationError):
        return drf_exception_handler(exc, context)
    return drf_exception_handler(exc, context)
