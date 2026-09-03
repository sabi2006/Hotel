"""Phase 5: billing, GST, and cash / UPI / card / split payments."""

import pytest

ADMIN_LOGIN = {"email": "admin@myhotel.com", "password": "Admin@123"}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def admin_token(client) -> str:
    return client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]


def staff_token(client, role: str, email: str) -> str:
    client.post(
        "/api/auth/register",
        json={"name": role.title(), "email": email, "password": "Passw0rd!", "role": role},
    )
    return client.post(
        "/api/auth/login", json={"email": email, "password": "Passw0rd!"}
    ).json()["accessToken"]


@pytest.fixture()
def served_order(client):
    """A served order for exactly 1000.00, ready to be paid.

    500 at 0 percent GST, quantity 2, keeps the arithmetic obvious.
    """
    token = admin_token(client)
    category = client.post(
        "/api/categories", json={"name": "Mains"}, headers=auth_header(token)
    ).json()
    table = client.post(
        "/api/tables", json={"tableNumber": "5"}, headers=auth_header(token)
    ).json()
    product = client.post(
        "/api/products",
        json={"name": "Thali", "price": 500, "gstPercentage": 0, "categoryId": category["_id"]},
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
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    kitchen = staff_token(client, "KITCHEN", "cook@myhotel.com")
    client.post(f"/api/kitchen/orders/{order['_id']}/accept", headers=auth_header(kitchen))
    client.post(f"/api/kitchen/orders/{order['_id']}/ready", headers=auth_header(kitchen))
    order = client.post(
        f"/api/orders/{order['_id']}/serve", headers=auth_header(token)
    ).json()

    assert order["grandTotal"] == 1000.0
    return {"admin": token, "order": order, "table": table, "product": product}


# --- settings -----------------------------------------------------------


def test_settings_are_seeded_and_editable(client):
    token = admin_token(client)
    seeded = client.get("/api/settings", headers=auth_header(token)).json()
    assert seeded["restaurantName"] == "My Restaurant"

    updated = client.patch(
        "/api/settings",
        json={"restaurantName": "Spice Garden", "upiId": "spice@upi", "gstNumber": "33ABCDE1234F1Z5"},
        headers=auth_header(token),
    ).json()
    assert updated["restaurantName"] == "Spice Garden"
    assert updated["upiId"] == "spice@upi"


def test_waiter_reads_settings_but_cannot_change_them(client):
    admin_token(client)
    waiter = staff_token(client, "WAITER", "ravi@myhotel.com")

    assert client.get("/api/settings", headers=auth_header(waiter)).status_code == 200
    blocked = client.patch(
        "/api/settings", json={"restaurantName": "Hacked"}, headers=auth_header(waiter)
    )
    assert blocked.status_code == 403


# --- single payments ----------------------------------------------------


def test_full_cash_payment_settles_the_bill(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]

    summary = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    ).json()

    assert summary["amountPaid"] == 1000.0
    assert summary["amountDue"] == 0
    assert summary["isFullyPaid"] is True

    order = client.get(f"/api/orders/{order_id}", headers=auth_header(token)).json()
    assert order["paymentStatus"] == "PAID"
    assert order["orderStatus"] == "PAID"


def test_cash_payment_reports_change(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]

    summary = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000, "receivedAmount": 1500},
        headers=auth_header(token),
    ).json()

    payment = summary["payments"][0]
    assert payment["receivedAmount"] == 1500.0
    assert payment["changeGiven"] == 500.0


def test_received_less_than_paid_is_rejected(client, served_order):
    token = served_order["admin"]
    response = client.post(
        f"/api/orders/{served_order['order']['_id']}/payments",
        json={"method": "CASH", "amount": 1000, "receivedAmount": 500},
        headers=auth_header(token),
    )
    assert response.status_code == 422


def test_card_payment_keeps_its_reference(client, served_order):
    token = served_order["admin"]
    summary = client.post(
        f"/api/orders/{served_order['order']['_id']}/payments",
        json={"method": "CARD", "amount": 1000, "reference": "TXN-99881"},
        headers=auth_header(token),
    ).json()

    assert summary["payments"][0]["method"] == "CARD"
    assert summary["payments"][0]["reference"] == "TXN-99881"


