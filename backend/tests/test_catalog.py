"""Phase 2: categories, products and tables."""

ADMIN_LOGIN = {"email": "admin@myhotel.com", "password": "Admin@123"}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def admin_token(client) -> str:
    return client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]


def waiter_token(client) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Ravi Kumar",
            "email": "ravi@myhotel.com",
            "password": "Waiter@123",
            "role": "WAITER",
        },
    )
    return response.json()["accessToken"]


def make_category(client, token: str, name: str = "Main Course") -> dict:
    response = client.post(
        "/api/categories",
        json={"name": name, "displayOrder": 1},
        headers=auth_header(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


def make_product(client, token: str, category_id: str, **overrides) -> dict:
    payload = {
        "name": "Chicken Biriyani",
        "price": 180,
        "gstPercentage": 5,
        "quantityAvailable": 20,
        "categoryId": category_id,
        "foodType": "NON_VEG",
        "mealType": "LUNCH",
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=auth_header(token))
    assert response.status_code == 201, response.text
    return response.json()


# --- categories ---------------------------------------------------------


def test_admin_creates_and_lists_categories(client):
    token = admin_token(client)
    make_category(client, token, "Starters")
    make_category(client, token, "Beverages")

    response = client.get("/api/categories", headers=auth_header(token))
    assert response.status_code == 200
    assert {c["name"] for c in response.json()} == {"Starters", "Beverages"}


def test_duplicate_category_name_is_rejected(client):
    token = admin_token(client)
    make_category(client, token, "Snacks")
    response = client.post("/api/categories", json={"name": "Snacks"}, headers=auth_header(token))
    assert response.status_code == 409


def test_waiter_can_read_but_not_write_categories(client):
    token = admin_token(client)
    make_category(client, token)
    staff = waiter_token(client)

    assert client.get("/api/categories", headers=auth_header(staff)).status_code == 200
    blocked = client.post("/api/categories", json={"name": "Nope"}, headers=auth_header(staff))
    assert blocked.status_code == 403


def test_category_reports_its_product_count(client):
    token = admin_token(client)
    category = make_category(client, token)
    make_product(client, token, category["_id"])
    make_product(client, token, category["_id"], name="Mutton Biriyani")

    listed = client.get("/api/categories", headers=auth_header(token)).json()
    assert listed[0]["productCount"] == 2


def test_category_with_products_cannot_be_deleted(client):
    token = admin_token(client)
    category = make_category(client, token)
    make_product(client, token, category["_id"])

    blocked = client.delete("/api/categories/" + category["_id"], headers=auth_header(token))
    assert blocked.status_code == 409
    assert "product" in blocked.json()["detail"].lower()


def test_empty_category_can_be_deleted(client):
    token = admin_token(client)
    category = make_category(client, token)

    deleted = client.delete("/api/categories/" + category["_id"], headers=auth_header(token))
    assert deleted.status_code == 200
    assert client.get("/api/categories", headers=auth_header(token)).json() == []


# --- products -----------------------------------------------------------


def test_product_carries_its_category_name(client):
    token = admin_token(client)
    category = make_category(client, token, "Biriyani")
    product = make_product(client, token, category["_id"])

    assert product["categoryName"] == "Biriyani"
    assert product["price"] == 180
    assert product["gstPercentage"] == 5


def test_product_requires_a_real_category(client):
    token = admin_token(client)
    response = client.post(
        "/api/products",
        json={"name": "Ghost", "price": 10, "categoryId": "6a97230000000000000000aa"},
        headers=auth_header(token),
    )
    assert response.status_code == 400


def test_products_can_be_searched_and_filtered(client):
    token = admin_token(client)
    category = make_category(client, token)
    make_product(client, token, category["_id"], name="Chicken Biriyani", foodType="NON_VEG")
    make_product(client, token, category["_id"], name="Paneer Butter Masala", foodType="VEG")

    by_search = client.get("/api/products?search=paneer", headers=auth_header(token)).json()
    assert by_search["total"] == 1

    by_type = client.get("/api/products?foodType=VEG", headers=auth_header(token)).json()
    assert by_type["total"] == 1
    assert by_type["items"][0]["name"] == "Paneer Butter Masala"

    by_category = client.get(
        "/api/products?categoryId=" + category["_id"], headers=auth_header(token)
    ).json()
    assert by_category["total"] == 2


def test_product_availability_can_be_toggled(client):
    token = admin_token(client)
    category = make_category(client, token)
    product = make_product(client, token, category["_id"])

    response = client.patch(
        "/api/products/" + product["_id"],
        json={"isAvailable": False},
        headers=auth_header(token),
    )
    assert response.status_code == 200
    assert response.json()["isAvailable"] is False

    available = client.get("/api/products?isAvailable=true", headers=auth_header(token)).json()
    assert available["total"] == 0


def test_changing_a_product_price_does_not_touch_its_identity(client):
    token = admin_token(client)
    category = make_category(client, token)
    product = make_product(client, token, category["_id"])

    updated = client.patch(
        "/api/products/" + product["_id"], json={"price": 220}, headers=auth_header(token)
    ).json()

    assert updated["price"] == 220
    assert updated["_id"] == product["_id"]
    assert updated["name"] == product["name"]


def test_negative_price_is_rejected(client):
    token = admin_token(client)
    category = make_category(client, token)
    response = client.post(
        "/api/products",
        json={"name": "Free lunch", "price": -5, "categoryId": category["_id"]},
        headers=auth_header(token),
    )
    assert response.status_code == 422


def test_waiter_cannot_create_products(client):
    token = admin_token(client)
    category = make_category(client, token)
    staff = waiter_token(client)

    response = client.post(
        "/api/products",
        json={"name": "Nope", "price": 10, "categoryId": category["_id"]},
        headers=auth_header(staff),
    )
    assert response.status_code == 403


# --- tables -------------------------------------------------------------


def test_tables_are_created_free(client):
    token = admin_token(client)
    response = client.post(
        "/api/tables", json={"tableNumber": "1", "capacity": 4}, headers=auth_header(token)
    )
    assert response.status_code == 201, response.text

    body = response.json()
    assert body["status"] == "FREE"
    assert body["activeOrderId"] is None


def test_duplicate_table_number_is_rejected(client):
    token = admin_token(client)
    client.post("/api/tables", json={"tableNumber": "5"}, headers=auth_header(token))
    again = client.post("/api/tables", json={"tableNumber": "5"}, headers=auth_header(token))
    assert again.status_code == 409


def test_tables_sort_numerically_not_lexicographically(client):
    token = admin_token(client)
    for number in ["10", "2", "1"]:
        client.post("/api/tables", json={"tableNumber": number}, headers=auth_header(token))

    listed = client.get("/api/tables", headers=auth_header(token)).json()
    assert [t["tableNumber"] for t in listed] == ["1", "2", "10"]


def test_occupied_table_cannot_be_deleted(client, fake_db):
    token = admin_token(client)
    created = client.post(
        "/api/tables", json={"tableNumber": "7"}, headers=auth_header(token)
    ).json()

    # Stand in for phase 3 seating a party at this table.
    fake_db.tables.documents[0]["status"] = "OCCUPIED"

    blocked = client.delete("/api/tables/" + created["_id"], headers=auth_header(token))
    assert blocked.status_code == 409


def test_occupied_table_cannot_be_deactivated(client, fake_db):
    token = admin_token(client)
    created = client.post(
        "/api/tables", json={"tableNumber": "8"}, headers=auth_header(token)
    ).json()
    fake_db.tables.documents[0]["status"] = "OCCUPIED"

    blocked = client.patch(
        "/api/tables/" + created["_id"], json={"isActive": False}, headers=auth_header(token)
    )
    assert blocked.status_code == 409


def test_tables_can_be_filtered_by_status(client, fake_db):
    token = admin_token(client)
    for number in ["1", "2"]:
        client.post("/api/tables", json={"tableNumber": number}, headers=auth_header(token))
    fake_db.tables.documents[0]["status"] = "OCCUPIED"

    free = client.get("/api/tables?status=FREE", headers=auth_header(token)).json()
    occupied = client.get("/api/tables?status=OCCUPIED", headers=auth_header(token)).json()

    assert len(free) == 1
    assert len(occupied) == 1
    assert occupied[0]["tableNumber"] == "1"


def test_waiter_can_read_tables(client):
    token = admin_token(client)
    client.post("/api/tables", json={"tableNumber": "3"}, headers=auth_header(token))
    staff = waiter_token(client)

    assert client.get("/api/tables", headers=auth_header(staff)).status_code == 200
