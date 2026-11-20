from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("finance", "0002_journal_integrity")]
    operations = [
        migrations.AlterField(
            model_name="journalentry",
            name="source_type",
            field=models.CharField(choices=[("OPENING_BALANCE", "Opening Balance"), ("PURCHASE_ORDER", "Purchase Order"), ("GOODS_RECEIPT", "Goods Receipt"), ("SALES_ORDER", "Sales Order"), ("INVOICE", "Invoice"), ("STOCK_TRANSFER", "Stock Transfer"), ("EXPENSE", "Expense"), ("CUSTOMER_PAYMENT", "Customer Payment"), ("VENDOR_PAYMENT", "Vendor Payment"), ("CREDIT_NOTE", "Credit Note"), ("STOCK_AUDIT", "Stock Audit"), ("SALES_RETURN", "Sales Return"), ("STOCK_ADJUSTMENT", "Stock Adjustment"), ("POS_SALE", "POS Sale"), ("FISCAL_REVALUATION", "Fiscal Revaluation")], max_length=32),
        ),
    ]
