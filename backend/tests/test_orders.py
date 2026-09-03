"""Phase 3: order taking, the cart, and the table lifecycle."""

ADMIN_LOGIN = {"email": "admin@myhotel.com", "password": "Admin@123"}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def admin_token(client) -> str:
    return client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]


def waiter_token(client, email: str = "ravi@myhotel.com") -> str:
    client.post(
        "/api/auth/register",
        json={"name": "Ravi", "email": email, "password": "Waiter@123", "role": "WAITER"},
    )
    return client.post(
        "/api/auth/login", json={"email": email, "password": "Waiter@123"}
    ).json()["accessToken"]


def setup_menu(client, token: str) -> dict:
    """One category, one table, and two products with different GST rates."""
    category = client.post(
        "/api/categories", json={"name": "Main Course"}, headers=auth_header(token)
    ).json()
    table = client.post(
        "/api/tables", json={"tableNumber": "5", "capacity": 4}, headers=auth_header(token)
    ).json()

    biriyani = client.post(
        "/api/products",
        json={
            "name": "Chicken Biriyani",
            "price": 180,
            "gstPercentage": 5,
            "categoryId": category["_id"],
            "foodType": "NON_VEG",
        },
        headers=auth_header(token),
    ).json()
    lime = client.post(
        "/api/products",
        json={
            "name": "Fresh Lime",
            "price": 60,
            "gstPercentage": 12,
            "categoryId": category["_id"],
            "foodType": "VEG",
        },
        headers=auth_header(token),
    ).json()

    return {"category": category, "table": table, "biriyani": biriyani, "lime": lime}


def open_order(client, token: str, table_id: str) -> dict:
    response = client.post("/api/orders", json={"tableId": table_id}, headers=auth_header(token))
    assert response.status_code == 201, response.text
    return response.json()


