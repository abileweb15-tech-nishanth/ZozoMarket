from tests.conftest import make_contact

BASE = "/api/v1/segments"


async def test_segment_lifecycle_and_counts(client):
    # Create test contacts with different tags and statuses
    await make_contact(client, "alice@example.com", name="Alice", tags=["VIP", "Newsletter"], status="Subscribed")
    await make_contact(client, "bob@example.com", name="Bob", tags=["Newsletter"], status="Subscribed")
    await make_contact(client, "carol@example.com", name="Carol", tags=["VIP"], status="Unsubscribed")

    # Preview count for VIP + Subscribed
    prev = await client.post(f"{BASE}/preview", json={"tags": ["VIP"], "status": "Subscribed"})
    assert prev.status_code == 200
    assert prev.json()["data"]["count"] == 1

    # Preview count for any Newsletter
    prev_nl = await client.post(f"{BASE}/preview", json={"tags": ["Newsletter"]})
    assert prev_nl.status_code == 200
    assert prev_nl.json()["data"]["count"] == 2

    # Create segment "VIP Active"
    created = await client.post(
        BASE,
        json={
            "name": "VIP Active",
            "description": "Subscribed VIP contacts",
            "tags": ["VIP"],
            "status": "Subscribed",
            "match_type": "any",
        },
    )
    assert created.status_code == 201
    seg_data = created.json()["data"]
    assert seg_data["name"] == "VIP Active"
    assert seg_data["contactCount"] == 1
    seg_id = seg_data["id"]

    # Prevent duplicate segment name
    dup = await client.post(BASE, json={"name": "VIP Active"})
    assert dup.status_code == 409

    # List segments
    segments_list = (await client.get(BASE)).json()["data"]
    assert len(segments_list) == 1
    assert segments_list[0]["id"] == seg_id
    assert segments_list[0]["contactCount"] == 1

    # List contacts in segment
    contacts_in_seg = (await client.get(f"{BASE}/{seg_id}/contacts")).json()
    assert contacts_in_seg["total"] == 1
    assert contacts_in_seg["data"][0]["name"] == "Alice"

    # Update segment
    updated = await client.patch(
        f"{BASE}/{seg_id}",
        json={"name": "All Newsletter", "tags": ["Newsletter"], "status": None},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["name"] == "All Newsletter"
    assert updated.json()["data"]["contactCount"] == 2

    # Delete segment
    deleted = await client.delete(f"{BASE}/{seg_id}")
    assert deleted.status_code == 200
    assert (await client.get(f"{BASE}/{seg_id}")).status_code == 404
