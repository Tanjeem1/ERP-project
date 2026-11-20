import uuid
from dataclasses import dataclass
from decimal import Decimal
from datetime import timedelta

from django.db import models, transaction
from django.db.models import F
from django.db.models.functions import Greatest
from django.db.utils import IntegrityError
from django.utils import timezone

from core.models import ActivityType, Currency, DocumentKind, JournalSourceType
from core.services.actors import Permission, actor_kwargs, assert_permission, record_activity, record_audit
from core.services.documents import next_document_number
from core.services.ledger import LedgerLine, post_journal
from core.services.money import InsufficientStockError, ServiceError, datetime_value, four_decimals, line_total, money, non_negative, positive, sum_money, whole_quantity, whole_non_negative_quantity
from inventory.models import InventoryLayer, ReservationChannel, ReservationStatus, SKU, StockAdjustment, StockAdjustmentType, StockBalance, StockReservation, StockTransfer, StockTransferItem, StockTransferLayer, Warehouse, WarehouseStatus


@dataclass(frozen=True)
class FifoLayerConsumption:
    layer_id: object
    batch_code: str
    quantity: Decimal
    unit_cost: Decimal
    value: Decimal
    remaining_quantity: Decimal


@dataclass(frozen=True)
class FifoConsumption:
    sku_id: object
    warehouse_id: object
    quantity: Decimal
    total_cost: Decimal
    layers: list[FifoLayerConsumption]


def _address_values(line1="", line2="", city="", region="", postal_code="", country_code="US"):
    return {
        "address_line1": line1,
        "address_line2": line2,
        "city": city,
        "region": region,
        "postal_code": postal_code,
        "country_code": country_code,
    }


def create_warehouse(organization, actor, *, code, name, type, capacity_cbm, temperature_controlled=False, status=WarehouseStatus.ACTIVE, **address):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    if type not in {"BONDED", "DISTRIBUTION", "FULFILLMENT"} or status not in WarehouseStatus.values:
        raise ServiceError("Invalid warehouse type or status.")
    warehouse = Warehouse(
        organization=organization,
        code=code.strip().upper(),
        name=name.strip(),
        type=type,
        capacity_cbm=positive(capacity_cbm),
        temperature_controlled=temperature_controlled,
        status=status,
        **address,
    )
    warehouse.full_clean()
    warehouse.save()
    record_audit(organization, actor, "Warehouse created", "Warehouse", warehouse.id, new_value={"code": warehouse.code, "name": warehouse.name})
    return warehouse


def update_warehouse(organization, actor, warehouse_id, **changes):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    warehouse = Warehouse.objects.get(organization=organization, pk=warehouse_id)
    old_value = {"code": warehouse.code, "name": warehouse.name, "type": warehouse.type, "status": warehouse.status}
    allowed = {"code", "name", "type", "capacity_cbm", "temperature_controlled", "status", *_address_values().keys()}
    for key, value in changes.items():
        if key not in allowed:
            raise ServiceError(f"Unsupported warehouse field: {key}")
        if key == "capacity_cbm":
            value = positive(value)
        if key == "code":
            value = value.strip().upper()
        setattr(warehouse, key, value)
    warehouse.full_clean()
    warehouse.save()
    record_audit(organization, actor, "Warehouse updated", "Warehouse", warehouse.id, old_value=old_value, new_value={"code": warehouse.code, "name": warehouse.name, "type": warehouse.type, "status": warehouse.status})
    return warehouse


