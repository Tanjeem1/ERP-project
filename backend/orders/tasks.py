import logging

from celery import shared_task
from django.core.files.base import ContentFile
from django.db import DatabaseError, transaction
from kombu.exceptions import OperationalError
from redis.exceptions import RedisError

from orders.documents import invoice_pdf_bytes, receipt_pdf_bytes
from orders.models import CustomerPayment, Invoice


logger = logging.getLogger(__name__)


def enqueue_document(task, record_id):
    def dispatch():
        try:
            task.delay(str(record_id))
        except (OperationalError, RedisError):
            logger.warning("Document task %s is queued for request-time fallback because Redis is unavailable.", task.name)

    transaction.on_commit(dispatch)


@shared_task(autoretry_for=(DatabaseError,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def render_invoice_pdf(invoice_id):
    invoice = Invoice.objects.get(pk=invoice_id)
    if invoice.pdf_file:
        return invoice.pdf_file.name
    invoice.pdf_file.save(f"{invoice.number}.pdf", ContentFile(invoice_pdf_bytes(invoice)), save=True)
    return invoice.pdf_file.name


@shared_task(autoretry_for=(DatabaseError,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def render_payment_receipt(payment_id):
    payment = CustomerPayment.objects.get(pk=payment_id)
    if payment.receipt_file:
        return payment.receipt_file.name
    payment.receipt_file.save(f"{payment.number}.pdf", ContentFile(receipt_pdf_bytes(payment)), save=True)
    return payment.receipt_file.name
