from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.utils import timezone


ZERO = Decimal("0.00")
CENT = Decimal("0.01")
FOUR_DECIMALS = Decimal("0.0001")


class ServiceError(ValidationError):
    pass


class InsufficientStockError(ServiceError):
    pass


def decimal_value(value):
    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, bool):
        raise ServiceError("Boolean values are not valid decimals.")
    elif isinstance(value, int):
        result = Decimal(value)
    elif isinstance(value, str):
        try:
            result = Decimal(value.strip())
        except Exception as error:
            raise ServiceError("Invalid decimal value.") from error
    else:
        raise ServiceError("Use Decimal, a decimal string, or an integer. Floating-point values are not accepted.")
    if not result.is_finite():
        raise ServiceError("Decimal values must be finite.")
    return result


def non_negative(value):
    amount = decimal_value(value)
    if amount < ZERO:
        raise ServiceError("Amounts cannot be negative.")
    return amount


def positive(value):
    amount = decimal_value(value)
    if amount <= ZERO:
        raise ServiceError("Amounts must be greater than zero.")
    return amount


def whole_quantity(value):
    amount = positive(value)
    if amount != amount.to_integral_value():
        raise ServiceError("Stock quantities must be whole units for this workflow.")
    return amount


def whole_non_negative_quantity(value):
    amount = non_negative(value)
    if amount != amount.to_integral_value():
        raise ServiceError("Stock counts must be whole units for this workflow.")
    return amount


def money(value):
    return decimal_value(value).quantize(CENT, rounding=ROUND_HALF_UP)


def four_decimals(value):
    return decimal_value(value).quantize(FOUR_DECIMALS, rounding=ROUND_HALF_UP)


def minor_units(value):
    return int(money(value) * 100)


def from_minor_units(value):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ServiceError("Minor currency units must be integers.")
    return money(Decimal(value) / 100)


def base_value(amount, exchange_rate):
    return money(non_negative(amount) * positive(exchange_rate))


def base_value_precise(amount, exchange_rate):
    return non_negative(amount) * positive(exchange_rate)


def line_total(quantity, unit_amount):
    return money(whole_quantity(quantity) * non_negative(unit_amount))


def allocate_minor(total_minor, basis_values):
    if isinstance(total_minor, bool) or not isinstance(total_minor, int) or total_minor < 0:
        raise ServiceError("Allocation total must be a non-negative integer in minor currency units.")
    if not basis_values:
        if total_minor:
            raise ServiceError("Cannot allocate costs without receipt lines.")
        return []
    bases = [non_negative(value) for value in basis_values]
    if total_minor == 0:
        return [0 for _ in bases]
    basis_total = sum(bases, ZERO)
    if basis_total <= ZERO:
        raise ServiceError("The selected allocation basis has a zero total.")
    allocations = []
    for index, basis in enumerate(bases):
        exact = (Decimal(total_minor) * basis) / basis_total
        allocated = int(exact)
        allocations.append({"index": index, "allocated": allocated, "fraction": exact - allocated})
    remainder = total_minor - sum(item["allocated"] for item in allocations)
    ranking = sorted(allocations, key=lambda item: (-item["fraction"], item["index"]))
    for index in range(remainder):
        ranking[index % len(ranking)]["allocated"] += 1
    return [item["allocated"] for item in allocations]


def allocate_money(total, basis_values):
    return [money(Decimal(value) / 100) for value in allocate_minor(minor_units(total), basis_values)]


def sum_money(values):
    return money(sum((decimal_value(value) for value in values), ZERO))


def datetime_value(value=None):
    if value is None:
        return timezone.now()
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    elif isinstance(value, datetime):
        parsed = value
    else:
        raise ServiceError("Expected an ISO datetime string or datetime object.")
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, ZoneInfo("UTC"))
    return parsed


def json_money(value):
    return str(money(value))
