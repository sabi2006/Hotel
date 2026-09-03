"""Phase 4: the kitchen board, item-level transitions, and live events."""

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
def kitchen(client) -> str:
    return staff_token(client, "KITCHEN", "cook@myhotel.com")


@pytest.fixture()
def scenario(client):
    """An order with two lines already sitting with the kitchen."""
    token = admin_token(client)
    category = client.post(
        "/api/categories", json={"name": "Mains"}, headers=auth_header(token)
    ).json()
    table = client.post(
        "/api/tables", json={"tableNumber": "5"}, headers=auth_header(token)
    ).json()
    biriyani = client.post(
        "/api/products",
        json={"name": "Biriyani", "price": 180, "gstPercentage": 5, "categoryId": category["_id"]},
        headers=auth_header(token),
    ).json()
    lime = client.post(
        "/api/products",
        json={"name": "Lime", "price": 60, "gstPercentage": 12, "categoryId": category["_id"]},
        headers=auth_header(token),
    ).json()

    order = client.post(
        "/api/orders", json={"tableId": table["_id"]}, headers=auth_header(token)
    ).json()
    for product in (biriyani, lime):
        client.post(
            f"/api/orders/{order['_id']}/items",
            json={"productId": product["_id"], "quantity": 1},
            headers=auth_header(token),
        )
    order = client.post(
        f"/api/orders/{order['_id']}/send-kitchen", headers=auth_header(token)
    ).json()

    return {"admin": token, "order": order, "table": table, "biriyani": biriyani, "lime": lime}


# --- the board ----------------------------------------------------------


def test_new_order_lands_in_the_new_column(client, scenario, kitchen):
    board = client.get("/api/kitchen/orders", headers=auth_header(kitchen)).json()
    assert len(board["new"]) == 1
    assert board["new"][0]["_id"] == scenario["order"]["_id"]
    assert board["preparing"] == []
    assert board["ready"] == []


def test_draft_orders_never_reach_the_kitchen(client, scenario, kitchen):
    """An order the waiter has not sent must stay invisible to the kitchen."""
    token = scenario["admin"]
    second = client.post(
        "/api/tables", json={"tableNumber": "6"}, headers=auth_header(token)
    ).json()
    draft = client.post(
        "/api/orders", json={"tableId": second["_id"]}, headers=auth_header(token)
    ).json()
    client.post(
        f"/api/orders/{draft['_id']}/items",
        json={"productId": scenario["biriyani"]["_id"], "quantity": 1},
        headers=auth_header(token),
    )

    board = client.get("/api/kitchen/orders", headers=auth_header(kitchen)).json()
    ids = [order["_id"] for column in board.values() for order in column]
    assert draft["_id"] not in ids


def test_waiter_cannot_open_the_kitchen_board(client, scenario):
    waiter = staff_token(client, "WAITER", "ravi@myhotel.com")
    assert client.get("/api/kitchen/orders", headers=auth_header(waiter)).status_code == 403


# --- accepting and finishing -------------------------------------------


def test_accept_moves_every_waiting_item_to_preparing(client, scenario, kitchen):
    order_id = scenario["order"]["_id"]
    accepted = client.post(
        f"/api/kitchen/orders/{order_id}/accept", headers=auth_header(kitchen)
    ).json()

    assert accepted["orderStatus"] == "PREPARING"
    assert accepted["acceptedAt"] is not None
    assert accepted["acceptedByName"] == "Kitchen"
    assert all(item["kitchenStatus"] == "PREPARING" for item in accepted["items"])
    assert all(item["preparingAt"] is not None for item in accepted["items"])

    board = client.get("/api/kitchen/orders", headers=auth_header(kitchen)).json()
    assert len(board["preparing"]) == 1
    assert board["new"] == []


