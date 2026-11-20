import re

from django.apps import apps
from django.db import connections, transaction
from django.db.models import ForeignKey
from django.utils import timezone

from core.models import Organization
from core.services.cache import invalidate_organization_cache


CYCLE_BREAKING_FOREIGN_KEYS = {("orders.SalesOrderItem", "reservation")}


def tenant_models():
    result = set()
    for model in apps.get_models():
        if model is Organization:
            continue
        field = next((field for field in model._meta.fields if field.name == "organization"), None)
        if isinstance(field, ForeignKey) and field.related_model is Organization:
            result.add(model)
    return result


def deletion_order(models):
    ordered = []
    visiting = set()
    visited = set()

    def visit(model):
        if model in visited:
            return
        if model in visiting:
            raise RuntimeError(f"Sandbox deletion has an unresolved foreign-key cycle at {model._meta.label}.")
        visiting.add(model)
        for field in model._meta.fields:
            if (model._meta.label, field.name) in CYCLE_BREAKING_FOREIGN_KEYS:
                continue
            if isinstance(field, ForeignKey) and field.related_model in models and field.related_model is not model:
                visit(field.related_model)
        visiting.remove(model)
        visited.add(model)
        ordered.append(model)

    for model in sorted(models, key=lambda item: item._meta.label):
        visit(model)
    return ordered


def delete_join_records(cursor, model, organization_id):
    for relation in model._meta.many_to_many:
        through = relation.remote_field.through
        if not through._meta.auto_created:
            continue
        parent_field = next(field for field in through._meta.fields if isinstance(field, ForeignKey) and field.related_model is model)
        cursor.execute(
            f"DELETE FROM {connections['default'].ops.quote_name(through._meta.db_table)} WHERE {connections['default'].ops.quote_name(parent_field.column)} IN (SELECT id FROM {connections['default'].ops.quote_name(model._meta.db_table)} WHERE organization_id = %s)",
            [organization_id],
        )


def purge_expired_sandbox(organization_id):
    with transaction.atomic():
        organization = Organization.objects.select_for_update().filter(
            pk=organization_id, is_sandbox=True, expires_at__lte=timezone.now(),
        ).first()
        if organization is None:
            return False
        models = tenant_models()
        sequence_names = list(organization.core_documentsequence_records.values_list("sequence_name", flat=True))
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

        BlacklistedToken.objects.filter(token__user__organization=organization).delete()
        OutstandingToken.objects.filter(user__organization=organization).delete()
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT set_config('nexusledger.sandbox_cleanup_id', %s, true)", [str(organization.id)])
            for model in models:
                for field in model._meta.fields:
                    if (model._meta.label, field.name) not in CYCLE_BREAKING_FOREIGN_KEYS:
                        continue
                    if not field.null:
                        raise RuntimeError(f"Cannot detach required field {model._meta.label}.{field.name} during sandbox cleanup.")
                    cursor.execute(
                        f"UPDATE {connections['default'].ops.quote_name(model._meta.db_table)} SET {connections['default'].ops.quote_name(field.column)} = NULL WHERE organization_id = %s",
                        [organization.id],
                    )
            for model in deletion_order(models):
                delete_join_records(cursor, model, organization.id)
                cursor.execute(
                    f"DELETE FROM {connections['default'].ops.quote_name(model._meta.db_table)} WHERE organization_id = %s",
                    [organization.id],
                )
            Organization.history.model.objects.filter(id=organization.id).delete()
            cursor.execute(
                f"DELETE FROM {connections['default'].ops.quote_name(Organization._meta.db_table)} WHERE id = %s AND is_sandbox = TRUE AND expires_at <= CURRENT_TIMESTAMP",
                [organization.id],
            )
            if cursor.rowcount != 1:
                raise RuntimeError("The sandbox expiry or tenant changed during cleanup.")
            for sequence_name in sequence_names:
                if not re.fullmatch(r"nl_[0-9a-f]{32}_[a-z_]+", sequence_name):
                    raise RuntimeError("Refusing to remove an invalid sandbox sequence name.")
                cursor.execute(f'DROP SEQUENCE IF EXISTS {connections["default"].ops.quote_name(sequence_name)}')
        invalidate_organization_cache(organization)
        return True
