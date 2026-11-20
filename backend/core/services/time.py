from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from django.utils import timezone

from core.services.money import ServiceError


def date_value(value):
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError as error:
            raise ServiceError("Dates must use YYYY-MM-DD.") from error
    raise ServiceError("Expected a date or ISO date string.")


def local_day_bounds(organization, value):
    zone = ZoneInfo(organization.timezone)
    local_date = date_value(value)
    start_local = datetime.combine(local_date, time.min, tzinfo=zone)
    end_local = datetime.combine(local_date, time.max, tzinfo=zone)
    return start_local.astimezone(ZoneInfo("UTC")), end_local.astimezone(ZoneInfo("UTC"))


def local_date_range(organization, start_date, end_date):
    start_value = date_value(start_date)
    end_value = date_value(end_date)
    if start_value > end_value:
        raise ServiceError("The start date must be on or before the end date.")
    return local_day_bounds(organization, start_value)[0], local_day_bounds(organization, end_value)[1]


def today_bounds(organization):
    local_today = timezone.now().astimezone(ZoneInfo(organization.timezone)).date()
    return local_day_bounds(organization, local_today)


def month_to_date_bounds(organization):
    local_today = timezone.now().astimezone(ZoneInfo(organization.timezone)).date()
    return local_day_bounds(organization, local_today.replace(day=1))[0], local_day_bounds(organization, local_today)[1]