# --- split payments -----------------------------------------------------


def test_split_payment_across_upi_and_cash(client, served_order):
    """The 800 UPI plus 200 cash case from the specification."""
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]

    partial = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "UPI", "amount": 800, "reference": "UPI-4457"},
        headers=auth_header(token),
    ).json()
    assert partial["amountPaid"] == 800.0
    assert partial["amountDue"] == 200.0
    assert partial["isFullyPaid"] is False

    mid = client.get(f"/api/orders/{order_id}", headers=auth_header(token)).json()
    assert mid["paymentStatus"] == "PARTIAL"
    assert mid["orderStatus"] == "PAYMENT_PENDING"

    final = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 200},
        headers=auth_header(token),
    ).json()

    assert final["amountPaid"] == 1000.0
    assert final["amountDue"] == 0
    assert final["isFullyPaid"] is True
    assert len(final["payments"]) == 2
    assert {p["method"] for p in final["payments"]} == {"UPI", "CASH"}


def test_overpaying_is_refused(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "UPI", "amount": 800},
        headers=auth_header(token),
    )

    too_much = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 500},
        headers=auth_header(token),
    )
    assert too_much.status_code == 400
    assert "still due" in too_much.json()["detail"]


def test_paying_an_already_settled_bill_is_refused(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    )

    again = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1},
        headers=auth_header(token),
    )
    assert again.status_code == 409


def test_kitchen_staff_cannot_take_payments(client, served_order):
    kitchen = staff_token(client, "KITCHEN", "cook2@myhotel.com")
    response = client.post(
        f"/api/orders/{served_order['order']['_id']}/payments",
        json={"method": "CASH", "amount": 100},
        headers=auth_header(kitchen),
    )
    assert response.status_code == 403


# --- voiding ------------------------------------------------------------


def test_voiding_a_payment_reopens_the_bill(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    summary = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    ).json()
    payment_id = summary["payments"][0]["_id"]

    voided = client.post(
        f"/api/payments/{payment_id}/void",
        json={"reason": "Entered against the wrong table"},
        headers=auth_header(token),
    ).json()

    assert voided["amountPaid"] == 0
    assert voided["amountDue"] == 1000.0
    # The record survives, flagged.
    assert voided["payments"][0]["isVoided"] is True
    assert voided["payments"][0]["voidReason"] == "Entered against the wrong table"

    order = client.get(f"/api/orders/{order_id}", headers=auth_header(token)).json()
    assert order["orderStatus"] != "PAID"
    assert order["paymentStatus"] == "PENDING"


def test_waiter_cannot_void_a_payment(client, served_order):
    token = served_order["admin"]
    summary = client.post(
        f"/api/orders/{served_order['order']['_id']}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    ).json()

    waiter = staff_token(client, "WAITER", "ravi2@myhotel.com")
    response = client.post(
        f"/api/payments/{summary['payments'][0]['_id']}/void",
        json={"reason": "Trying it on"},
        headers=auth_header(waiter),
    )
    assert response.status_code == 403


# --- closing ------------------------------------------------------------


def test_closing_requires_full_payment(client, served_order):
    """Business rule 5 - it binds admins too."""
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "UPI", "amount": 400},
        headers=auth_header(token),
    )

    blocked = client.post(f"/api/orders/{order_id}/close", headers=auth_header(token))
    assert blocked.status_code == 409
    assert "unpaid" in blocked.json()["detail"]


def test_closing_a_paid_order_frees_the_table(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    )

    closed = client.post(f"/api/orders/{order_id}/close", headers=auth_header(token)).json()
    assert closed["orderStatus"] == "CLOSED"
    assert closed["closedAt"] is not None

    table = client.get(
        f"/api/tables/{served_order['table']['_id']}", headers=auth_header(token)
    ).json()
    assert table["status"] == "FREE"
    assert table["activeOrderId"] is None


