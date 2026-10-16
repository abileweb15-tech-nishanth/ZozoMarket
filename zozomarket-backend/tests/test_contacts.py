from tests.conftest import make_contact

BASE = "/api/v1/contacts"


async def test_contact_crud_and_duplicate_email(client):
    created = await make_contact(
        client, "Priya@Example.com", name="Priya Raman", tags=["VIP", " vip ", "VIP"]
    )
    assert created["email"] == "priya@example.com"
    assert created["tags"] == ["VIP", "vip"]
    assert created["status"] == "Subscribed"
    assert "added" in created

    dup = await client.post(BASE, json={"email": "PRIYA@example.com"})
    assert dup.status_code == 409

    patched = await client.patch(
        f"{BASE}/{created['id']}", json={"name": "Priya R", "tags": ["Customer"]}
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["tags"] == ["Customer"]

    assert (await client.delete(f"{BASE}/{created['id']}")).json() == {"success": True}
    assert (await client.get(f"{BASE}/{created['id']}")).status_code == 404


async def test_list_filters_and_pagination(client):
    await make_contact(client, "a@example.com", name="Alice", tags=["VIP"])
    await make_contact(client, "b@example.com", name="Bob", tags=["Customer"])
    await make_contact(client, "c@example.com", name="Carol", status="Unsubscribed")

    resp = await client.get(BASE, params={"tag": "VIP"})
    body = resp.json()
    assert body["total"] == 1 and body["data"][0]["name"] == "Alice"

    assert (await client.get(BASE, params={"status": "Unsubscribed"})).json()["total"] == 1
    assert (await client.get(BASE, params={"q": "bo"})).json()["data"][0]["name"] == "Bob"
    # LIKE wildcards in the search term are treated literally.
    assert (await client.get(BASE, params={"q": "%"})).json()["total"] == 0

    page = (await client.get(BASE, params={"pageSize": 2, "page": 2, "sort": "name"})).json()
    assert page["pages"] == 2 and page["pageSize"] == 2
    assert [c["name"] for c in page["data"]] == ["Carol"]

    stats = (await client.get(f"{BASE}/stats")).json()["data"]
    assert stats == {"total": 3, "subscribed": 2, "unsubscribed": 1, "pending": 0}


async def test_bulk_operations(client):
    ids = [(await make_contact(client, f"u{i}@example.com"))["id"] for i in range(3)]

    tagged = await client.post(f"{BASE}/bulk-tag", json={"ids": ids[:2], "tag": "Workshop"})
    assert tagged.json()["data"]["affected"] == 2
    again = await client.post(f"{BASE}/bulk-tag", json={"ids": ids, "tag": "Workshop"})
    assert again.json()["data"]["affected"] == 1  # only the untagged one

    tags = (await client.get(f"{BASE}/tags")).json()["data"]
    assert {"name": "Workshop", "count": 3} in tags

    untag = await client.post(f"{BASE}/bulk-untag", json={"ids": ids[:1], "tag": "Workshop"})
    assert untag.json()["data"]["affected"] == 1

    status = await client.post(f"{BASE}/bulk-status", json={"ids": ids[:1], "status": "Pending"})
    assert status.json()["data"]["affected"] == 1

    deleted = await client.post(f"{BASE}/bulk-delete", json={"ids": ids[:2]})
    assert deleted.json()["data"]["affected"] == 2
    assert (await client.get(BASE)).json()["total"] == 1


async def test_csv_import_and_export(client):
    await make_contact(client, "optout@example.com", status="Unsubscribed")
    csv_body = (
        "Email,Name,Tags,Status\n"
        "new@example.com,New Person,VIP;Local,subscribed\n"
        "NEW@example.com,Dup,,\n"
        "bad-email,Oops,,\n"
        "optout@example.com,Opt Out,,Subscribed\n"
        'evil@example.com,=HYPERLINK("x"),,\n'
    )
    resp = await client.post(
        f"{BASE}/import",
        files={"file": ("contacts.csv", csv_body.encode(), "text/csv")},
        data={"tags": "Imported"},
    )
    assert resp.status_code == 200, resp.text
    result = resp.json()["data"]
    assert result["created"] == 2 and result["updated"] == 1 and result["skipped"] == 1
    assert len(result["errors"]) == 1 and result["errors"][0]["line"] == 4

    optout = (await client.get(BASE, params={"q": "optout"})).json()["data"][0]
    assert optout["status"] == "Unsubscribed"  # imports never resubscribe
    new = (await client.get(BASE, params={"q": "new@"})).json()["data"][0]
    assert set(new["tags"]) == {"VIP", "Local", "Imported"}

    export = await client.get(f"{BASE}/export")
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    lines = export.text.strip().splitlines()
    assert lines[0] == "email,name,tags,status,source,added"
    assert len(lines) == 4
    assert any("'=HYPERLINK" in line for line in lines)  # formula injection neutralised


async def test_import_rejects_csv_without_email_column(client):
    resp = await client.post(
        f"{BASE}/import", files={"file": ("c.csv", b"name\nBob\n", "text/csv")}
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "invalid_csv"
