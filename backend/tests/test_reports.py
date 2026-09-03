"""Phase 7: report aggregation."""

from datetime import datetime, timedelta, timezone

import pytest

ADMIN_LOGIN = {"email": "admin@myhotel.com", "password": "Admin@123"}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def admin_token(client) -> str:
    return client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]


def staff_token(client, role: str, email: str, name: str) -> str:
    client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "Passw0rd!", "role": role},
    )
    return client.post(
        "/api/auth/login", json={"email": email, "password": "Passw0rd!"}
    ).json()["accessToken"]


def iso(moment: datetime) -> str:
    """UTC with a trailing Z.

    An isoformat offset such as +00:00 must be percent-encoded in a query
    string, or the + arrives as a space. Sending Z avoids the trap entirely,
    and is what the frontend does via Date.toISOString().
    """
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def window() -> str:
    """A range wide enough to hold everything the fixture creates."""
    now = datetime.now(timezone.utc)
    return f"fromDate={iso(now - timedelta(days=1))}&toDate={iso(now + timedelta(days=1))}"


@pytest.fixture()
def trading_day(client):
    """Two settled orders and one cancelled one, with tips and split payments.

    Biriyani 200 at 0 percent GST, Lime 50 at 0 percent, so every total below is
    checkable by hand.
    """
    token = admin_token(client)
    category = client.post(
        "/api/categories", json={"name": "Mains"}, headers=auth_header(token)
    ).json()
    drinks = client.post(
        "/api/categories", json={"name": "Drinks"}, headers=auth_header(token)
    ).json()

    biriyani = client.post(
        "/api/products",
        json={"name": "Biriyani", "price": 200, "gstPercentage": 0, "categoryId": category["_id"]},
        headers=auth_header(token),
    ).json()
    lime = client.post(
        "/api/products",
        json={"name": "Lime", "price": 50, "gstPercentage": 0, "categoryId": drinks["_id"]},
        headers=auth_header(token),
    ).json()

    tables = [
        client.post(
            "/api/tables", json={"tableNumber": number}, headers=auth_header(token)
        ).json()
        for number in ["1", "2", "3"]
    ]

    ravi = staff_token(client, "WAITER", "ravi@myhotel.com", "Ravi")
    kitchen = staff_token(client, "KITCHEN", "cook@myhotel.com", "Cook")

    def run_order(table, waiter, lines):
        order = client.post(
            "/api/orders", json={"tableId": table["_id"]}, headers=auth_header(waiter)
        ).json()
        for product, quantity in lines:
            client.post(
                f"/api/orders/{order['_id']}/items",
                json={"productId": product["_id"], "quantity": quantity},
                headers=auth_header(waiter),
            )
        client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(waiter))
        client.post(f"/api/kitchen/orders/{order['_id']}/accept", headers=auth_header(kitchen))
        client.post(f"/api/kitchen/orders/{order['_id']}/ready", headers=auth_header(kitchen))
        return client.post(
            f"/api/orders/{order['_id']}/serve", headers=auth_header(waiter)
        ).json()

    # Order 1: 2 biriyani + 2 lime = 500, split 300 UPI + 200 cash, 100 cash tip.
    first = run_order(tables[0], ravi, [(biriyani, 2), (lime, 2)])
    client.post(
        f"/api/orders/{first['_id']}/payments",
        json={"method": "UPI", "amount": 300},
        headers=auth_header(ravi),
    )
    client.post(
        f"/api/orders/{first['_id']}/payments",
        json={"method": "CASH", "amount": 200},
        headers=auth_header(ravi),
    )
    client.post(
        f"/api/orders/{first['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(ravi),
    )
    client.post(f"/api/orders/{first['_id']}/close", headers=auth_header(ravi))

    # Order 2: 1 biriyani = 200, paid by card, still open.
    second = run_order(tables[1], ravi, [(biriyani, 1)])
    client.post(
        f"/api/orders/{second['_id']}/payments",
        json={"method": "CARD", "amount": 200},
        headers=auth_header(ravi),
    )

    # Order 3: cancelled, so it must not count as revenue.
    third = client.post(
        "/api/orders", json={"tableId": tables[2]["_id"]}, headers=auth_header(ravi)
    ).json()
    client.post(
        f"/api/orders/{third['_id']}/items",
        json={"productId": biriyani["_id"], "quantity": 5},
        headers=auth_header(ravi),
    )
    client.post(f"/api/orders/{third['_id']}/send-kitchen", headers=auth_header(ravi))
    client.post(
        f"/api/orders/{third['_id']}/cancel",
        json={"reason": "CUSTOMER_CANCELLED"},
        headers=auth_header(ravi),
    )

    return {"admin": token, "waiter": ravi, "first": first, "second": second}


