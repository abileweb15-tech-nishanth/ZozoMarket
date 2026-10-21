async def test_signup_login_and_profile(anon_client):
    created = await anon_client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Priya Raman",
            "email": "Priya@Example.com",
            "password": "correct-horse",
            "workspaceName": "Priya Studio",
        },
    )
    assert created.status_code == 201, created.text
    session = created.json()["data"]
    assert session["tokenType"] == "bearer"
    assert session["user"]["email"] == "priya@example.com"
    assert session["user"]["workspaceName"] == "Priya Studio"

    me = await anon_client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {session['accessToken']}"}
    )
    assert me.status_code == 200
    assert me.json()["data"]["name"] == "Priya Raman"

    updated = await anon_client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {session['accessToken']}"},
        json={"name": "Priya R.", "workspaceName": "Studio"},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["workspaceName"] == "Studio"

    logged_in = await anon_client.post(
        "/api/v1/auth/login", json={"email": "priya@example.com", "password": "correct-horse"}
    )
    assert logged_in.status_code == 200
    assert logged_in.json()["data"]["user"]["name"] == "Priya R."

    wrong = await anon_client.post(
        "/api/v1/auth/login", json={"email": "priya@example.com", "password": "nope-nope"}
    )
    assert wrong.status_code == 401

    again = await anon_client.post(
        "/api/v1/auth/signup",
        json={"name": "Other", "email": "priya@example.com", "password": "correct-horse"},
    )
    assert again.status_code == 409


async def test_workspaces_do_not_share_contacts(anon_client):
    first = await anon_client.post(
        "/api/v1/auth/signup",
        json={"name": "One", "email": "one@example.com", "password": "password123"},
    )
    second = await anon_client.post(
        "/api/v1/auth/signup",
        json={"name": "Two", "email": "two@example.com", "password": "password123"},
    )
    token_a = first.json()["data"]["accessToken"]
    token_b = second.json()["data"]["accessToken"]
    created = await anon_client.post(
        "/api/v1/contacts",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"email": "reader@example.com", "name": "Reader"},
    )
    assert created.status_code == 201, created.text
    contact_id = created.json()["data"]["id"]

    own = await anon_client.get(
        "/api/v1/contacts", headers={"Authorization": f"Bearer {token_a}"}
    )
    other = await anon_client.get(
        "/api/v1/contacts", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert [c["id"] for c in own.json()["data"]] == [contact_id]
    assert other.json()["data"] == []

    hidden = await anon_client.get(
        f"/api/v1/contacts/{contact_id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert hidden.status_code == 404
