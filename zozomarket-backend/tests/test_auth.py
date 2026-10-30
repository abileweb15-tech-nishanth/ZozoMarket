async def test_signup_login_and_profile(anon_client):
    created = await anon_client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Priya Raman",
            "email": "Priya@Example.com",
            "password": "correct-horse",
            "workspaceName": "Priya Studio",
            "website": "https://priya.example",
            "timezone": "Asia/Kolkata",
            "mailingAddress": "12 Studio Lane, Chennai",
            "fromName": "Priya Studio",
            "fromEmail": "Hello@Priya.example",
            "replyTo": "reply@priya.example",
        },
    )
    assert created.status_code == 201, created.text
    session = created.json()["data"]
    assert session["tokenType"] == "bearer"
    assert session["user"]["email"] == "priya@example.com"
    assert session["user"]["workspaceName"] == "Priya Studio"
    headers = {"Authorization": f"Bearer {session['accessToken']}"}
    workspace = await anon_client.get("/api/v1/workspace", headers=headers)
    assert workspace.status_code == 200, workspace.text
    saved = workspace.json()["data"]
    assert saved["website"] == "https://priya.example"
    assert saved["timezone"] == "Asia/Kolkata"
    assert saved["mailingAddress"] == "12 Studio Lane, Chennai"
    assert saved["fromName"] == "Priya Studio"
    assert saved["fromEmail"] == "hello@priya.example"
    assert saved["replyTo"] == "reply@priya.example"

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
        json={
            "name": "Other",
            "email": "priya@example.com",
            "password": "correct-horse",
            "workspaceName": "Other",
            "mailingAddress": "1 Market Street",
            "fromName": "Other",
            "fromEmail": "other@example.com",
        },
    )
    assert again.status_code == 409

    missing = await anon_client.post(
        "/api/v1/auth/signup",
        json={"name": "No Address", "email": "no-address@example.com", "password": "correct-horse"},
    )
    assert missing.status_code == 422


async def test_workspaces_do_not_share_contacts(anon_client):
    first = await anon_client.post(
        "/api/v1/auth/signup",
        json={
            "name": "One",
            "email": "one@example.com",
            "password": "password123",
            "workspaceName": "One",
            "mailingAddress": "1 Market Street",
            "fromName": "One",
            "fromEmail": "one-from@example.com",
        },
    )
    second = await anon_client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Two",
            "email": "two@example.com",
            "password": "password123",
            "workspaceName": "Two",
            "mailingAddress": "2 Market Street",
            "fromName": "Two",
            "fromEmail": "two-from@example.com",
        },
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


async def test_delete_account_removes_the_user_and_workspace(anon_client):
    created = await anon_client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Leaver",
            "email": "leave@example.com",
            "password": "correct-horse",
            "workspaceName": "Leave Studio",
            "mailingAddress": "9 Exit Road",
            "fromName": "Leave Studio",
            "fromEmail": "leave@example.com",
        },
    )
    assert created.status_code == 201, created.text
    token = created.json()["data"]["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}
    contact = await anon_client.post(
        "/api/v1/contacts",
        headers=headers,
        json={"email": "gone@example.com", "name": "Gone"},
    )
    assert contact.status_code == 201, contact.text

    refused = await anon_client.request(
        "DELETE",
        "/api/v1/auth/me",
        headers=headers,
        json={"password": "wrong-password"},
    )
    assert refused.status_code == 401, refused.text
    still_here = await anon_client.get("/api/v1/auth/me", headers=headers)
    assert still_here.status_code == 200

    deleted = await anon_client.request(
        "DELETE",
        "/api/v1/auth/me",
        headers=headers,
        json={"password": "correct-horse"},
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["success"] is True

    gone = await anon_client.get("/api/v1/auth/me", headers=headers)
    assert gone.status_code == 401
    login = await anon_client.post(
        "/api/v1/auth/login", json={"email": "leave@example.com", "password": "correct-horse"}
    )
    assert login.status_code == 401
    again = await anon_client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Leaver",
            "email": "leave@example.com",
            "password": "correct-horse",
            "workspaceName": "Leave Studio",
            "mailingAddress": "9 Exit Road",
            "fromName": "Leave Studio",
            "fromEmail": "leave@example.com",
        },
    )
    assert again.status_code == 201, again.text


async def test_signup_disabled(anon_client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "SIGNUP_ENABLED", False)
    res = await anon_client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Blocked User",
            "email": "blocked@example.com",
            "password": "correct-horse",
            "workspaceName": "Blocked Studio",
            "mailingAddress": "1 Road",
            "fromName": "Blocked",
            "fromEmail": "blocked@example.com",
        },
    )
    assert res.status_code == 403
    assert "Account registration is temporarily disabled" in res.json()["error"]

