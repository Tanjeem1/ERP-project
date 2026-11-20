from decimal import Decimal

from core.models import ApprovalEntityType, ApprovalRule


def approval_rule(organization, entity_type):
    rule, _ = ApprovalRule.objects.get_or_create(
        organization=organization,
        entity_type=entity_type,
        defaults={
            "threshold_amount": Decimal("5000.00") if entity_type == ApprovalEntityType.PURCHASE_ORDER else Decimal("0.00"),
            "enforce_credit_limit": entity_type == ApprovalEntityType.SALES_ORDER,
            "approver_roles": ["SUPER_ADMIN", "ACCOUNTANT"],
            "is_active": True,
        },
    )
    return rule
