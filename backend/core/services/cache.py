from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from django.core.cache import cache
from django.db import transaction


CACHE_NAMESPACES = ("dashboard", "collections", "customers", "finance")


def jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    return value


def generation_key(namespace, organization):
    return f"{namespace}:org:{organization.pk}:generation"


def versioned_key(namespace, organization, name):
    key = generation_key(namespace, organization)
    generation = cache.get_or_set(key, 1, timeout=None)
    return f"{namespace}:org:{organization.pk}:v{generation}:{name}"


def get_cached(namespace, organization, name, loader, timeout):
    key = versioned_key(namespace, organization, name)
    cached = cache.get(key)
    if cached is not None:
        return cached
    value = jsonable(loader())
    cache.set(key, value, timeout)
    return value


def invalidate_organization_cache(organization):
    for namespace in CACHE_NAMESPACES:
        key = generation_key(namespace, organization)
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 2, timeout=None)


def invalidate_on_commit(organization):
    transaction.on_commit(lambda: invalidate_organization_cache(organization))
