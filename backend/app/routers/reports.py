"""Sales, product, staff and kitchen reports.

Every endpoint takes an explicit UTC date range. The client computes the window
for a preset such as "this week" from its own clock and sends the boundaries,
which is the only way a report can honour the restaurant local day without the
server guessing at a timezone.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.core.deps import AdminUser
from app.schemas.report import (
    CategoryRow,
    HourPoint,
    KitchenReport,
    PaymentMethodRow,
    ProductRow,
    ReportPeriod,
    SalesSummary,
    SeriesPoint,
    TableRow,
    WaiterRow,
)
from app.services import reports as service

router = APIRouter(prefix="/reports", tags=["reports"])


class DateRange:
    """Shared query parameters for every report."""

    def __init__(
        self,
        fromDate: datetime | None = Query(default=None, description="Start of window, UTC"),
        toDate: datetime | None = Query(default=None, description="End of window, UTC"),
        tzOffsetMinutes: int = Query(
            default=0,
            ge=-840,
            le=840,
            description="Minutes to add to UTC for the viewer local time",
        ),
    ) -> None:
        now = datetime.now(timezone.utc)
        self.to_date = toDate or now
        # A month of history is a sensible default for an unfiltered call.
        self.from_date = fromDate or (self.to_date - timedelta(days=30))
        self.tz_offset = tzOffsetMinutes

    def as_period(self) -> ReportPeriod:
        return ReportPeriod(
            fromDate=self.from_date, toDate=self.to_date, tzOffsetMinutes=self.tz_offset
        )


Range = Annotated[DateRange, Depends(DateRange)]


@router.get("/summary", response_model=SalesSummary)
async def sales_summary(admin: AdminUser, window: Range) -> SalesSummary:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    payments = await service.payments_in_range(window.from_date, window.to_date)
    tips = await service.tips_in_range(window.from_date, window.to_date)

    return SalesSummary(
        period=window.as_period(),
        **service.build_summary(orders, payments, tips),
    )


@router.get("/series", response_model=list[SeriesPoint])
async def sales_series(
    admin: AdminUser,
    window: Range,
    granularity: Literal["day", "month", "hour"] = "day",
) -> list[SeriesPoint]:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    payments = await service.payments_in_range(window.from_date, window.to_date)

    points = service.build_series(orders, payments, granularity, window.tz_offset)
    return [SeriesPoint(**point) for point in points]


@router.get("/peak-hours", response_model=list[HourPoint])
async def peak_hours(admin: AdminUser, window: Range) -> list[HourPoint]:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    return [HourPoint(**point) for point in service.build_peak_hours(orders, window.tz_offset)]


@router.get("/products", response_model=list[ProductRow])
async def product_report(
    admin: AdminUser,
    window: Range,
    limit: int = Query(default=10, ge=1, le=100),
) -> list[ProductRow]:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    return [ProductRow(**row) for row in service.build_product_rows(orders, limit)]


@router.get("/categories", response_model=list[CategoryRow])
async def category_report(admin: AdminUser, window: Range) -> list[CategoryRow]:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    return [CategoryRow(**row) for row in await service.build_category_rows(orders)]


@router.get("/waiters", response_model=list[WaiterRow])
async def waiter_report(admin: AdminUser, window: Range) -> list[WaiterRow]:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    tips = await service.tips_in_range(window.from_date, window.to_date)
    return [WaiterRow(**row) for row in service.build_waiter_rows(orders, tips)]


@router.get("/tables", response_model=list[TableRow])
async def table_report(admin: AdminUser, window: Range) -> list[TableRow]:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    return [TableRow(**row) for row in service.build_table_rows(orders)]


@router.get("/payment-methods", response_model=list[PaymentMethodRow])
async def payment_method_report(admin: AdminUser, window: Range) -> list[PaymentMethodRow]:
    payments = await service.payments_in_range(window.from_date, window.to_date)
    return [PaymentMethodRow(**row) for row in service.build_payment_method_rows(payments)]


@router.get("/kitchen", response_model=KitchenReport)
async def kitchen_report(admin: AdminUser, window: Range) -> KitchenReport:
    orders = await service.orders_in_range(window.from_date, window.to_date)
    return KitchenReport(**service.build_kitchen_report(orders))