def create_sku(organization, actor, *, sku, name, category, description, unit_of_measure, preferred_vendor_id, barcode="", tax_rate=Decimal("0"), reorder_level=Decimal("0"), weight_kg=Decimal("0"), volume_cbm=Decimal("0"), cost_price=Decimal("0"), selling_price=Decimal("0"), currency=Currency.USD):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    from procurement.models import Vendor

    if currency not in Currency.values:
        raise ServiceError("Unsupported currency.")
    vendor = Vendor.objects.get(organization=organization, pk=preferred_vendor_id)
    product = SKU(
        organization=organization,
        sku=sku.strip().upper(),
        name=name.strip(),
        category=category.strip(),
        description=description.strip(),
        unit_of_measure=unit_of_measure.strip(),
        barcode=barcode.strip(),
        tax_rate=non_negative(tax_rate),
        reorder_level=non_negative(reorder_level),
        weight_kg=non_negative(weight_kg),
        volume_cbm=non_negative(volume_cbm),
        cost_price=non_negative(cost_price),
        selling_price=non_negative(selling_price),
        currency=currency,
        preferred_vendor=vendor,
        is_active=True,
    )
    product.full_clean()
    product.save()
    record_audit(organization, actor, "SKU created", "SKU", product.id, new_value={"sku": product.sku, "name": product.name})
    return product


def update_sku(organization, actor, sku_id, **changes):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    product = SKU.objects.get(organization=organization, pk=sku_id)
    old_value = {"sku": product.sku, "name": product.name, "selling_price": str(product.selling_price)}
    allowed = {"sku", "name", "category", "description", "unit_of_measure", "barcode", "tax_rate", "reorder_level", "weight_kg", "volume_cbm", "cost_price", "selling_price", "currency", "preferred_vendor", "is_active"}
    for key, value in changes.items():
        if key not in allowed:
            raise ServiceError(f"Unsupported SKU field: {key}")
        if key == "sku":
            value = value.strip().upper()
        elif key in {"tax_rate", "reorder_level", "weight_kg", "volume_cbm", "cost_price", "selling_price"}:
            value = non_negative(value)
        elif key == "preferred_vendor":
            from procurement.models import Vendor

            value = Vendor.objects.get(organization=organization, pk=value)
        setattr(product, key, value)
    product.full_clean()
    product.save()
    record_audit(organization, actor, "SKU updated", "SKU", product.id, old_value=old_value, new_value={"sku": product.sku, "name": product.name, "selling_price": str(product.selling_price)})
    return product


def lock_stock_positions(organization, pairs):
    unique_pairs = sorted(set(pairs), key=lambda pair: (str(pair[1]), str(pair[0])))
    positions = {}
    for sku_id, warehouse_id in unique_pairs:
        try:
            sku = SKU.objects.get(organization=organization, pk=sku_id, is_active=True)
            warehouse = Warehouse.objects.get(organization=organization, pk=warehouse_id, status=WarehouseStatus.ACTIVE)
        except (SKU.DoesNotExist, Warehouse.DoesNotExist) as error:
            raise ServiceError("The selected SKU or warehouse is not available in this organization.") from error
        try:
            position, _ = StockBalance.objects.get_or_create(
                organization=organization,
                sku=sku,
                warehouse=warehouse,
                defaults={"reorder_level": sku.reorder_level},
            )
        except IntegrityError:
            pass
        positions[(sku_id, warehouse_id)] = StockBalance.objects.select_for_update().get(organization=organization, sku_id=sku_id, warehouse_id=warehouse_id)
    return positions


@transaction.atomic
def post_opening_stock(organization, actor, *, sku_id, warehouse_id, quantity, unit_cost, batch_code, received_at=None, expires_at=None):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    quantity = whole_quantity(quantity)
    unit_cost = money(unit_cost)
    received_at = datetime_value(received_at)
    positions = lock_stock_positions(organization, [(sku_id, warehouse_id)])
    position = positions[(sku_id, warehouse_id)]
    value = line_total(quantity, unit_cost)
    layer = InventoryLayer.objects.create(
        organization=organization,
        sku_id=sku_id,
        warehouse_id=warehouse_id,
        batch_code=batch_code,
        received_at=received_at,
        expires_at=expires_at,
        initial_quantity=quantity,
        remaining_quantity=quantity,
        source_unit_cost=unit_cost,
        source_currency=organization.base_currency,
        unit_cost=unit_cost,
        allocated_landed_unit_cost=Decimal("0.00"),
        remaining_value=value,
    )
    journal = post_journal(
        organization,
        actor,
        JournalSourceType.OPENING_BALANCE,
        layer.id,
        batch_code,
        f"/app/inventory?position={position.id}",
        f"Opening stock for {layer.sku.sku} at {layer.warehouse.code}",
        [LedgerLine("103000", "Opening inventory asset", debit=value), LedgerLine("301000", "Opening inventory equity", credit=value)],
        timestamp=received_at,
    )
    StockBalance.objects.filter(pk=position.pk).update(on_hand=F("on_hand") + quantity, updated_at=received_at)
    record_audit(organization, actor, "Opening stock posted", "InventoryLayer", layer.id, new_value={"quantity": str(quantity), "unit_cost": str(unit_cost), "journal": journal.number})
    return layer


