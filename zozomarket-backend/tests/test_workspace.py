PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def test_workspace_starts_empty_and_saves(client):
    loaded = await client.get("/api/v1/workspace")
    assert loaded.status_code == 200, loaded.text
    data = loaded.json()["data"]
    assert data["name"] == "Test Workspace"
    assert data["ownerEmail"] == "test@example.com"
    assert data["website"] is None
    assert data["logoUrl"] is None
    assert data["trackOpens"] is True

    saved = await client.patch(
        "/api/v1/workspace",
        json={
            "name": "North Studio",
            "website": "https://north.example",
            "timezone": "Asia/Kolkata",
            "mailingAddress": "12 Market St",
            "fromEmail": "hello@north.example",
            "trackClicks": False,
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()["data"]
    assert body["name"] == "North Studio"
    assert body["timezone"] == "Asia/Kolkata"
    assert body["trackClicks"] is False

    again = await client.get("/api/v1/workspace")
    assert again.json()["data"]["mailingAddress"] == "12 Market St"


async def test_logo_is_stored_as_a_file(client):
    uploaded = await client.post(
        "/api/v1/workspace/logo", files={"file": ("logo.png", PNG, "image/png")}
    )
    assert uploaded.status_code == 200, uploaded.text
    url = uploaded.json()["data"]["logoUrl"]
    assert "/media/" in url
    fetched = await client.get(url)
    assert fetched.status_code == 200
    assert fetched.content.startswith(b"\x89PNG")
