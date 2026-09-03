"""Phase 8: the audit trail, and the security hardening around it."""

import pytest

from app.core.ratelimit import clear_all, login_limiter

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


@pytest.fixture(autouse=True)
def reset_limiter():
    """Each test starts with a clean rate-limit slate."""
    clear_all()
    yield
    clear_all()


@pytest.fixture()
def priced_order(client):
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
        json={"productId": product["_id"], "quantity": 1},
        headers=auth_header(token),
    )
    return {"admin": token, "order": order, "product": product, "table": table}


def logs(client, token: str, **params) -> list[dict]:
    query = "&".join(f"{key}={value}" for key, value in params.items())
    url = "/api/audit-logs" + (f"?{query}" if query else "")
    return client.get(url, headers=auth_header(token)).json()["items"]


# --- the audit trail ----------------------------------------------------


def test_opening_an_order_is_logged(client, priced_order):
    token = priced_order["admin"]
    entries = logs(client, token, action="ORDER_CREATED")

    assert len(entries) == 1
    assert entries[0]["entityLabel"] == priced_order["order"]["invoiceNumber"]
    assert entries[0]["userName"] == "Super Admin"
    assert entries[0]["userRole"] == "ADMIN"


def test_payment_and_close_are_logged_with_amounts(client, priced_order):
    token = priced_order["admin"]
    order_id = priced_order["order"]["_id"]

    client.post(f"/api/orders/{order_id}/send-kitchen", headers=auth_header(token))
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 500},
        headers=auth_header(token),
    )
    client.post(f"/api/orders/{order_id}/close", headers=auth_header(token))

    payment_log = logs(client, token, action="PAYMENT_ADDED")[0]
    assert payment_log["newValue"]["amount"] == 500.0
    assert payment_log["newValue"]["method"] == "CASH"
    assert payment_log["newValue"]["amountDue"] == 0

    close_log = logs(client, token, action="ORDER_CLOSED")[0]
    assert close_log["newValue"]["amountPaid"] == 500.0


def test_voiding_a_payment_records_before_and_after(client, priced_order):
    token = priced_order["admin"]
    order_id = priced_order["order"]["_id"]
    summary = client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "UPI", "amount": 500},
        headers=auth_header(token),
    ).json()

    client.post(
        f"/api/payments/{summary['payments'][0]['_id']}/void",
        json={"reason": "Bank reversed it"},
        headers=auth_header(token),
    )

    entry = logs(client, token, action="PAYMENT_VOIDED")[0]
    assert entry["oldValue"]["isVoided"] is False
    assert entry["oldValue"]["amount"] == 500.0
    assert entry["newValue"]["isVoided"] is True
    assert entry["note"] == "Bank reversed it"


def test_cancelling_an_order_records_the_reason(client, priced_order):
    token = priced_order["admin"]
    client.post(
        f"/api/orders/{priced_order['order']['_id']}/cancel",
        json={"reason": "OUT_OF_STOCK", "note": "Kitchen ran out"},
        headers=auth_header(token),
    )

    entry = logs(client, token, action="ORDER_CANCELLED")[0]
    assert entry["newValue"]["reason"] == "OUT_OF_STOCK"
    assert entry["note"] == "Kitchen ran out"
    assert entry["oldValue"]["grandTotal"] == 500.0


def test_price_change_is_logged_with_both_values(client, priced_order):
    token = priced_order["admin"]
    client.patch(
        f"/api/products/{priced_order['product']['_id']}",
        json={"price": 650},
        headers=auth_header(token),
    )

    entry = logs(client, token, action="PRODUCT_PRICE_CHANGED")[0]
    assert entry["oldValue"]["price"] == 500.0
    assert entry["newValue"]["price"] == 650.0
    assert entry["entityLabel"] == "Thali"


def test_a_price_edit_that_changes_nothing_writes_no_log(client, priced_order):
    token = priced_order["admin"]
    client.patch(
        f"/api/products/{priced_order['product']['_id']}",
        json={"name": "Special Thali"},
        headers=auth_header(token),
    )
    assert logs(client, token, action="PRODUCT_PRICE_CHANGED") == []


def test_tip_added_and_voided_are_distinct_actions(client, priced_order):
    token = priced_order["admin"]
    summary = client.post(
        f"/api/orders/{priced_order['order']['_id']}/tips",
        json={"amount": 100, "method": "CASH"},
        headers=auth_header(token),
    ).json()
    client.post(
        f"/api/tips/{summary['tips'][0]['_id']}/void",
        json={"reason": "Recorded twice"},
        headers=auth_header(token),
    )

    assert len(logs(client, token, action="TIP_ADDED")) == 1
    assert len(logs(client, token, action="TIP_VOIDED")) == 1


def test_user_management_is_logged(client):
    token = admin_token(client)
    created = client.post(
        "/api/users",
        json={
            "name": "Ravi",
            "email": "ravi@myhotel.com",
            "password": "Passw0rd!",
            "role": "WAITER",
        },
        headers=auth_header(token),
    ).json()
    client.post(
        f"/api/users/{created['_id']}/reset-password",
        json={"newPassword": "Newpass@1"},
        headers=auth_header(token),
    )
    client.delete(f"/api/users/{created['_id']}", headers=auth_header(token))

    assert len(logs(client, token, action="USER_CREATED")) == 1
    assert len(logs(client, token, action="USER_PASSWORD_RESET")) == 1
    assert len(logs(client, token, action="USER_DISABLED")) == 1


