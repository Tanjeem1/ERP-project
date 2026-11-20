from enum import Enum

from django.core.exceptions import PermissionDenied
from django.utils import timezone

from core.models import ActivityType, AuditEvent


class Permission(str, Enum):
    VIEW_PROFIT = "viewProfit"
    VIEW_COST_PRICES = "viewCostPrices"
    VIEW_LEDGER = "viewLedger"
    MANAGE_PROCUREMENT = "manageProcurement"
    APPROVE_TRANSACTIONS = "approveTransactions"
    MANAGE_INVENTORY = "manageInventory"
    CREATE_ORDERS = "createOrders"
    FULFILL_ORDERS = "fulfillOrders"
    POST_EXPENSES = "postExpenses"
    VIEW_GOVERNANCE = "viewGovernance"
    RESET_DEMO = "resetDemo"


ROLE_PERMISSIONS = {
    "SUPER_ADMIN": {permission: True for permission in Permission},
    "ACCOUNTANT": {
        Permission.VIEW_PROFIT: True,
        Permission.VIEW_COST_PRICES: True,
        Permission.VIEW_LEDGER: True,
        Permission.MANAGE_PROCUREMENT: False,
        Permission.APPROVE_TRANSACTIONS: True,
        Permission.MANAGE_INVENTORY: False,
        Permission.CREATE_ORDERS: False,
        Permission.FULFILL_ORDERS: False,
        Permission.POST_EXPENSES: True,
        Permission.VIEW_GOVERNANCE: True,
        Permission.RESET_DEMO: False,
    },
    "WAREHOUSE_MANAGER": {
        Permission.VIEW_PROFIT: False,
        Permission.VIEW_COST_PRICES: True,
        Permission.VIEW_LEDGER: False,
        Permission.MANAGE_PROCUREMENT: True,
        Permission.APPROVE_TRANSACTIONS: False,
        Permission.MANAGE_INVENTORY: True,
        Permission.CREATE_ORDERS: True,
        Permission.FULFILL_ORDERS: True,
        Permission.POST_EXPENSES: False,
        Permission.VIEW_GOVERNANCE: False,
        Permission.RESET_DEMO: False,
    },
    "SALES_OFFICER": {
        Permission.VIEW_PROFIT: False,
        Permission.VIEW_COST_PRICES: False,
        Permission.VIEW_LEDGER: False,
        Permission.MANAGE_PROCUREMENT: False,
        Permission.APPROVE_TRANSACTIONS: False,
        Permission.MANAGE_INVENTORY: False,
        Permission.CREATE_ORDERS: True,
        Permission.FULFILL_ORDERS: False,
        Permission.POST_EXPENSES: False,
        Permission.VIEW_GOVERNANCE: False,
        Permission.RESET_DEMO: False,
    },
}


def assert_permission(user, organization, permission):
    if not user.is_active or user.organization_id != organization.id:
        raise PermissionDenied("The actor does not belong to this organization.")
    if organization.is_sandbox and organization.expires_at and organization.expires_at <= timezone.now():
        raise PermissionDenied("This sandbox has expired.")
    if not ROLE_PERMISSIONS[user.role][permission]:
        raise PermissionDenied(f"{user.role} does not have the {permission.value} permission.")


def actor_kwargs(user):
    return {"created_by": user, "created_by_role": user.role}


def record_audit(organization, user, action, entity_type, entity_id, old_value=None, new_value=None):
    from core.services.cache import invalidate_on_commit

    event = AuditEvent.objects.create(
        organization=organization,
        actor=user,
        actor_name=user.full_name,
        actor_role=user.role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value or {},
        new_value=new_value or {},
    )
    invalidate_on_commit(organization)
    return event


def record_activity(organization, event_type, title, description, reference, href, journal_entries=()):
    if event_type not in ActivityType.values:
        raise ValueError("Unsupported activity type.")
    from core.models import ActivityEvent

    activity = ActivityEvent.objects.create(
        organization=organization,
        event_type=event_type,
        title=title,
        description=description,
        reference=reference,
        href=href,
    )
    if journal_entries:
        activity.journal_entries.set(journal_entries)
    return activity