# --- summary ------------------------------------------------------------


def test_summary_totals(client, trading_day):
    token = trading_day["admin"]
    summary = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()

    # 500 + 200; the cancelled order contributes nothing.
    assert summary["totalSales"] == 700.0
    assert summary["totalOrders"] == 2
    assert summary["cancelledOrders"] == 1
    # 2 biriyani + 2 lime + 1 biriyani
    assert summary["itemsSold"] == 5
    assert summary["averageOrderValue"] == 350.0


def test_summary_splits_collections_by_method(client, trading_day):
    token = trading_day["admin"]
    summary = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()

    assert summary["cashAmount"] == 200.0
    assert summary["upiAmount"] == 300.0
    assert summary["cardAmount"] == 200.0
    assert summary["totalCollected"] == 700.0


def test_summary_counts_tips_separately(client, trading_day):
    token = trading_day["admin"]
    summary = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()

    assert summary["totalTips"] == 100.0
    assert summary["cashTips"] == 100.0
    # A tip is never part of sales.
    assert summary["totalSales"] == 700.0


def test_summary_reports_outstanding_money(client, trading_day):
    """Order 2 is fully paid but not closed, so nothing is outstanding."""
    token = trading_day["admin"]
    summary = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()
    assert summary["pendingAmount"] == 0

    # Add an unpaid order and it should show up.
    table = client.post(
        "/api/tables", json={"tableNumber": "9"}, headers=auth_header(token)
    ).json()
    order = client.post(
        "/api/orders", json={"tableId": table["_id"]}, headers=auth_header(token)
    ).json()
    products = client.get("/api/products?search=Biriyani", headers=auth_header(token)).json()
    client.post(
        f"/api/orders/{order['_id']}/items",
        json={"productId": products["items"][0]["_id"], "quantity": 1},
        headers=auth_header(token),
    )
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    updated = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()
    assert updated["pendingAmount"] == 200.0


def test_gst_and_discount_are_reported(client):
    token = admin_token(client)
    category = client.post(
        "/api/categories", json={"name": "Mains"}, headers=auth_header(token)
    ).json()
    table = client.post(
        "/api/tables", json={"tableNumber": "1"}, headers=auth_header(token)
    ).json()
    product = client.post(
        "/api/products",
        json={"name": "Thali", "price": 100, "gstPercentage": 5, "categoryId": category["_id"]},
        headers=auth_header(token),
    ).json()

    order = client.post(
        "/api/orders", json={"tableId": table["_id"]}, headers=auth_header(token)
    ).json()
    client.post(
        f"/api/orders/{order['_id']}/items",
        json={"productId": product["_id"], "quantity": 2},
        headers=auth_header(token),
    )
    client.patch(
        f"/api/orders/{order['_id']}", json={"discount": 10}, headers=auth_header(token)
    )
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    summary = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()
    assert summary["totalGst"] == 10.0
    assert summary["totalDiscount"] == 10.0
    # 200 + 10 GST - 10 discount
    assert summary["totalSales"] == 200.0
    assert summary["netSales"] == 190.0


def test_window_excludes_anything_outside_it(client, trading_day):
    token = trading_day["admin"]
    long_ago = iso(datetime.now(timezone.utc) - timedelta(days=400))
    older = iso(datetime.now(timezone.utc) - timedelta(days=390))

    summary = client.get(
        f"/api/reports/summary?fromDate={long_ago}&toDate={older}", headers=auth_header(token)
    ).json()
    assert summary["totalSales"] == 0
    assert summary["totalOrders"] == 0


def test_waiter_cannot_read_reports(client, trading_day):
    response = client.get(
        f"/api/reports/summary?{window()}", headers=auth_header(trading_day["waiter"])
    )
    assert response.status_code == 403


# --- breakdowns ---------------------------------------------------------


def test_product_report_ranks_by_revenue(client, trading_day):
    token = trading_day["admin"]
    rows = client.get(f"/api/reports/products?{window()}", headers=auth_header(token)).json()

    assert rows[0]["name"] == "Biriyani"
    assert rows[0]["quantitySold"] == 3
    assert rows[0]["revenue"] == 600.0
    assert rows[1]["name"] == "Lime"
    assert rows[1]["revenue"] == 100.0


def test_product_report_respects_the_limit(client, trading_day):
    token = trading_day["admin"]
    rows = client.get(
        f"/api/reports/products?{window()}&limit=1", headers=auth_header(token)
    ).json()
    assert len(rows) == 1