def add_item(client, token: str, order_id: str, product_id: str, quantity: int = 1) -> dict:
    response = client.post(
        f"/api/orders/{order_id}/items",
        json={"productId": product_id, "quantity": quantity},
        headers=auth_header(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


# --- opening an order ---------------------------------------------------


def test_opening_an_order_occupies_the_table(client):
    token = admin_token(client)
    menu = setup_menu(client, token)

    order = open_order(client, token, menu["table"]["_id"])
    assert order["orderStatus"] == "DRAFT"
    assert order["paymentStatus"] == "PENDING"
    assert order["tableNumber"] == "5"

    table = client.get(f"/api/tables/{menu['table']['_id']}", headers=auth_header(token)).json()
    assert table["status"] == "OCCUPIED"
    assert table["activeOrderId"] == order["_id"]


def test_invoice_numbers_are_readable_and_sequential(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    second_table = client.post(
        "/api/tables", json={"tableNumber": "6"}, headers=auth_header(token)
    ).json()

    first = open_order(client, token, menu["table"]["_id"])
    second = open_order(client, token, second_table["_id"])

    assert first["invoiceNumber"].startswith("INV-")
    assert len(first["invoiceNumber"].split("-")[2]) == 6
    assert second["orderNumber"] == first["orderNumber"] + 1
    assert second["invoiceNumber"] != first["invoiceNumber"]


def test_a_table_cannot_hold_two_active_orders(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    open_order(client, token, menu["table"]["_id"])

    again = client.post(
        "/api/orders", json={"tableId": menu["table"]["_id"]}, headers=auth_header(token)
    )
    assert again.status_code == 409
    assert "already has an active order" in again.json()["detail"]


def test_occupied_table_reopens_its_existing_order(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])

    found = client.get(
        f"/api/orders/by-table/{menu['table']['_id']}", headers=auth_header(token)
    )
    assert found.status_code == 200
    assert found.json()["_id"] == order["_id"]


def test_kitchen_staff_cannot_open_orders(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    client.post(
        "/api/auth/register",
        json={
            "name": "Cook",
            "email": "cook@myhotel.com",
            "password": "Cook@1234",
            "role": "KITCHEN",
        },
    )
    kitchen = client.post(
        "/api/auth/login", json={"email": "cook@myhotel.com", "password": "Cook@1234"}
    ).json()["accessToken"]

    response = client.post(
        "/api/orders", json={"tableId": menu["table"]["_id"]}, headers=auth_header(kitchen)
    )
    assert response.status_code == 403


# --- the cart and its maths --------------------------------------------


def test_item_totals_and_gst_are_computed_per_line(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])

    order = add_item(client, token, order["_id"], menu["biriyani"]["_id"], 2)
    item = order["items"][0]
    assert item["subtotal"] == 360.0
    assert item["gstAmount"] == 18.0
    assert item["total"] == 378.0

    order = add_item(client, token, order["_id"], menu["lime"]["_id"], 2)
    # 120 at 12 percent = 14.40
    assert order["subtotal"] == 480.0
    assert order["gstAmount"] == 32.4
    assert order["grandTotal"] == 512.4


def test_adding_the_same_product_bumps_the_quantity(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])

    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)
    order = add_item(client, token, order["_id"], menu["biriyani"]["_id"], 2)

    assert len(order["items"]) == 1
    assert order["items"][0]["quantity"] == 3


def test_quantity_can_be_changed_and_item_removed(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    order = add_item(client, token, order["_id"], menu["biriyani"]["_id"], 3)
    item_id = order["items"][0]["itemId"]

    reduced = client.patch(
        f"/api/orders/{order['_id']}/items/{item_id}",
        json={"quantity": 1},
        headers=auth_header(token),
    ).json()
    assert reduced["items"][0]["quantity"] == 1
    assert reduced["grandTotal"] == 189.0

    emptied = client.patch(
        f"/api/orders/{order['_id']}/items/{item_id}",
        json={"quantity": 0},
        headers=auth_header(token),
    ).json()
    assert emptied["items"] == []
    assert emptied["grandTotal"] == 0
    assert emptied["orderStatus"] == "DRAFT"


def test_unavailable_product_cannot_be_added(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    client.patch(
        f"/api/products/{menu['biriyani']['_id']}",
        json={"isAvailable": False},
        headers=auth_header(token),
    )
    order = open_order(client, token, menu["table"]["_id"])

    response = client.post(
        f"/api/orders/{order['_id']}/items",
        json={"productId": menu["biriyani"]["_id"], "quantity": 1},
        headers=auth_header(token),
    )
    assert response.status_code == 409


def test_order_item_keeps_its_price_when_the_product_is_repriced(client):
    """The rule that protects every historical bill."""
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    order = add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)

    client.patch(
        f"/api/products/{menu['biriyani']['_id']}",
        json={"price": 250, "gstPercentage": 18},
        headers=auth_header(token),
    )

    unchanged = client.get(f"/api/orders/{order['_id']}", headers=auth_header(token)).json()
    assert unchanged["items"][0]["price"] == 180.0
    assert unchanged["items"][0]["gstPercentage"] == 5.0
    assert unchanged["grandTotal"] == 189.0


def test_discount_reduces_the_total_but_never_below_zero(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    order = add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)

    discounted = client.patch(
        f"/api/orders/{order['_id']}", json={"discount": 39}, headers=auth_header(token)
    ).json()
    assert discounted["grandTotal"] == 150.0

    absurd = client.patch(
        f"/api/orders/{order['_id']}", json={"discount": 10000}, headers=auth_header(token)
    ).json()
    assert absurd["grandTotal"] == 0.0


def test_customer_details_are_optional(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    assert order["customer"]["name"] is None
    assert order["customer"]["phone"] is None

    named = client.patch(
        f"/api/orders/{order['_id']}",
        json={"customer": {"name": "Nivesh", "phone": "9876543210"}},
        headers=auth_header(token),
    ).json()
    assert named["customer"]["name"] == "Nivesh"


# --- sending to the kitchen --------------------------------------------


def test_send_to_kitchen_stamps_items_and_moves_the_order(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    order = add_item(client, token, order["_id"], menu["biriyani"]["_id"], 2)

    sent = client.post(
        f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token)
    ).json()

    assert sent["orderStatus"] == "SENT_TO_KITCHEN"
    assert sent["sentToKitchenAt"] is not None
    assert sent["items"][0]["sentToKitchenAt"] is not None
    assert sent["items"][0]["kitchenStatus"] == "PENDING"


def test_sending_twice_with_nothing_new_is_refused(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    again = client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))
    assert again.status_code == 409


def test_add_on_round_sends_only_the_new_items(client):
    """Ordering drinks later must not resend the food."""
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 2)
    first = client.post(
        f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token)
    ).json()
    first_stamp = first["items"][0]["sentToKitchenAt"]

    add_item(client, token, order["_id"], menu["lime"]["_id"], 2)
    second = client.post(
        f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token)
    ).json()

    biriyani = next(i for i in second["items"] if i["name"] == "Chicken Biriyani")
    lime = next(i for i in second["items"] if i["name"] == "Fresh Lime")
    assert biriyani["sentToKitchenAt"] == first_stamp
    assert lime["sentToKitchenAt"] is not None


def test_sent_items_cannot_be_edited_or_removed(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    order = add_item(client, token, order["_id"], menu["biriyani"]["_id"], 2)
    sent = client.post(
        f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token)
    ).json()
    item_id = sent["items"][0]["itemId"]

    edited = client.patch(
        f"/api/orders/{order['_id']}/items/{item_id}",
        json={"quantity": 5},
        headers=auth_header(token),
    )
    assert edited.status_code == 409

    removed = client.delete(
        f"/api/orders/{order['_id']}/items/{item_id}", headers=auth_header(token)
    )
    assert removed.status_code == 409


