from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("inventory", "0002_initial")]
    operations = [
        migrations.AlterField(
            model_name="stockreservation",
            name="channel",
            field=models.CharField(choices=[("B2B", "B2B Wholesale"), ("SHOPIFY", "Shopify Sync"), ("DIRECT", "Direct Import"), ("MANUAL", "Manual"), ("POS", "Point of Sale")], max_length=16),
        ),
    ]
