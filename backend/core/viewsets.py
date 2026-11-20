from urllib.parse import urlsplit

from rest_framework import status, viewsets
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response


class StableCursorPagination(CursorPagination):
    page_size = 50
    max_page_size = 200
    ordering = ("-created_at", "id")

    def get_paginated_response(self, data):
        response = super().get_paginated_response(data)
        response.data["next"] = self.relative_link(response.data.get("next"))
        response.data["previous"] = self.relative_link(response.data.get("previous"))
        return response

    @staticmethod
    def relative_link(url):
        if not url:
            return None
        parts = urlsplit(url)
        query = f"?{parts.query}" if parts.query else ""
        return f"{parts.path}{query}"


class TenantViewSet(viewsets.ModelViewSet):
    pagination_class = StableCursorPagination
    input_serializer_class = None

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"} and self.input_serializer_class is not None:
            return self.input_serializer_class
        return super().get_serializer_class()

    def get_organization(self):
        return self.request.user.organization

    def get_output_serializer(self, *args, **kwargs):
        kwargs.setdefault("context", self.get_serializer_context())
        return self.serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "organization": self.get_organization(), "actor": self.request.user}

    def get_queryset(self):
        return super().get_queryset().filter(organization=self.get_organization())

    def create_record(self, serializer):
        if self.input_serializer_class is None:
            raise MethodNotAllowed(self.request.method)
        return serializer.save(organization=self.get_organization())

    def update_record(self, instance, serializer):
        if self.input_serializer_class is None:
            raise MethodNotAllowed(self.request.method)
        return serializer.save()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = self.create_record(serializer)
        return Response(self.get_output_serializer(instance).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        instance = self.update_record(instance, serializer)
        return Response(self.get_output_serializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Master records are retained for audit and financial integrity."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