def test_category_report_rolls_products_up(client, trading_day):
    token = trading_day["admin"]
    rows = client.get(f"/api/reports/categories?{window()}", headers=auth_header(token)).json()

    by_name = {row["name"]: row for row in rows}
    assert by_name["Mains"]["revenue"] == 600.0
    assert by_name["Drinks"]["revenue"] == 100.0


def test_waiter_report_includes_sales_and_tips(client, trading_day):
    token = trading_day["admin"]
    rows = client.get(f"/api/reports/waiters?{window()}", headers=auth_header(token)).json()

    ravi = next(row for row in rows if row["name"] == "Ravi")
    assert ravi["orders"] == 2
    assert ravi["sales"] == 700.0
    assert ravi["averageOrderValue"] == 350.0
    assert ravi["tips"] == 100.0


def test_table_report(client, trading_day):
    token = trading_day["admin"]
    rows = client.get(f"/api/reports/tables?{window()}", headers=auth_header(token)).json()

    by_table = {row["tableNumber"]: row for row in rows}
    assert by_table["1"]["sales"] == 500.0
    assert by_table["2"]["sales"] == 200.0
    # The cancelled order on table 3 is not revenue.
    assert "3" not in by_table


def test_payment_method_report(client, trading_day):
    token = trading_day["admin"]
    rows = client.get(
        f"/api/reports/payment-methods?{window()}", headers=auth_header(token)
    ).json()

    by_method = {row["method"]: row for row in rows}
    assert by_method["UPI"]["amount"] == 300.0
    assert by_method["CASH"]["amount"] == 200.0
    assert by_method["CARD"]["amount"] == 200.0
    assert by_method["UPI"]["count"] == 1


def test_voided_payments_are_excluded(client, trading_day):
    token = trading_day["admin"]
    payments = client.get("/api/payments?pageSize=50", headers=auth_header(token)).json()
    upi = next(p for p in payments["items"] if p["method"] == "UPI")

    client.post(
        f"/api/payments/{upi['_id']}/void",
        json={"reason": "Bank reversed it"},
        headers=auth_header(token),
    )

    summary = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()
    assert summary["upiAmount"] == 0
    assert summary["totalCollected"] == 400.0


# --- series and timing --------------------------------------------------


def test_daily_series_has_a_point_for_today(client, trading_day):
    token = trading_day["admin"]
    points = client.get(f"/api/reports/series?{window()}", headers=auth_header(token)).json()

    assert len(points) >= 1
    assert sum(point["sales"] for point in points) == 700.0
    assert sum(point["orders"] for point in points) == 2


def test_hourly_series_buckets_by_hour(client, trading_day):
    token = trading_day["admin"]
    points = client.get(
        f"/api/reports/series?{window()}&granularity=hour", headers=auth_header(token)
    ).json()
    assert all(":00" in point["label"] for point in points)


def test_peak_hours_covers_the_whole_day(client, trading_day):
    token = trading_day["admin"]
    hours = client.get(f"/api/reports/peak-hours?{window()}", headers=auth_header(token)).json()

    assert len(hours) == 24
    assert [hour["hour"] for hour in hours] == list(range(24))
    assert sum(hour["sales"] for hour in hours) == 700.0


def test_timezone_offset_shifts_the_buckets(client, trading_day):
    """A restaurant in IST must not see its evening trade land on the wrong day."""
    token = trading_day["admin"]
    utc = client.get(f"/api/reports/peak-hours?{window()}", headers=auth_header(token)).json()
    ist = client.get(
        f"/api/reports/peak-hours?{window()}&tzOffsetMinutes=330", headers=auth_header(token)
    ).json()

    busiest_utc = max(utc, key=lambda h: h["orders"])["hour"]
    busiest_ist = max(ist, key=lambda h: h["orders"])["hour"]
    assert busiest_ist == (busiest_utc + 5) % 24 or busiest_ist == (busiest_utc + 6) % 24


def test_kitchen_report_measures_preparation(client, trading_day):
    token = trading_day["admin"]
    report = client.get(f"/api/reports/kitchen?{window()}", headers=auth_header(token)).json()

    assert report["ordersPrepared"] == 2
    assert report["averagePrepMinutes"] >= 0
    assert report["averageTotalMinutes"] >= 0
    assert report["slowestPrepMinutes"] >= report["averageTotalMinutes"]


def test_empty_period_returns_zeroes_not_an_error(client):
    token = admin_token(client)
    summary = client.get(f"/api/reports/summary?{window()}", headers=auth_header(token)).json()

    assert summary["totalSales"] == 0
    assert summary["averageOrderValue"] == 0
    assert client.get(f"/api/reports/products?{window()}", headers=auth_header(token)).json() == []
    assert (
        client.get(f"/api/reports/categories?{window()}", headers=auth_header(token)).json() == []
    )
