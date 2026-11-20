from celery import shared_task
from django.db.models import F, Q
from django.utils import timezone

from core.models import ApprovalRequest, ApprovalReviewStatus, Notification, Organization
from core.services.sandbox_cleanup import purge_expired_sandbox


@shared_task
def cleanup_sandboxes():
    deleted = 0
    organization_ids = list(Organization.objects.filter(is_sandbox=True, expires_at__lt=timezone.now()).values_list("id", flat=True))
    for organization_id in organization_ids:
        if purge_expired_sandbox(organization_id):
            deleted += 1
    return deleted


@shared_task
def cleanup_idempotency_records():
    from core.models import IdempotencyRecord

    deleted, _ = IdempotencyRecord.objects.filter(expires_at__lte=timezone.now()).delete()
    return deleted


@shared_task
def monitor_operational_alerts():
    from orders.models import Invoice, InvoiceStatus

    created = 0
    now = timezone.now()
    organizations = Organization.objects.filter(is_sandbox=False).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    for organization in organizations.iterator():
        low_stock_titles = set()
        overdue_titles = set()
        approval_titles = set()
        balances = organization.inventory_stockbalance_records.filter(on_hand__lte=F("reorder_level") * 2).select_related("sku", "warehouse")
        for balance in balances.iterator():
            title = f"Low stock: {balance.sku.sku} at {balance.warehouse.code}"
            low_stock_titles.add(title)
            _, was_created = Notification.objects.update_or_create(
                organization=organization, user=None, kind=Notification.Kind.LOW_STOCK, title=title,
                defaults={"role": "WAREHOUSE_MANAGER", "message": f"{balance.on_hand} units remain; reorder level is {balance.reorder_level}.", "href": "/app/inventory", "expires_at": None},
            )
            created += int(was_created)
        invoices = Invoice.objects.filter(organization=organization, status=InvoiceStatus.ISSUED, due_at__lt=now).select_related("customer")
        for invoice in invoices.iterator():
            title = f"Overdue debt: {invoice.number}"
            overdue_titles.add(title)
            _, was_created = Notification.objects.update_or_create(
                organization=organization, user=None, kind=Notification.Kind.OVERDUE_DEBT, title=title,
                defaults={"role": "ACCOUNTANT", "message": f"Invoice {invoice.number} is overdue at {invoice.due_at:%Y-%m-%d}.", "href": f"/app/customers/{invoice.customer_id}", "expires_at": None},
            )
            created += int(was_created)
        approvals = ApprovalRequest.objects.filter(organization=organization, status=ApprovalReviewStatus.PENDING).select_related("purchase_order", "sales_order")
        for approval in approvals.iterator():
            entity = approval.purchase_order or approval.sales_order
            title = f"Approval required: {entity.number}"
            approval_titles.add(title)
            _, was_created = Notification.objects.update_or_create(
                organization=organization, user=None, kind=Notification.Kind.PENDING_APPROVAL, title=title,
                defaults={"role": "ACCOUNTANT", "message": approval.reason, "href": "/app/settings?tab=approvals", "expires_at": None},
            )
            created += int(was_created)
        for kind, active_titles in (
            (Notification.Kind.LOW_STOCK, low_stock_titles),
            (Notification.Kind.OVERDUE_DEBT, overdue_titles),
            (Notification.Kind.PENDING_APPROVAL, approval_titles),
        ):
            stale = Notification.objects.filter(organization=organization, user=None, kind=kind, read_at__isnull=True)
            if active_titles:
                stale = stale.exclude(title__in=active_titles)
            stale.update(read_at=now, updated_at=now)
    return created