def consume_fifo_layers(organization, quantities, *, respect_reserved=False):
    positions = lock_stock_positions(organization, quantities.keys())
    result = {}
    for (sku_id, warehouse_id), requested in sorted(quantities.items(), key=lambda item: (str(item[0][1]), str(item[0][0]))):
        requested = whole_quantity(requested)
        position = positions[(sku_id, warehouse_id)]
        if respect_reserved and position.on_hand - position.reserved < requested:
            raise InsufficientStockError(f"Only {position.on_hand - position.reserved} unreserved units are available for {sku_id}.")
        layers = list(InventoryLayer.objects.select_for_update().filter(
            organization=organization,
            sku_id=sku_id,
            warehouse_id=warehouse_id,
            remaining_quantity__gt=0,
        ).order_by("received_at", "created_at", "id"))
        if sum((layer.remaining_quantity for layer in layers), Decimal("0")) < requested:
            raise InsufficientStockError(f"Insufficient FIFO layers for {sku_id} at {warehouse_id}.")
        remaining = requested
        consumed = []
        for layer in layers:
            if remaining == 0:
                break
            quantity = min(layer.remaining_quantity, remaining)
            value = layer.remaining_value if quantity == layer.remaining_quantity else min(layer.remaining_value, money(layer.unit_cost * quantity))
            layer.remaining_quantity -= quantity
            layer.remaining_value = money(layer.remaining_value - value)
            layer.save(update_fields=["remaining_quantity", "remaining_value", "updated_at"])
            remaining -= quantity
            consumed.append(FifoLayerConsumption(layer.id, layer.batch_code, quantity, layer.unit_cost, value, layer.remaining_quantity))
        if remaining != 0:
            raise InsufficientStockError("FIFO layers could not satisfy the requested quantity.")
        StockBalance.objects.filter(pk=position.pk).update(on_hand=F("on_hand") - requested, updated_at=timezone.now())
        result[(sku_id, warehouse_id)] = FifoConsumption(sku_id, warehouse_id, requested, sum_money(item.value for item in consumed), consumed)
    return result


@transaction.atomic
def reserve_stock_atomic(organization, actor, *, sku_id, warehouse_id, channel, reference, quantity, expires_at=None, sales_order_item=None):
    assert_permission(actor, organization, Permission.CREATE_ORDERS)
    if channel not in ReservationChannel.values:
        raise ServiceError("Unsupported reservation channel.")
    quantity = whole_quantity(quantity)
    now = timezone.now()
    expires_at = datetime_value(expires_at) if expires_at else now + timedelta(hours=24)
    if expires_at <= now:
        raise ServiceError("Reservation expiry must be in the future.")
    positions = lock_stock_positions(organization, [(sku_id, warehouse_id)])
    position = positions[(sku_id, warehouse_id)]
    updated = StockBalance.objects.filter(pk=position.pk, on_hand__gte=F("reserved") + quantity).update(reserved=F("reserved") + quantity, updated_at=now)
    if updated != 1:
        raise InsufficientStockError(f"Only {position.on_hand - position.reserved} units are available to promise; {quantity} requested.")
    reservation = StockReservation.objects.create(
        organization=organization,
        reference=reference.strip() or next_document_number(organization, DocumentKind.RESERVATION),
        sku_id=sku_id,
        warehouse_id=warehouse_id,
        sales_order_item=sales_order_item,
        channel=channel,
        quantity=quantity,
        status=ReservationStatus.ACTIVE,
        expires_at=expires_at,
        **actor_kwargs(actor),
    )
    record_audit(organization, actor, "Stock reserved", "StockReservation", reservation.id, new_value={"quantity": str(quantity), "channel": channel, "reference": reservation.reference})
    return reservation