def test_unserved_food_blocks_a_waiter_from_closing(client):
    """Business rule 26: served and paid, in that order."""
    token = admin_token(client)
    category = client.post(
        "/api/categories", json={"name": "Mains"}, headers=auth_header(token)
    ).json()
    table = client.post(
        "/api/tables", json={"tableNumber": "9"}, headers=auth_header(token)
    ).json()
    product = client.post(
        "/api/products",
        json={"name": "Dosa", "price": 100, "gstPercentage": 0, "categoryId": category["_id"]},
        headers=auth_header(token),
    ).json()

    waiter = staff_token(client, "WAITER", "ravi3@myhotel.com")
    order = client.post(
        "/api/orders", json={"tableId": table["_id"]}, headers=auth_header(waiter)
    ).json()
    client.post(
        f"/api/orders/{order['_id']}/items",
        json={"productId": product["_id"], "quantity": 1},
        headers=auth_header(waiter),
    )
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(waiter))
    client.post(
        f"/api/orders/{order['_id']}/payments",
        json={"method": "CASH", "amount": 100},
        headers=auth_header(waiter),
    )

    blocked = client.post(f"/api/orders/{order['_id']}/close", headers=auth_header(waiter))
    assert blocked.status_code == 409
    assert "not been served" in blocked.json()["detail"]

    # An admin can override, for the takeaway and walk-out cases.
    forced = client.post(f"/api/orders/{order['_id']}/close", headers=auth_header(token))
    assert forced.status_code == 200


def test_closed_order_takes_no_further_payment(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    )
    client.post(f"/api/orders/{order_id}/close", headers=auth_header(token))

    response = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 10},
        headers=auth_header(token),
    )
    assert response.status_code == 409


def test_cancelled_order_cannot_be_paid(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/cancel",
        json={"reason": "CUSTOMER_CANCELLED"},
        headers=auth_header(token),
    )

    response = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 100},
        headers=auth_header(token),
    )
    assert response.status_code == 409


# --- reporting view -----------------------------------------------------


def test_admin_lists_payments_by_method(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "UPI", "amount": 800},
        headers=auth_header(token),
    )
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 200},
        headers=auth_header(token),
    )

    everything = client.get("/api/payments", headers=auth_header(token)).json()
    assert everything["total"] == 2

    upi_only = client.get("/api/payments?method=UPI", headers=auth_header(token)).json()
    assert upi_only["total"] == 1
    assert upi_only["items"][0]["amount"] == 800.0
    # Denormalised so a payment report needs no join.
    assert upi_only["items"][0]["invoiceNumber"].startswith("INV-")


# --- paying before the food lands ---------------------------------------


def test_a_waiter_can_serve_food_on_a_paid_order(client, served_order):
    """The deadlock this guards against.

    A customer settles at the counter while one dish is still on the pass. The
    waiter must be able to record the delivery, or the order can never close:
    closing needs the food served, and serving would need an admin.
    """
    token = admin_token(client)
    category = client.post(
        "/api/categories", json={"name": "Sides"}, headers=auth_header(token)
    ).json()
    table = client.post(
        "/api/tables", json={"tableNumber": "21"}, headers=auth_header(token)
    ).json()
    product = client.post(
        "/api/products",
        json={"name": "Grill", "price": 100, "gstPercentage": 0, "categoryId": category["_id"]},
        headers=auth_header(token),
    ).json()

    waiter = staff_token(client, "WAITER", "ravi.serve@myhotel.com")
    order = client.post(
        "/api/orders", json={"tableId": table["_id"]}, headers=auth_header(waiter)
    ).json()
    client.post(
        f"/api/orders/{order['_id']}/items",
        json={"productId": product["_id"], "quantity": 1},
        headers=auth_header(waiter),
    )
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(waiter))

    kitchen = staff_token(client, "KITCHEN", "cook.serve@myhotel.com")
    client.post(f"/api/kitchen/orders/{order['_id']}/accept", headers=auth_header(kitchen))
    client.post(f"/api/kitchen/orders/{order['_id']}/ready", headers=auth_header(kitchen))

    # The customer pays while the dish is still on the pass.
    client.post(
        f"/api/orders/{order['_id']}/payments",
        json={"method": "CASH", "amount": 100},
        headers=auth_header(waiter),
    )
    paid = client.get(f"/api/orders/{order['_id']}", headers=auth_header(waiter)).json()
    assert paid["orderStatus"] == "PAID"

    # Closing is refused while the food is unserved...
    blocked = client.post(f"/api/orders/{order['_id']}/close", headers=auth_header(waiter))
    assert blocked.status_code == 409

    # ...and the waiter must be able to resolve that themselves.
    served = client.post(f"/api/orders/{order['_id']}/serve", headers=auth_header(waiter))
    assert served.status_code == 200, served.text
    assert all(item["kitchenStatus"] == "SERVED" for item in served.json()["items"])

    closed = client.post(f"/api/orders/{order['_id']}/close", headers=auth_header(waiter))
    assert closed.status_code == 200
    assert closed.json()["orderStatus"] == "CLOSED"