def test_accepting_twice_is_refused(client, scenario, kitchen):
    order_id = scenario["order"]["_id"]
    client.post(f"/api/kitchen/orders/{order_id}/accept", headers=auth_header(kitchen))
    again = client.post(f"/api/kitchen/orders/{order_id}/accept", headers=auth_header(kitchen))
    assert again.status_code == 409


def test_ready_finishes_the_ticket_and_records_timing(client, scenario, kitchen):
    order_id = scenario["order"]["_id"]
    client.post(f"/api/kitchen/orders/{order_id}/accept", headers=auth_header(kitchen))
    ready = client.post(
        f"/api/kitchen/orders/{order_id}/ready", headers=auth_header(kitchen)
    ).json()

    assert ready["orderStatus"] == "READY"
    assert ready["readyAt"] is not None
    assert all(item["kitchenStatus"] == "READY" for item in ready["items"])
    assert all(item["readyAt"] is not None for item in ready["items"])

    board = client.get("/api/kitchen/orders", headers=auth_header(kitchen)).json()
    assert len(board["ready"]) == 1


def test_one_order_can_hold_items_at_different_stages(client, scenario, kitchen):
    """The whole point of per-item kitchen status."""
    order_id = scenario["order"]["_id"]
    order = scenario["order"]
    first, second = order["items"][0]["itemId"], order["items"][1]["itemId"]

    client.patch(
        f"/api/kitchen/orders/{order_id}/items/{first}",
        json={"kitchenStatus": "READY"},
        headers=auth_header(kitchen),
    )
    mixed = client.patch(
        f"/api/kitchen/orders/{order_id}/items/{second}",
        json={"kitchenStatus": "PREPARING"},
        headers=auth_header(kitchen),
    ).json()

    statuses = {item["name"]: item["kitchenStatus"] for item in mixed["items"]}
    assert statuses == {"Biriyani": "READY", "Lime": "PREPARING"}
    # The slowest item decides the order status.
    assert mixed["orderStatus"] == "PREPARING"

    board = client.get("/api/kitchen/orders", headers=auth_header(kitchen)).json()
    assert len(board["preparing"]) == 1


def test_kitchen_cannot_mark_an_item_served(client, scenario, kitchen):
    """Serving is the waiter confirming the food reached the table."""
    order = scenario["order"]
    response = client.patch(
        f"/api/kitchen/orders/{order['_id']}/items/{order['items'][0]['itemId']}",
        json={"kitchenStatus": "SERVED"},
        headers=auth_header(kitchen),
    )
    assert response.status_code == 403


def test_kitchen_cannot_touch_an_unsent_item(client, scenario, kitchen):
    token = scenario["admin"]
    order_id = scenario["order"]["_id"]
    with_addon = client.post(
        f"/api/orders/{order_id}/items",
        json={"productId": scenario["lime"]["_id"], "quantity": 1},
        headers=auth_header(token),
    ).json()
    unsent = next(item for item in with_addon["items"] if item["sentToKitchenAt"] is None)

    response = client.patch(
        f"/api/kitchen/orders/{order_id}/items/{unsent['itemId']}",
        json={"kitchenStatus": "PREPARING"},
        headers=auth_header(kitchen),
    )
    assert response.status_code == 409


# --- cancelling a line --------------------------------------------------


def test_kitchen_cancels_an_item_and_the_bill_drops(client, scenario, kitchen):
    order = scenario["order"]
    before = order["grandTotal"]

    cancelled = client.post(
        f"/api/kitchen/orders/{order['_id']}/items/{order['items'][1]['itemId']}/cancel",
        json={"reason": "OUT_OF_STOCK"},
        headers=auth_header(kitchen),
    ).json()

    line = next(i for i in cancelled["items"] if i["name"] == "Lime")
    assert line["kitchenStatus"] == "CANCELLED"
    assert line["cancellationReason"] == "OUT_OF_STOCK"
    # 189.00 for the biriyani alone, down from 256.20.
    assert cancelled["grandTotal"] == 189.0
    assert cancelled["grandTotal"] < before