@transaction.atomic
def increase_stock_reservation(organization, actor, *, reservation_id, additional):
    assert_permission(actor, organization, Permission.CREATE_ORDERS)
    additional = whole_quantity(additional)
    reservation = StockReservation.objects.select_for_update().get(organization=organization, pk=reservation_id, status=ReservationStatus.ACTIVE)
    positions = lock_stock_positions(organization, [(reservation.sku_id, reservation.warehouse_id)])
    position = positions[(reservation.sku_id, reservation.warehouse_id)]
    updated = StockBalance.objects.filter(pk=position.pk, on_hand__gte=F("reserved") + additional).update(reserved=F("reserved") + additional, updated_at=timezone.now())
    if updated != 1:
        raise InsufficientStockError("The additional quantity exceeds available stock.")
    reservation.quantity += additional
    reservation.save(update_fields=["quantity", "updated_at"])
    record_audit(organization, actor, "Stock reservation increased", "StockReservation", reservation.id, new_value={"quantity": str(reservation.quantity)})
    return reservation


def reserve_sales_order_items(organization, actor, sales_order):
    reservations = []
    items = list(sales_order.items.select_related("sku").order_by("sku_id"))
    for item in items:
        reservation = reserve_stock_atomic(
            organization,
            actor,
            sku_id=item.sku_id,
            warehouse_id=sales_order.warehouse_id,
            channel=sales_order.channel,
            reference=sales_order.reference,
            quantity=item.quantity,
            sales_order_item=item,
        )
        item.reservation = reservation
        item.save(update_fields=["reservation"])
        reservations.append(reservation)
    return reservations


@transaction.atomic
def release_stock_reservation(organization, actor, reservation_id):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    reservation = StockReservation.objects.select_for_update().get(organization=organization, pk=reservation_id, status=ReservationStatus.ACTIVE)
    position = StockBalance.objects.get(organization=organization, sku_id=reservation.sku_id, warehouse_id=reservation.warehouse_id)
    now = timezone.now()
    StockBalance.objects.filter(pk=position.pk).update(reserved=Greatest(F("reserved") - reservation.quantity, Decimal("0")), updated_at=now)
    reservation.status = ReservationStatus.RELEASED
    reservation.resolved_at = now
    reservation.save(update_fields=["status", "resolved_at", "updated_at"])
    record_audit(organization, actor, "Stock reservation released", "StockReservation", reservation.id, old_value={"status": "ACTIVE"}, new_value={"status": reservation.status})
    return reservation


@transaction.atomic
def consume_order_reservation(organization, reservation_id, timestamp):
    reservation = StockReservation.objects.select_for_update().get(organization=organization, pk=reservation_id, status=ReservationStatus.ACTIVE)
    reservation.status = ReservationStatus.CONSUMED
    reservation.resolved_at = timestamp
    reservation.save(update_fields=["status", "resolved_at", "updated_at"])
    StockBalance.objects.filter(organization=organization, sku_id=reservation.sku_id, warehouse_id=reservation.warehouse_id).update(
        reserved=Greatest(F("reserved") - reservation.quantity, Decimal("0")),
        updated_at=timestamp,
    )
    return reservation


