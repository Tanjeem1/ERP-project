from django.db import migrations


JOURNAL_INVARIANT_SQL = r"""
CREATE OR REPLACE FUNCTION finance_validate_journal_entry() RETURNS trigger AS $$
DECLARE
    line_debit numeric(18,4);
    line_credit numeric(18,4);
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Posted journal entries are immutable';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('POSTED', 'REVERSED') THEN
        RAISE EXCEPTION 'Posted journal entries are immutable';
    END IF;
    IF NEW.status = 'POSTED' THEN
        IF NEW.total_debit <> NEW.total_credit THEN
            RAISE EXCEPTION 'Journal debit and credit totals must match';
        END IF;
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO line_debit, line_credit
        FROM finance_journalline
        WHERE journal_entry_id = NEW.id;
        IF line_debit = 0 OR line_credit = 0 OR line_debit <> line_credit THEN
            RAISE EXCEPTION 'Posted journal lines must be non-empty and balanced';
        END IF;
        IF line_debit <> NEW.total_debit OR line_credit <> NEW.total_credit THEN
            RAISE EXCEPTION 'Journal totals must equal the sum of their lines';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_journal_entry_immutable
BEFORE INSERT OR UPDATE OR DELETE ON finance_journalentry
FOR EACH ROW EXECUTE FUNCTION finance_validate_journal_entry();

CREATE OR REPLACE FUNCTION finance_guard_journal_line() RETURNS trigger AS $$
DECLARE
    journal_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO journal_status FROM finance_journalentry WHERE id = NEW.journal_entry_id;
    ELSE
        SELECT status INTO journal_status FROM finance_journalentry WHERE id = OLD.journal_entry_id;
    END IF;
    IF journal_status IN ('POSTED', 'REVERSED') THEN
        RAISE EXCEPTION 'Lines of a posted journal are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_journal_line_immutable
BEFORE INSERT OR UPDATE OR DELETE ON finance_journalline
FOR EACH ROW EXECUTE FUNCTION finance_guard_journal_line();
"""

DROP_INVARIANT_SQL = r"""
DROP TRIGGER IF EXISTS finance_journal_line_immutable ON finance_journalline;
DROP FUNCTION IF EXISTS finance_guard_journal_line();
DROP TRIGGER IF EXISTS finance_journal_entry_immutable ON finance_journalentry;
DROP FUNCTION IF EXISTS finance_validate_journal_entry();
"""


class Migration(migrations.Migration):
    dependencies = [("finance", "0002_initial")]
    operations = [migrations.RunSQL(JOURNAL_INVARIANT_SQL, DROP_INVARIANT_SQL)]