def test_kitchen_cannot_write_off_food_already_cooked(client, scenario, kitchen):
    order_id = scenario["order"]["_id"]
    client.post(f"/api/kitchen/orders/{order_id}/accept", headers=auth_header(kitchen))
    ready = client.post(
        f"/api/kitchen/orders/{order_id}/ready", headers=auth_header(kitchen)
    ).json()

    refused = client.post(
        f"/api/kitchen/orders/{order_id}/items/{ready['items'][0]['itemId']}/cancel",
        json={"reason": "OTHER"},
        headers=auth_header(kitchen),
    )
    assert refused.status_code == 403

    # An admin still can - by then it is a money decision.
    allowed = client.post(
        f"/api/kitchen/orders/{order_id}/items/{ready['items'][0]['itemId']}/cancel",
        json={"reason": "OTHER"},
        headers=auth_header(scenario["admin"]),
    )
    assert allowed.status_code == 200


# --- the full round trip ------------------------------------------------


def test_kitchen_to_waiter_round_trip(client, scenario, kitchen):
    token = scenario["admin"]
    order_id = scenario["order"]["_id"]

    client.post(f"/api/kitchen/orders/{order_id}/accept", headers=auth_header(kitchen))
    client.post(f"/api/kitchen/orders/{order_id}/ready", headers=auth_header(kitchen))

    served = client.post(f"/api/orders/{order_id}/serve", headers=auth_header(token)).json()
    assert served["orderStatus"] == "SERVED"
    assert served["servedAt"] is not None

    board = client.get("/api/kitchen/orders", headers=auth_header(kitchen)).json()
    assert len(board["completed"]) == 1
    assert board["ready"] == []


# --- live events --------------------------------------------------------


def test_websocket_rejects_a_bad_token(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws?token=rubbish") as socket:
            socket.receive_json()


def test_websocket_puts_each_role_in_its_own_rooms(client, kitchen):
    with client.websocket_connect(f"/ws?token={kitchen}") as socket:
        hello = socket.receive_json()
        assert hello["event"] == "connected"
        assert hello["payload"]["rooms"] == ["kitchen"]

    waiter = staff_token(client, "WAITER", "ravi2@myhotel.com")
    with client.websocket_connect(f"/ws?token={waiter}") as socket:
        assert socket.receive_json()["payload"]["rooms"] == ["waiters"]


def test_sending_to_the_kitchen_pushes_a_live_event(client, scenario, kitchen):
    """The event the kitchen display listens for."""
    token = scenario["admin"]
    order_id = scenario["order"]["_id"]

    with client.websocket_connect(f"/ws?token={kitchen}") as socket:
        assert socket.receive_json()["event"] == "connected"

        client.post(
            f"/api/orders/{order_id}/items",
            json={"productId": scenario["lime"]["_id"], "quantity": 1},
            headers=auth_header(token),
        )
        client.post(f"/api/orders/{order_id}/send-kitchen", headers=auth_header(token))

        message = socket.receive_json()
        assert message["event"] == "order:new"
        assert message["payload"]["orderId"] == order_id
        assert message["payload"]["tableNumber"] == "5"


def test_marking_ready_rings_the_waiter(client, scenario, kitchen):
    waiter = staff_token(client, "WAITER", "ravi3@myhotel.com")
    order_id = scenario["order"]["_id"]

    with client.websocket_connect(f"/ws?token={waiter}") as socket:
        assert socket.receive_json()["event"] == "connected"

        client.post(f"/api/kitchen/orders/{order_id}/accept", headers=auth_header(kitchen))
        assert socket.receive_json()["event"] == "order:updated"

        client.post(f"/api/kitchen/orders/{order_id}/ready", headers=auth_header(kitchen))
        ring = socket.receive_json()
        assert ring["event"] == "order:ready"
        assert ring["payload"]["tableNumber"] == "5"