@transaction.atomic
def transfer_stock_atomic(organization, actor, *, source_warehouse_id, destination_warehouse_id, lines):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    if source_warehouse_id == destination_warehouse_id:
        raise ServiceError("Source and destination warehouses must differ.")
    if not lines:
        raise ServiceError("Add at least one transfer line.")
    if len({line["sku_id"] for line in lines}) != len(lines):
        raise ServiceError("Each SKU can appear only once in a transfer.")
    pairs = [(line["sku_id"], warehouse_id) for warehouse_id in (source_warehouse_id, destination_warehouse_id) for line in lines]
    lock_stock_positions(organization, pairs)
    consumption = consume_fifo_layers(
        organization,
        {(line["sku_id"], source_warehouse_id): line["quantity"] for line in lines},
        respect_reserved=True,
    )
    transfer = StockTransfer.objects.create(
        organization=organization,
        number=next_document_number(organization, DocumentKind.TRANSFER),
        source_warehouse_id=source_warehouse_id,
        destination_warehouse_id=destination_warehouse_id,
        **actor_kwargs(actor),
    )
    for line in sorted(lines, key=lambda item: str(item["sku_id"])):
        consumed = consumption[(line["sku_id"], source_warehouse_id)]
        item = StockTransferItem.objects.create(organization=organization, transfer=transfer, sku_id=line["sku_id"], quantity=consumed.quantity, value=consumed.total_cost)
        for allocation in consumed.layers:
            source_layer = InventoryLayer.objects.get(pk=allocation.layer_id)
            destination_layer = InventoryLayer.objects.select_for_update().filter(
                organization=organization,
                sku_id=line["sku_id"],
                warehouse_id=destination_warehouse_id,
                batch_code=allocation.batch_code,
            ).first()
            if destination_layer:
                if destination_layer.unit_cost != source_layer.unit_cost:
                    raise ServiceError("A destination batch has a conflicting unit cost.")
                destination_layer.initial_quantity += allocation.quantity
                destination_layer.remaining_quantity += allocation.quantity
                destination_layer.remaining_value = money(destination_layer.remaining_value + allocation.value)
                destination_layer.save(update_fields=["initial_quantity", "remaining_quantity", "remaining_value", "updated_at"])
            else:
                destination_layer = InventoryLayer.objects.create(
                    organization=organization,
                    sku_id=line["sku_id"],
                    warehouse_id=destination_warehouse_id,
                    batch_code=source_layer.batch_code,
                    received_at=source_layer.received_at,
                    expires_at=source_layer.expires_at,
                    initial_quantity=allocation.quantity,
                    remaining_quantity=allocation.quantity,
                    source_unit_cost=source_layer.source_unit_cost,
                    source_currency=source_layer.source_currency,
                    unit_cost=source_layer.unit_cost,
                    allocated_landed_unit_cost=source_layer.allocated_landed_unit_cost,
                    remaining_value=allocation.value,
                )
            StockTransferLayer.objects.create(
                organization=organization,
                transfer_item=item,
                source_layer=source_layer,
                destination_layer=destination_layer,
                quantity=allocation.quantity,
                unit_cost=allocation.unit_cost,
                value=allocation.value,
            )
            StockBalance.objects.filter(organization=organization, sku_id=line["sku_id"], warehouse_id=destination_warehouse_id).update(
                on_hand=F("on_hand") + allocation.quantity,
                updated_at=timezone.now(),
            )
    record_audit(organization, actor, "Stock transferred", "StockTransfer", transfer.id, new_value={"source": str(source_warehouse_id), "destination": str(destination_warehouse_id), "lines": len(lines)})
    return transfer