def test_order_status_follows_the_slowest_item(client, fake_db):
    """One order, three items, three different kitchen states."""
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)
    add_item(client, token, order["_id"], menu["lime"]["_id"], 1)
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    # Re-read each time: saving the order replaces the stored document.
    fake_db.orders.documents[0]["items"][0]["kitchenStatus"] = "PREPARING"
    preparing = client.patch(
        f"/api/orders/{order['_id']}", json={}, headers=auth_header(token)
    ).json()
    assert preparing["orderStatus"] == "PREPARING"

    for item in fake_db.orders.documents[0]["items"]:
        item["kitchenStatus"] = "READY"
    refreshed = client.patch(
        f"/api/orders/{order['_id']}", json={}, headers=auth_header(token)
    ).json()
    assert refreshed["orderStatus"] == "READY"
    assert refreshed["readyAt"] is not None


def test_waiter_serves_ready_items(client, fake_db):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    too_early = client.post(f"/api/orders/{order['_id']}/serve", headers=auth_header(token))
    assert too_early.status_code == 409

    fake_db.orders.documents[0]["items"][0]["kitchenStatus"] = "READY"
    served = client.post(f"/api/orders/{order['_id']}/serve", headers=auth_header(token)).json()

    assert served["orderStatus"] == "SERVED"
    assert served["items"][0]["kitchenStatus"] == "SERVED"
    assert served["servedAt"] is not None


# --- cancelling and discarding -----------------------------------------


def test_cancelling_an_order_frees_the_table_and_records_a_reason(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    cancelled = client.post(
        f"/api/orders/{order['_id']}/cancel",
        json={"reason": "CUSTOMER_CANCELLED", "note": "Left early"},
        headers=auth_header(token),
    ).json()

    assert cancelled["orderStatus"] == "CANCELLED"
    assert cancelled["cancellationReason"] == "CUSTOMER_CANCELLED"
    assert cancelled["grandTotal"] == 0

    table = client.get(f"/api/tables/{menu['table']['_id']}", headers=auth_header(token)).json()
    assert table["status"] == "FREE"
    assert table["activeOrderId"] is None


def test_cancellation_requires_a_reason(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])

    response = client.post(
        f"/api/orders/{order['_id']}/cancel", json={}, headers=auth_header(token)
    )
    assert response.status_code == 422


def test_unsent_draft_can_be_discarded(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])

    discarded = client.delete(f"/api/orders/{order['_id']}", headers=auth_header(token))
    assert discarded.status_code == 200

    table = client.get(f"/api/tables/{menu['table']['_id']}", headers=auth_header(token)).json()
    assert table["status"] == "FREE"


def test_sent_order_cannot_be_discarded(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)
    client.post(f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token))

    response = client.delete(f"/api/orders/{order['_id']}", headers=auth_header(token))
    assert response.status_code == 409


def test_settled_order_is_read_only_for_waiters(client, fake_db):
    """Business rules 1 and 7."""
    token = admin_token(client)
    menu = setup_menu(client, token)
    order = open_order(client, token, menu["table"]["_id"])
    add_item(client, token, order["_id"], menu["biriyani"]["_id"], 1)

    fake_db.orders.documents[0]["orderStatus"] = "CLOSED"
    staff = waiter_token(client)

    blocked = client.post(
        f"/api/orders/{order['_id']}/items",
        json={"productId": menu["lime"]["_id"], "quantity": 1},
        headers=auth_header(staff),
    )
    assert blocked.status_code == 403

    # An admin may still correct it.
    allowed = client.patch(
        f"/api/orders/{order['_id']}", json={"discount": 5}, headers=auth_header(token)
    )
    assert allowed.status_code == 200


# --- listing ------------------------------------------------------------


def test_orders_can_be_filtered(client):
    token = admin_token(client)
    menu = setup_menu(client, token)
    second = client.post(
        "/api/tables", json={"tableNumber": "6"}, headers=auth_header(token)
    ).json()

    first_order = open_order(client, token, menu["table"]["_id"])
    open_order(client, token, second["_id"])
    add_item(client, token, first_order["_id"], menu["biriyani"]["_id"], 1)
    client.post(f"/api/orders/{first_order['_id']}/send-kitchen", headers=auth_header(token))

    everything = client.get("/api/orders", headers=auth_header(token)).json()
    assert everything["total"] == 2

    drafts = client.get("/api/orders?orderStatus=DRAFT", headers=auth_header(token)).json()
    assert drafts["total"] == 1

    open_orders = client.get("/api/orders?openOnly=true", headers=auth_header(token)).json()
    assert open_orders["total"] == 2

    by_table = client.get(
        f"/api/orders?tableId={menu['table']['_id']}", headers=auth_header(token)
    ).json()
    assert by_table["total"] == 1