def test_audit_log_is_admin_only(client, priced_order):
    waiter = staff_token(client, "WAITER", "ravi@myhotel.com", "Ravi")
    assert client.get("/api/audit-logs", headers=auth_header(waiter)).status_code == 403


def test_audit_log_has_no_write_endpoints(client, priced_order):
    """Append-only: there is no way to alter or remove a row through the API."""
    token = priced_order["admin"]
    entry = logs(client, token)[0]

    assert client.delete(f"/api/audit-logs/{entry['_id']}", headers=auth_header(token)).status_code in (
        404,
        405,
    )
    assert client.post("/api/audit-logs", json={}, headers=auth_header(token)).status_code in (
        404,
        405,
    )


def test_audit_log_filters_by_entity(client, priced_order):
    token = priced_order["admin"]
    order_id = priced_order["order"]["_id"]
    client.post(
        f"/api/orders/{order_id}/payments",
        json={"method": "CASH", "amount": 500},
        headers=auth_header(token),
    )

    assert len(logs(client, token, entityType="payment")) == 1
    assert len(logs(client, token, entityType="order")) >= 1


# --- login rate limiting ------------------------------------------------


def test_repeated_bad_passwords_are_throttled(client):
    client.post(
        "/api/auth/register",
        json={
            "name": "Ravi",
            "email": "ravi@myhotel.com",
            "password": "Passw0rd!",
            "role": "WAITER",
        },
    )

    attempt = {"email": "ravi@myhotel.com", "password": "wrong"}
    for _ in range(8):
        assert client.post("/api/auth/login", json=attempt).status_code == 401

    blocked = client.post("/api/auth/login", json=attempt)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert "Too many failed" in blocked.json()["detail"]

    # The lockout holds even once the right password is offered.
    locked_out = client.post(
        "/api/auth/login", json={"email": "ravi@myhotel.com", "password": "Passw0rd!"}
    )
    assert locked_out.status_code == 429


def test_a_correct_password_clears_the_counter(client):
    """A user who mistypes twice and then gets it right is never locked out."""
    client.post(
        "/api/auth/register",
        json={
            "name": "Ravi",
            "email": "ravi@myhotel.com",
            "password": "Passw0rd!",
            "role": "WAITER",
        },
    )

    for _ in range(3):
        client.post("/api/auth/login", json={"email": "ravi@myhotel.com", "password": "nope"})

    good = client.post(
        "/api/auth/login", json={"email": "ravi@myhotel.com", "password": "Passw0rd!"}
    )
    assert good.status_code == 200

    for _ in range(6):
        assert (
            client.post(
                "/api/auth/login", json={"email": "ravi@myhotel.com", "password": "nope"}
            ).status_code
            == 401
        )


def test_one_account_lockout_does_not_block_another(client):
    for email in ("ravi@myhotel.com", "priya@myhotel.com"):
        client.post(
            "/api/auth/register",
            json={"name": "Staff", "email": email, "password": "Passw0rd!", "role": "WAITER"},
        )

    for _ in range(9):
        client.post("/api/auth/login", json={"email": "ravi@myhotel.com", "password": "nope"})

    # Every till in a restaurant shares one address, so a colleague being locked
    # out must never stop the rest of the floor signing in.
    other = client.post(
        "/api/auth/login", json={"email": "priya@myhotel.com", "password": "Passw0rd!"}
    )
    assert other.status_code == 200


# --- headers ------------------------------------------------------------


def test_security_headers_are_present(client):
    response = client.get("/api/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Cache-Control"] == "no-store"


def test_error_responses_carry_the_headers_too(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.headers["X-Content-Type-Options"] == "nosniff"


# --- permanently removing a staff account -------------------------------


def test_a_never_used_account_can_be_deleted(client):
    """A mistyped account with no history is safe to remove outright."""
    token = admin_token(client)
    created = client.post(
        "/api/users",
        json={
            "name": "Typo",
            "email": "typo@myhotel.com",
            "password": "Passw0rd!",
            "role": "WAITER",
        },
        headers=auth_header(token),
    ).json()

    removed = client.delete(
        f"/api/users/{created['_id']}?permanent=true", headers=auth_header(token)
    )
    assert removed.status_code == 200

    listed = client.get("/api/users?search=typo", headers=auth_header(token)).json()
    assert listed["total"] == 0


def test_a_waiter_with_orders_cannot_be_deleted(client, priced_order):
    """Deleting them would orphan the order and the money on it."""
    token = priced_order["admin"]
    waiter = staff_token(client, "WAITER", "ravi@myhotel.com", "Ravi")
    waiter_id = client.get("/api/auth/me", headers=auth_header(waiter)).json()["_id"]

    table = client.post(
        "/api/tables", json={"tableNumber": "12"}, headers=auth_header(token)
    ).json()
    client.post("/api/orders", json={"tableId": table["_id"]}, headers=auth_header(waiter))

    blocked = client.delete(f"/api/users/{waiter_id}?permanent=true", headers=auth_header(token))
    assert blocked.status_code == 409
    assert "trading history" in blocked.json()["detail"]
    assert "1 orders" in blocked.json()["detail"]

    # Disabling is always available as the safe alternative.
    assert client.delete(f"/api/users/{waiter_id}", headers=auth_header(token)).status_code == 200


def test_an_admin_cannot_delete_themselves(client):
    token = admin_token(client)
    admin_id = client.get("/api/auth/me", headers=auth_header(token)).json()["_id"]

    response = client.delete(f"/api/users/{admin_id}?permanent=true", headers=auth_header(token))
    assert response.status_code == 400
