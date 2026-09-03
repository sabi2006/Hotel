"""Phase 1 smoke tests: registration, login, JWT, and role-based access."""

ADMIN_LOGIN = {"email": "admin@myhotel.com", "password": "Admin@123"}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def register(client, **overrides):
    payload = {
        "name": "Ravi Kumar",
        "email": "ravi@myhotel.com",
        "phone": "9876543210",
        "password": "Waiter@123",
        "role": "WAITER",
    }
    payload.update(overrides)
    return client.post("/api/auth/register", json=payload)


def test_bootstrap_admin_can_log_in(client):
    response = client.post("/api/auth/login", json=ADMIN_LOGIN)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["role"] == "ADMIN"
    assert body["accessToken"]
    assert "passwordHash" not in body["user"]


def test_register_then_login_as_waiter(client):
    assert register(client).status_code == 201
    response = client.post(
        "/api/auth/login", json={"email": "ravi@myhotel.com", "password": "Waiter@123"}
    )
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "WAITER"


def test_duplicate_email_is_rejected(client):
    assert register(client).status_code == 201
    assert register(client).status_code == 409


def test_email_is_case_insensitive(client):
    register(client)
    response = client.post(
        "/api/auth/login", json={"email": "RAVI@MyHotel.Com", "password": "Waiter@123"}
    )
    assert response.status_code == 200


def test_admin_cannot_self_register(client):
    response = register(client, email="hacker@myhotel.com", role="ADMIN")
    assert response.status_code == 403


def test_wrong_password_is_rejected(client):
    register(client)
    response = client.post(
        "/api/auth/login", json={"email": "ravi@myhotel.com", "password": "wrong"}
    )
    assert response.status_code == 401


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth_header("garbage")).status_code == 401


def test_me_returns_the_current_user(client):
    token = register(client).json()["accessToken"]
    response = client.get("/api/auth/me", headers=auth_header(token))
    assert response.status_code == 200
    assert response.json()["email"] == "ravi@myhotel.com"


def test_waiter_cannot_reach_admin_endpoints(client):
    token = register(client).json()["accessToken"]
    response = client.get("/api/users", headers=auth_header(token))
    assert response.status_code == 403


def test_admin_can_list_and_filter_users(client):
    register(client)
    admin_token = client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]

    response = client.get("/api/users", headers=auth_header(admin_token))
    assert response.status_code == 200
    assert response.json()["total"] == 2

    filtered = client.get("/api/users?role=WAITER", headers=auth_header(admin_token))
    assert filtered.json()["total"] == 1

    searched = client.get("/api/users?search=ravi", headers=auth_header(admin_token))
    assert searched.json()["total"] == 1


def test_disabled_user_cannot_log_in_or_use_a_token(client):
    waiter_token = register(client).json()["accessToken"]
    admin_token = client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]
    waiter_id = client.get("/api/auth/me", headers=auth_header(waiter_token)).json()["_id"]

    assert client.delete(f"/api/users/{waiter_id}", headers=auth_header(admin_token)).status_code == 200

    login = client.post(
        "/api/auth/login", json={"email": "ravi@myhotel.com", "password": "Waiter@123"}
    )
    assert login.status_code == 403
    # An already-issued token must stop working too.
    assert client.get("/api/auth/me", headers=auth_header(waiter_token)).status_code == 403


def test_admin_cannot_disable_themselves(client):
    admin_token = client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]
    admin_id = client.get("/api/auth/me", headers=auth_header(admin_token)).json()["_id"]
    response = client.delete(f"/api/users/{admin_id}", headers=auth_header(admin_token))
    assert response.status_code == 400


def test_change_password(client):
    token = register(client).json()["accessToken"]
    bad = client.post(
        "/api/auth/change-password",
        json={"currentPassword": "nope", "newPassword": "NewPass@1"},
        headers=auth_header(token),
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/auth/change-password",
        json={"currentPassword": "Waiter@123", "newPassword": "NewPass@1"},
        headers=auth_header(token),
    )
    assert ok.status_code == 200
    assert client.post(
        "/api/auth/login", json={"email": "ravi@myhotel.com", "password": "NewPass@1"}
    ).status_code == 200


def test_admin_can_create_kitchen_staff(client):
    admin_token = client.post("/api/auth/login", json=ADMIN_LOGIN).json()["accessToken"]
    response = client.post(
        "/api/users",
        json={
            "name": "Kitchen One",
            "email": "kitchen@myhotel.com",
            "phone": "9000000000",
            "password": "Kitchen@123",
            "role": "KITCHEN",
        },
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    assert response.json()["role"] == "KITCHEN"
