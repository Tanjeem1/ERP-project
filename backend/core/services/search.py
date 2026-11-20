from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Q
from django.db.models.functions import Greatest

from core.services.actors import Permission, ROLE_PERMISSIONS
from finance.models import JournalEntry
from inventory.models import SKU
from orders.models import Invoice
from procurement.models import PurchaseOrder


def global_search(organization, actor, query, limit=10):
    query = query.strip()
    if len(query) < 2:
        return []
    if len(query) > 100:
        raise ValueError("Search queries are limited to 100 characters.")
    resources = [
        (
            "SKU", SKU.objects.filter(organization=organization, is_active=True),
            ("sku", "name", "barcode"), "sku", "/app/inventory?product=", "inventory",
        ),
        (
            "Invoice", Invoice.objects.filter(organization=organization),
            ("number", "order_number"), "number", "/app/orders?invoice=", "orders",
        ),
    ]
    if ROLE_PERMISSIONS[actor.role][Permission.VIEW_COST_PRICES]:
        resources.append((
            "Purchase Order", PurchaseOrder.objects.filter(organization=organization),
            ("number", "reference"), "number", "/app/procurement?order=", "procurement",
        ))
    if ROLE_PERMISSIONS[actor.role][Permission.VIEW_LEDGER]:
        resources.append((
            "Journal Entry", JournalEntry.objects.filter(organization=organization),
            ("number", "source_number", "description"), "number", "/app/finance?journal=", "finance",
        ))
    matches = []
    for kind, queryset, fields, label, href, module in resources:
        similarity = Greatest(*(TrigramSimilarity(field, query) for field in fields))
        condition = Q()
        for field in fields:
            condition |= Q(**{f"{field}__icontains": query})
        rows = queryset.annotate(similarity=similarity).filter(Q(similarity__gte=0.15) | condition).only("id", *fields).order_by("-similarity", label)[:limit]
        for row in rows:
            title = getattr(row, label)
            subtitle = row.name if kind == "SKU" else (row.reference if kind == "Purchase Order" else row.description if kind == "Journal Entry" else row.order_number)
            matches.append({
                "id": str(row.id), "type": kind, "title": title, "subtitle": subtitle,
                "href": f"{href}{row.id}", "module": module, "score": round(float(row.similarity), 4),
            })
    matches.sort(key=lambda item: (-item["score"], item["type"], item["title"]))
    return matches[:limit]
