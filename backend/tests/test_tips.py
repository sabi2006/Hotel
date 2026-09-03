"""Phase 6: tips, kept separate from the food bill."""

import pytest

ADMIN_LOGIN = {"email": "admin@myhotel.com", "password": "Admin@123"}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def admin_token(client) -> str:
    return client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]


def staff_token(client, role: str, email: str, name: str | None = None) -> str:
    client.post(
        "/api/auth/register",
        json={
            "name": name or role.title(),
            "email": email,
            "password": "Passw0rd!",
            "role": role,
        },
    )
    return client.post(
        "/api/auth/login", json={"email": email, "password": "Passw0rd!"}
    ).json()["accessToken"]


@pytest.fixture()
def served_order(client):
    """A served order worth exactly 1000, taken by a waiter called Ravi."""
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

    waiter = staff_token(client, "WAITER", "ravi@myhotel.com", name="Ravi Kumar")
    order = client.post(
        "/api/orders", json={"tableId": table["_id"]}, headers=auth_header(waiter)
    ).json()
    client.post(
        f"/api/orders/{order['_id']}/items",
        json={"productId": product["_id"], "quantity": 2},
        headers=auth_header(waiter),
    )
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(waiter))

    kitchen = staff_token(client, "KITCHEN", "cook@myhotel.com")
    client.post(f"/api/kitchen/orders/{order['_id']}/accept", headers=auth_header(kitchen))
    client.post(f"/api/kitchen/orders/{order['_id']}/ready", headers=auth_header(kitchen))
    order = client.post(
        f"/api/orders/{order['_id']}/serve", headers=auth_header(waiter)
    ).json()

    return {"admin": token, "waiter": waiter, "order": order, "table": table}


# --- recording tips -----------------------------------------------------


def test_cash_tip_is_recorded_against_the_waiter(client, served_order):
    waiter = served_order["waiter"]
    order = served_order["order"]

    summary = client.post(
        f"/api/orders/{order['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(waiter),
    ).json()

    assert summary["totalTips"] == 100.0
    tip = summary["tips"][0]
    assert tip["method"] == "CASH"
    assert tip["waiterName"] == "Ravi Kumar"
    assert tip["invoiceNumber"] == order["invoiceNumber"]


def test_upi_tip_keeps_its_reference(client, served_order):
    waiter = served_order["waiter"]
    summary = client.post(
        f"/api/orders/{served_order['order']['_id']}/tips",
        json={"amount": 50, "method": "UPI", "reference": "UPI-TIP-771"},
        headers=auth_header(waiter),
    ).json()

    assert summary["tips"][0]["method"] == "UPI"
    assert summary["tips"][0]["reference"] == "UPI-TIP-771"


def test_a_tip_never_touches_the_food_bill(client, served_order):
    """The whole point of keeping tips separate."""
    waiter = served_order["waiter"]
    order_id = served_order["order"]["_id"]

    client.post(
        f"/api/orders/{order_id}/tips",
        json={"amount": 250, "method": "CASH"},
        headers=auth_header(waiter),
    )

    after = client.get(f"/api/orders/{order_id}", headers=auth_header(waiter)).json()
    assert after["grandTotal"] == 1000.0
    assert after["amountPaid"] == 0

    summary = client.get(f"/api/orders/{order_id}/payments", headers=auth_header(waiter)).json()
    assert summary["amountDue"] == 1000.0


def test_a_tip_does_not_block_or_help_closing(client, served_order):
    waiter = served_order["waiter"]
    order_id = served_order["order"]["_id"]

    client.post(
        f"/api/orders/{order_id}/tips",
        json={"amount": 1000, "method": "CASH"},
        headers=auth_header(waiter),
    )
    # A generous tip is not payment for the food.
    blocked = client.post(f"/api/orders/{order_id}/close", headers=auth_header(waiter))
    assert blocked.status_code == 409

    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 1000},
        headers=auth_header(waiter),
    )
    closed = client.post(f"/api/orders/{order_id}/close", headers=auth_header(waiter))
    assert closed.status_code == 200


def test_multiple_tips_add_up(client, served_order):
    waiter = served_order["waiter"]
    order_id = served_order["order"]["_id"]

    client.post(
        f"/api/orders/{order_id}/tips",
        json={"amount": 60, "method": "CASH"},
        headers=auth_header(waiter),
    )
    summary = client.post(
        f"/api/orders/{order_id}/tips",
        json={"amount": 40.5, "method": "UPI"},
        headers=auth_header(waiter),
    ).json()

    assert summary["totalTips"] == 100.5
    assert len(summary["tips"]) == 2


def test_zero_or_negative_tips_are_rejected(client, served_order):
    waiter = served_order["waiter"]
    order_id = served_order["order"]["_id"]

    for amount in (0, -50):
        response = client.post(
            f"/api/orders/{order_id}/tips",
            json={"amount": amount, "method": "CASH"},
            headers=auth_header(waiter),
        )
        assert response.status_code == 422


