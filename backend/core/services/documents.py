import re

from django.db import connections
from django.db.utils import IntegrityError

from core.models import DocumentKind, DocumentSequence


DOCUMENT_FORMATS = {
    DocumentKind.PURCHASE_ORDER: ("PO-", 4),
    DocumentKind.GOODS_RECEIPT: ("GRN-", 4),
    DocumentKind.SALES_ORDER: ("SO-", 4),
    DocumentKind.INVOICE: ("INV-", 4),
    DocumentKind.JOURNAL: ("JE-", 6),
    DocumentKind.TRANSFER: ("TRF-", 4),
    DocumentKind.RESERVATION: ("RSV-", 4),
    DocumentKind.ACTIVITY: ("ACT-", 4),
    DocumentKind.EXPENSE: ("EXP-", 4),
    DocumentKind.CUSTOMER_PAYMENT: ("RCPT-", 4),
    DocumentKind.VENDOR_PAYMENT: ("VP-", 4),
    DocumentKind.SALES_RETURN: ("RMA-", 4),
    DocumentKind.CREDIT_NOTE: ("CN-", 4),
    DocumentKind.STOCK_AUDIT: ("ADJ-", 4),
    DocumentKind.ENTITY: ("ENT-", 4),
}


def sequence_name(organization, kind):
    return f"nl_{organization.pk.hex}_{kind.value.lower()}"


def ensure_document_sequence(organization, kind):
    name = sequence_name(organization, kind)
    if not re.fullmatch(r"nl_[0-9a-f]{32}_[a-z_]+", name):
        raise ValueError("Unsafe document sequence name.")
    with connections["default"].cursor() as cursor:
        cursor.execute(f'CREATE SEQUENCE IF NOT EXISTS "{name}"')
    try:
        sequence, _ = DocumentSequence.objects.get_or_create(
            organization=organization,
            kind=kind.value,
            defaults={"sequence_name": name, "next_value": 1},
        )
    except IntegrityError:
        sequence = DocumentSequence.objects.get(organization=organization, kind=kind.value)
    return sequence


def ensure_document_sequences(organization):
    names = []
    for kind in DocumentKind:
        name = sequence_name(organization, kind)
        if not re.fullmatch(r"nl_[0-9a-f]{32}_[a-z_]+", name):
            raise ValueError("Unsafe document sequence name.")
        names.append((kind, name))
    with connections["default"].cursor() as cursor:
        cursor.execute(";".join(f'CREATE SEQUENCE IF NOT EXISTS "{name}"' for _, name in names))
    DocumentSequence.objects.bulk_create(
        [DocumentSequence(organization=organization, kind=kind, sequence_name=name) for kind, name in names],
        ignore_conflicts=True,
    )


def next_document_number(organization, kind):
    name = sequence_name(organization, kind)
    if not re.fullmatch(r"nl_[0-9a-f]{32}_[a-z_]+", name):
        raise ValueError("Unsafe document sequence name.")
    with connections["default"].cursor() as cursor:
        cursor.execute("SELECT nextval(%s::regclass)", [name])
        value = cursor.fetchone()[0]
    updated = DocumentSequence.objects.filter(organization=organization, kind=kind).update(next_value=value + 1)
    if not updated:
        DocumentSequence.objects.get_or_create(
            organization=organization,
            kind=kind,
            defaults={"sequence_name": name, "next_value": value + 1},
        )
    prefix, width = DOCUMENT_FORMATS[kind]
    return f"{prefix}{value:0{width}d}"