def test_a_waiter_still_cannot_change_a_paid_bill(client, served_order):
    """Serving is unlocked; the money is not."""
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    )

    waiter = staff_token(client, "WAITER", "ravi.money@myhotel.com")
    blocked = client.patch(
        f"/api/orders/{order_id}", json={"discount": 100}, headers=auth_header(waiter)
    )
    assert blocked.status_code == 403


def test_a_closed_order_cannot_be_served(client, served_order):
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(token),
    )
    client.post(f"/api/orders/{order_id}/close", headers=auth_header(token))

    waiter = staff_token(client, "WAITER", "ravi.closed@myhotel.com")
    response = client.post(f"/api/orders/{order_id}/serve", headers=auth_header(waiter))
    assert response.status_code in (403, 409)


# --- duplicate submission protection ------------------------------------


def test_the_same_request_id_only_charges_once(client, served_order):
    """A double-tap, or a retry after a timeout, must not take money twice."""
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]
    body = {"method": "CASH", "amount": 400, "clientRequestId": "tap-abc-12345678"}

    first = client.post(
        f"/api/orders/{order_id}/payments", json=body, headers=auth_header(token)
    ).json()
    assert first["amountPaid"] == 400.0
    assert len(first["payments"]) == 1

    # Same key again: the state comes back unchanged, not a second charge.
    for _ in range(4):
        replay = client.post(
            f"/api/orders/{order_id}/payments", json=body, headers=auth_header(token)
        ).json()
        assert replay["amountPaid"] == 400.0
        assert len(replay["payments"]) == 1

    listed = client.get("/api/payments?pageSize=50", headers=auth_header(token)).json()
    assert len([p for p in listed["items"] if p["amount"] == 400.0]) == 1


def test_different_request_ids_are_separate_payments(client, served_order):
    """Idempotency must not swallow a genuine second tender."""
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]

    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "UPI", "amount": 800, "clientRequestId": "row-one-11111111"},
        headers=auth_header(token),
    )
    final = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 200, "clientRequestId": "row-two-22222222"},
        headers=auth_header(token),
    ).json()

    assert final["amountPaid"] == 1000.0
    assert final["amountDue"] == 0
    assert len(final["payments"]) == 2


def test_payments_without_a_request_id_still_work(client, served_order):
    """The keyless path is the existing behaviour and must not regress."""
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]

    for amount in (300, 300, 400):
        client.post(
            f"/api/orders/{order_id}/payments",
            json={"method": "CASH", "amount": amount},
            headers=auth_header(token),
        )

    summary = client.get(f"/api/orders/{order_id}/payments", headers=auth_header(token)).json()
    assert summary["amountPaid"] == 1000.0
    assert len(summary["payments"]) == 3


def test_a_three_way_split_settles_the_bill(client, served_order):
    """UPI 700 + cash 200 + card 100 against a 1000 bill."""
    token = served_order["admin"]
    order_id = served_order["order"]["_id"]

    for method, amount in (("UPI", 700), ("CASH", 200), ("CARD", 100)):
        summary = client.post(
            f"/api/orders/{order_id}/payments",
            json={"method": method, "amount": amount},
            headers=auth_header(token),
        ).json()

    assert summary["amountPaid"] == 1000.0
    assert summary["amountDue"] == 0
    assert summary["isFullyPaid"] is True
    assert {p["method"] for p in summary["payments"]} == {"UPI", "CASH", "CARD"}

    order = client.get(f"/api/orders/{order_id}", headers=auth_header(token)).json()
    assert order["paymentStatus"] == "PAID"
