from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("orders", "0001_initial")]
    operations = [
        migrations.RemoveConstraint(model_name="salesreturnitem", name="orders_return_line_unique"),
        migrations.AddConstraint(
            model_name="salesreturnitem",
            constraint=models.UniqueConstraint(fields=("sales_return", "order_item", "condition"), name="orders_return_line_condition_unique"),
        ),
    ]
