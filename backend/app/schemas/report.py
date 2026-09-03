from datetime import datetime

from pydantic import BaseModel


class ReportPeriod(BaseModel):
    fromDate: datetime
    toDate: datetime
    tzOffsetMinutes: int = 0


class SalesSummary(BaseModel):
    """Headline numbers for a period."""

    period: ReportPeriod

    totalSales: float = 0
    netSales: float = 0
    totalGst: float = 0
    totalDiscount: float = 0

    totalOrders: int = 0
    cancelledOrders: int = 0
    itemsSold: int = 0
    averageOrderValue: float = 0

    # Money actually received in the window, by method.
    totalCollected: float = 0
    cashAmount: float = 0
    upiAmount: float = 0
    cardAmount: float = 0
    pendingAmount: float = 0

    totalTips: float = 0
    cashTips: float = 0
    upiTips: float = 0


class SeriesPoint(BaseModel):
    label: str
    sales: float = 0
    orders: int = 0
    collected: float = 0


class HourPoint(BaseModel):
    hour: int
    label: str
    sales: float = 0
    orders: int = 0


class ProductRow(BaseModel):
    productId: str | None = None
    name: str
    quantitySold: int = 0
    revenue: float = 0


class CategoryRow(BaseModel):
    name: str
    quantitySold: int = 0
    revenue: float = 0


class WaiterRow(BaseModel):
    waiterId: str
    name: str
    orders: int = 0
    sales: float = 0
    averageOrderValue: float = 0
    tips: float = 0


class TableRow(BaseModel):
    tableNumber: str
    orders: int = 0
    sales: float = 0
    averageOrderValue: float = 0


class KitchenReport(BaseModel):
    """Prep timing, derived from the milestones stamped on each order."""

    ordersPrepared: int = 0
    averageAcceptMinutes: float = 0
    averagePrepMinutes: float = 0
    averageTotalMinutes: float = 0
    slowestPrepMinutes: float = 0


class PaymentMethodRow(BaseModel):
    method: str
    amount: float = 0
    count: int = 0
