from decimal import Decimal

import pytest

from core.services.money import ServiceError, allocate_minor, allocate_money, base_value, decimal_value, from_minor_units, minor_units


def test_decimal_addition_has_no_float_error():
    assert decimal_value("0.1") + decimal_value("0.2") == Decimal("0.3")


def test_float_inputs_are_rejected():
    with pytest.raises(ServiceError):
        decimal_value(0.1)


def test_currency_conversion_uses_decimal_and_exact_minor_units():
    assert base_value(Decimal("100.00"), Decimal("1.08")) == Decimal("108.00")
    assert minor_units(Decimal("26.28")) == 2628
    assert from_minor_units(2628) == Decimal("26.28")


def test_allocation_distributes_remainder_deterministically():
    assert allocate_minor(100, [Decimal("1"), Decimal("1"), Decimal("1")]) == [34, 33, 33]
    assert allocate_money(Decimal("1.00"), [Decimal("1"), Decimal("1"), Decimal("1")]) == [Decimal("0.34"), Decimal("0.33"), Decimal("0.33")]


def test_zero_basis_is_rejected_for_nonzero_allocations():
    with pytest.raises(ServiceError):
        allocate_minor(100, [Decimal("0"), Decimal("0")])


def test_zero_allocation_does_not_require_a_basis():
    assert allocate_money(Decimal("0.00"), [Decimal("0"), Decimal("0")]) == [Decimal("0.00"), Decimal("0.00")]
