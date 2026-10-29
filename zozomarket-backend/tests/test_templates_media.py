from pathlib import Path

from app.core.config import settings

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def test_template_crud_render_and_preview(client):
    created = await client.post(
        "/api/v1/templates",
        json={
            "name": "Monthly Roundup",
            "category": "Newsletter",
            "subject": "News for {{first_name}}",
            "preheader": "Top stories",
            "design": [
                {"type": "heading", "text": "Hi {{first_name}}"},
                {"type": "columns", "text": "Left|Right"},
            ],
        },
    )
    assert created.status_code == 201
    tpl = created.json()["data"]
    assert "Left" in tpl["html"] and "Right" in tpl["html"]

    preview = await client.post(
        f"/api/v1/templates/{tpl['id']}/preview", json={"variables": {"first_name": "Zoe"}}
    )
    data = preview.json()["data"]
    assert "Hi Zoe" in data["html"] and "Top stories" in data["html"]
    assert "Hi Zoe" in data["text"]

    raw = await client.get(f"/api/v1/templates/{tpl['id']}/preview.html")
    assert raw.headers["content-type"].startswith("text/html")
    assert "sandbox" in raw.headers["content-security-policy"]

    dup = (await client.post(f"/api/v1/templates/{tpl['id']}/duplicate")).json()["data"]
    assert dup["name"] == "Monthly Roundup (copy)"

    cats = (await client.get("/api/v1/templates/categories")).json()["data"]
    assert cats == [{"name": "Newsletter", "count": 2}]

    upd = await client.patch(
        f"/api/v1/templates/{tpl['id']}", json={"design": [{"type": "paragraph", "text": "New"}]}
    )
    assert "New" in upd.json()["data"]["html"] and "Left" not in upd.json()["data"]["html"]

    listed = await client.get("/api/v1/templates", params={"category": "Newsletter"})
    assert listed.json()["total"] == 2
    assert (await client.delete(f"/api/v1/templates/{tpl['id']}")).status_code == 200


async def test_html_template_stays_html_on_a_new_campaign(client):
    custom = "<html><body><h1>Code template</h1></body></html>"
    created = await client.post(
        "/api/v1/templates",
        json={"name": "Code note", "html": custom, "design": []},
    )
    assert created.status_code == 201, created.text
    tpl = created.json()["data"]
    assert tpl["design"] == []
    assert "Code template" in tpl["html"]

    campaign = await client.post(
        "/api/v1/campaigns",
        json={"name": "From code", "templateId": tpl["id"], "html": custom, "design": []},
    )
    assert campaign.status_code == 201, campaign.text
    body = campaign.json()["data"]
    assert body["design"] == []
    assert "Code template" in body["html"]


async def test_updated_html_is_what_the_preview_shows(client):
    created = await client.post(
        "/api/v1/templates",
        json={
            "name": "Studio note",
            "design": [{"type": "heading", "text": "Original heading"}],
        },
    )
    assert created.status_code == 201, created.text
    tpl = created.json()["data"]
    assert "Original heading" in tpl["html"]

    edited = "<html><body><h1>Edited heading</h1></body></html>"
    patched = await client.patch(
        f"/api/v1/templates/{tpl['id']}",
        json={"html": edited, "design": []},
    )
    assert patched.status_code == 200, patched.text
    saved = patched.json()["data"]
    assert saved["design"] == []
    assert "Edited heading" in saved["html"]
    assert "Original heading" not in saved["html"]

    raw = await client.get(f"/api/v1/templates/{tpl['id']}/preview.html")
    assert raw.status_code == 200
    assert "Edited heading" in raw.text
    assert "Original heading" not in raw.text

    renamed = await client.patch(f"/api/v1/templates/{tpl['id']}", json={"name": "Studio note revised"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["data"]["name"] == "Studio note revised"
    assert "Edited heading" in renamed.json()["data"]["html"]
    again = await client.get(f"/api/v1/templates/{tpl['id']}/preview.html")
    assert "Edited heading" in again.text
    assert "Original heading" not in again.text


async def test_render_endpoint_validates_blocks(client):
    bad = await client.post("/api/v1/templates/render", json={"design": [{"type": "iframe"}]})
    assert bad.status_code == 422
    ok = await client.post(
        "/api/v1/templates/render", json={"design": [{"type": "spacer", "padding": 40}]}
    )
    assert "height:40px" in ok.json()["data"]["html"]


async def test_media_upload_rename_delete(client):
    resp = await client.post(
        "/api/v1/media", files=[("files", ("../../hero image.PNG", PNG, "image/png"))]
    )
    assert resp.status_code == 201, resp.text
    asset = resp.json()["data"][0]
    assert asset["name"] == "hero image.PNG"  # path traversal stripped
    assert asset["type"] == "Image" and asset["size"] == "72 B"
    assert asset["src"].startswith("http://testserver/media/")

    stored = Path(settings.MEDIA_ROOT) / asset["src"].split("/media/", 1)[1]
    assert stored.read_bytes() == PNG

    served = await client.get(asset["src"].removeprefix("http://testserver"))
    assert served.status_code == 200 and served.content == PNG

    renamed = await client.patch(f"/api/v1/media/{asset['id']}", json={"name": "banner"})
    assert renamed.json()["data"]["name"] == "banner.PNG"

    usage = (await client.get("/api/v1/media/usage")).json()["data"]
    assert usage["totalAssets"] == 1 and usage["byType"] == {"Image": 1}

    assert (await client.delete(f"/api/v1/media/{asset['id']}")).status_code == 200
    assert not stored.exists()


async def test_media_rejects_bad_files(client):
    svg = await client.post(
        "/api/v1/media", files=[("files", ("x.svg", b"<svg onload=alert(1)>", "image/svg+xml"))]
    )
    assert svg.status_code == 400 and svg.json()["code"] == "unsupported_media_type"

    spoofed = await client.post(
        "/api/v1/media", files=[("files", ("x.png", b"<html>not a png", "image/png"))]
    )
    assert spoofed.status_code == 400

    big = await client.post(
        "/api/v1/media", files=[("files", ("big.png", PNG + b"\x00" * (1024 * 1024), "image/png"))]
    )
    assert big.status_code == 413
    assert (await client.get("/api/v1/media")).json()["total"] == 0
    leftovers = [p for p in Path(settings.MEDIA_ROOT).rglob("*") if p.is_file()]
    assert leftovers == []