@transaction.atomic
def create_stock_adjustment(organization, actor, *, warehouse_id, sku_id, counted_quantity, reason, adjustment_type=StockAdjustmentType.CYCLE_COUNT):
    assert_permission(actor, organization, Permission.MANAGE_INVENTORY)
    counted_quantity = whole_non_negative_quantity(counted_quantity)
    if adjustment_type not in StockAdjustmentType.values:
        raise ServiceError("Unsupported stock adjustment type.")
    positions = lock_stock_positions(organization, [(sku_id, warehouse_id)])
    position = positions[(sku_id, warehouse_id)]
    if counted_quantity < position.reserved:
        raise ServiceError("The physical count is below reserved stock. Release reservations before adjusting.")
    system_quantity = position.on_hand
    delta = counted_quantity - system_quantity
    adjustment_id = uuid.uuid4()
    number = next_document_number(organization, DocumentKind.STOCK_AUDIT)
    timestamp = timezone.now()
    if delta < 0:
        consumed = consume_fifo_layers(organization, {(sku_id, warehouse_id): -delta})
        value_delta = -consumed[(sku_id, warehouse_id)].total_cost
        lines = [LedgerLine("607000", "Inventory shrinkage", debit=-value_delta), LedgerLine("103000", "Inventory written down", credit=-value_delta)]
    elif delta > 0:
        latest = InventoryLayer.objects.filter(organization=organization, sku_id=sku_id, warehouse_id=warehouse_id).order_by("-received_at", "-created_at").first()
        sku = SKU.objects.get(organization=organization, pk=sku_id)
        unit_cost = latest.unit_cost if latest else sku.cost_price
        value_delta = line_total(delta, unit_cost)
        InventoryLayer.objects.create(
            organization=organization,
            sku_id=sku_id,
            warehouse_id=warehouse_id,
            batch_code=f"{number}-{sku.sku}",
            received_at=timestamp,
            initial_quantity=delta,
            remaining_quantity=delta,
            source_unit_cost=unit_cost,
            source_currency=organization.base_currency,
            unit_cost=unit_cost,
            allocated_landed_unit_cost=Decimal("0.00"),
            remaining_value=value_delta,
        )
        StockBalance.objects.filter(pk=position.pk).update(on_hand=F("on_hand") + delta, updated_at=timestamp)
        lines = [LedgerLine("103000", "Inventory count surplus", debit=value_delta), LedgerLine("607000", "Inventory shrinkage reversal", credit=value_delta)]
    else:
        raise ServiceError("The physical count already matches system stock.")
    journal = post_journal(organization, actor, JournalSourceType.STOCK_ADJUSTMENT, adjustment_id, number, f"/app/inventory/returns?audit={adjustment_id}", f"Stock adjustment {number}", lines, timestamp=timestamp)
    adjustment = StockAdjustment.objects.create(
        id=adjustment_id,
        organization=organization,
        number=number,
        warehouse_id=warehouse_id,
        sku_id=sku_id,
        system_quantity=system_quantity,
        counted_quantity=counted_quantity,
        delta_quantity=delta,
        value_delta=value_delta,
        reason=reason.strip(),
        adjustment_type=adjustment_type,
        journal_entry=journal,
        **actor_kwargs(actor),
    )
    record_audit(organization, actor, "Stock adjustment posted", "StockAdjustment", adjustment.id, old_value={"on_hand": str(system_quantity)}, new_value={"counted": str(counted_quantity), "delta": str(delta), "journal": journal.number})
    return adjustment


def stock_matrix(organization):
    return StockBalance.objects.filter(organization=organization).select_related("sku", "warehouse").order_by("warehouse__code", "sku__sku")


def fifo_layers(organization, sku_id, warehouse_id):
    return InventoryLayer.objects.filter(organization=organization, sku_id=sku_id, warehouse_id=warehouse_id).order_by("received_at", "created_at", "id")


def simulate_fifo(organization, sku_id, warehouse_id, quantity):
    quantity = whole_quantity(quantity)
    layers = list(fifo_layers(organization, sku_id, warehouse_id).filter(remaining_quantity__gt=0))
    remaining = quantity
    consumed = []
    for layer in layers:
        if remaining == 0:
            break
        taken = min(layer.remaining_quantity, remaining)
        value = layer.remaining_value if taken == layer.remaining_quantity else min(layer.remaining_value, money(layer.unit_cost * taken))
        remaining -= taken
        consumed.append({"layer": layer, "quantity": taken, "value": value, "remaining_quantity": layer.remaining_quantity - taken})
    if remaining:
        raise InsufficientStockError("The simulation exceeds available FIFO layers.")
    return {"quantity": quantity, "total_cost": sum_money(item["value"] for item in consumed), "layers": consumed, "wac_comparison": money(sum((layer.remaining_value for layer in layers), Decimal("0")) / sum((layer.remaining_quantity for layer in layers), Decimal("0")) * quantity)}