def test_kitchen_staff_cannot_record_tips(client, served_order):
    kitchen = staff_token(client, "KITCHEN", "cook2@myhotel.com")
    response = client.post(
        f"/api/orders/{served_order['order']['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(kitchen),
    )
    assert response.status_code == 403


def test_cancelled_order_takes_no_tips(client, served_order):
    waiter = served_order["waiter"]
    order_id = served_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/cancel",
        json={"reason": "CUSTOMER_CANCELLED"},
        headers=auth_header(waiter),
    )

    response = client.post(
        f"/api/orders/{order_id}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(waiter),
    )
    assert response.status_code == 409


# --- voiding and visibility --------------------------------------------


def test_voiding_a_tip_removes_it_from_the_total(client, served_order):
    token = served_order["admin"]
    waiter = served_order["waiter"]
    summary = client.post(
        f"/api/orders/{served_order['order']['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(waiter),
    ).json()

    voided = client.post(
        f"/api/tips/{summary['tips'][0]['_id']}/void",
        json={"reason": "Recorded twice by mistake"},
        headers=auth_header(token),
    ).json()

    assert voided["totalTips"] == 0
    assert voided["tips"][0]["isVoided"] is True
    assert voided["tips"][0]["voidReason"] == "Recorded twice by mistake"


def test_waiter_cannot_void_a_tip(client, served_order):
    waiter = served_order["waiter"]
    summary = client.post(
        f"/api/orders/{served_order['order']['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(waiter),
    ).json()

    response = client.post(
        f"/api/tips/{summary['tips'][0]['_id']}/void",
        json={"reason": "Would rather keep it"},
        headers=auth_header(waiter),
    )
    assert response.status_code == 403


def test_a_waiter_sees_only_their_own_tips(client, served_order):
    """One waiter must not be able to read another waiter's earnings."""
    token = served_order["admin"]
    ravi = served_order["waiter"]
    client.post(
        f"/api/orders/{served_order['order']['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(ravi),
    )

    other = staff_token(client, "WAITER", "priya@myhotel.com", name="Priya")

    assert client.get("/api/tips", headers=auth_header(ravi)).json()["total"] == 1
    assert client.get("/api/tips", headers=auth_header(other)).json()["total"] == 0
    assert client.get("/api/tips", headers=auth_header(token)).json()["total"] == 1


def test_admin_filters_tips_by_waiter(client, served_order):
    token = served_order["admin"]
    waiter = served_order["waiter"]
    client.post(
        f"/api/orders/{served_order['order']['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(waiter),
    )
    waiter_id = client.get("/api/auth/me", headers=auth_header(waiter)).json()["_id"]

    matching = client.get(f"/api/tips?waiterId={waiter_id}", headers=auth_header(token)).json()
    assert matching["total"] == 1
    assert matching["items"][0]["waiterName"] == "Ravi Kumar"


# --- waiter tip QR ------------------------------------------------------


def test_waiter_manages_their_own_tip_qr(client, served_order):
    waiter = served_order["waiter"]
    updated = client.patch(
        "/api/auth/me/tip-qr",
        json={"tipUpiId": "ravi@okaxis", "tipQrImage": "https://example.com/ravi-qr.png"},
        headers=auth_header(waiter),
    ).json()

    assert updated["tipUpiId"] == "ravi@okaxis"
    assert updated["tipQrImage"] == "https://example.com/ravi-qr.png"

    me = client.get("/api/auth/me", headers=auth_header(waiter)).json()
    assert me["tipUpiId"] == "ravi@okaxis"


def test_admin_can_set_a_waiter_tip_qr(client, served_order):
    token = served_order["admin"]
    waiter = served_order["waiter"]
    waiter_id = client.get("/api/auth/me", headers=auth_header(waiter)).json()["_id"]

    updated = client.patch(
        f"/api/users/{waiter_id}",
        json={"tipUpiId": "ravi@okhdfcbank"},
        headers=auth_header(token),
    ).json()
    assert updated["tipUpiId"] == "ravi@okhdfcbank"


def test_clearing_the_tip_qr_works(client, served_order):
    waiter = served_order["waiter"]
    client.patch(
        "/api/auth/me/tip-qr", json={"tipUpiId": "ravi@okaxis"}, headers=auth_header(waiter)
    )

    cleared = client.patch(
        "/api/auth/me/tip-qr", json={"tipUpiId": ""}, headers=auth_header(waiter)
    ).json()
    assert cleared["tipUpiId"] is None


# --- WhatsApp settings --------------------------------------------------


def test_whatsapp_country_code_is_configurable(client):
    token = admin_token(client)
    seeded = client.get("/api/settings", headers=auth_header(token)).json()
    assert seeded["whatsappCountryCode"] == "91"

    updated = client.patch(
        "/api/settings", json={"whatsappCountryCode": "44"}, headers=auth_header(token)
    ).json()
    assert updated["whatsappCountryCode"] == "44"
