from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def invoice_pdf_bytes(invoice):
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    pdf.setTitle(f"Tax Invoice {invoice.number}")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(48, height - 52, "TAX INVOICE")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(48, height - 72, f"{invoice.number} · {invoice.order_number}")
    pdf.drawString(48, height - 90, f"Issued {invoice.issued_at:%Y-%m-%d} · Due {invoice.due_at:%Y-%m-%d} · {invoice.currency}")
    organization = invoice.organization
    pdf.drawString(48, height - 112, organization.legal_name)
    pdf.drawString(48, height - 126, f"Tax ID {organization.tax_id}")
    pdf.drawString(48, height - 150, f"Bill to: {invoice.customer.name}")
    pdf.drawString(48, height - 165, invoice.address_line1)
    pdf.drawString(48, height - 180, f"{invoice.city}, {invoice.region} {invoice.postal_code} · {invoice.country_code}")
    y = height - 218
    pdf.setFont("Helvetica-Bold", 9)
    for offset, text in enumerate(("Description", "Qty", "Unit price", "Amount")):
        pdf.drawString(48 + offset * 115, y, text)
    pdf.line(48, y - 7, width - 48, y - 7)
    pdf.setFont("Helvetica", 9)
    y -= 24
    for line in invoice.lines.select_related("sku").all():
        pdf.drawString(48, y, line.description[:42])
        pdf.drawRightString(258, y, str(line.quantity))
        pdf.drawRightString(365, y, f"{line.unit_price:.2f}")
        pdf.drawRightString(width - 48, y, f"{line.total_price:.2f}")
        y -= 19
    y -= 8
    pdf.line(48, y, width - 48, y)
    y -= 22
    for label, value in (("Subtotal", invoice.subtotal), ("Sales tax", invoice.tax_amount), ("Total", invoice.total_amount)):
        pdf.drawString(48, y, label)
        pdf.drawRightString(width - 48, y, f"{value:.2f} {invoice.currency}")
        y -= 19
    pdf.setFont("Helvetica", 8)
    pdf.drawString(48, 54, organization.invoice_footer_note or f"Payment reference: {invoice.number}")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def receipt_pdf_bytes(payment):
    buffer = BytesIO()
    width, height = 226.77, 600
    pdf = canvas.Canvas(buffer, pagesize=(width, height))
    pdf.setTitle(f"Payment Receipt {payment.number}")
    pdf.setFont("Courier-Bold", 12)
    pdf.drawCentredString(width / 2, height - 32, "PAYMENT RECEIPT")
    pdf.setFont("Courier", 8)
    y = height - 52
    for text in (
        payment.organization.legal_name,
        payment.number,
        f"Received: {payment.received_at:%Y-%m-%d %H:%M}",
        f"Customer: {payment.customer.name}",
        f"Method: {payment.payment_method}",
        f"Reference: {payment.reference}",
        "-" * 32,
    ):
        pdf.drawString(12, y, text[:38])
        y -= 14
    for allocation in payment.allocations.select_related("invoice").all():
        pdf.drawString(12, y, f"{allocation.invoice.number} {allocation.amount_base:.2f}")
        y -= 14
    pdf.setFont("Courier-Bold", 10)
    pdf.drawString(12, y - 5, f"RECEIVED {payment.amount:.2f} {payment.currency}")
    pdf.setFont("Courier", 8)
    if payment.currency != payment.organization.base_currency:
        pdf.drawString(12, y - 19, f"Base amount {payment.amount_base:.2f} {payment.organization.base_currency}")
    pdf.drawString(12, y - 35, f"Remaining debt {payment.customer.receivable_balance:.2f} {payment.organization.base_currency}")
    pdf.drawString(12, y - 38, payment.organization.invoice_footer_note[:40])
    pdf.drawString(12, 28, "Thank you for your payment.")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
