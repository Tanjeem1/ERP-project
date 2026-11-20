from django.contrib.postgres.operations import CreateExtension
from django.db import migrations


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    run_before = [("core", "0001_initial")]
    operations = [CreateExtension("pg_trgm")]
