import time

from app.core import security
from app.services.template_service import render_blocks, render_merge_tags


async def test_health(anon_client):
    resp = await anon_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert (await anon_client.get("/health/ready")).json() == {"status": "ready"}


async def test_management_api_requires_key(anon_client):
    resp = await anon_client.get("/api/v1/contacts")
    assert resp.status_code == 401
    body = resp.json()
    assert body == {"success": False, "error": "Missing API key", "code": "unauthorized"}

    bad = await anon_client.get("/api/v1/contacts", headers={"X-API-Key": "nope"})
    assert bad.status_code == 401

    ok = await anon_client.get("/api/v1/contacts", headers={"Authorization": "Bearer test-key"})
    assert ok.status_code == 200
    assert "X-Request-ID" in ok.headers


async def test_validation_error_envelope(client):
    resp = await client.post("/api/v1/contacts", json={"email": "not-an-email", "bogus": 1})
    assert resp.status_code == 422
    body = resp.json()
    assert body["success"] is False and body["code"] == "validation_error"
    locs = {tuple(d["loc"]) for d in body["details"]}
    assert ("body", "email") in locs and ("body", "bogus") in locs


async def test_not_found_envelope(client):
    resp = await client.get("/api/v1/campaigns/missing")
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


def test_signed_tokens_roundtrip_and_tamper():
    token = security.sign_token("open", {"m": "abc"})
    assert security.verify_token("open", token) == {"m": "abc"}
    assert security.verify_token("click", token) is None  # wrong purpose
    raw, sig = token.split(".")
    assert security.verify_token("open", f"{raw}x.{sig}") is None
    assert security.verify_token("open", "garbage") is None
    expired = security.sign_token("open", {"m": "abc"}, ttl_seconds=-1)
    time.sleep(0.01)
    assert security.verify_token("open", expired) is None


def test_password_hashing():
    hashed = security.hash_password("s3cret!")
    assert hashed.startswith("scrypt$")
    assert security.verify_password("s3cret!", hashed)
    assert not security.verify_password("wrong", hashed)
    assert not security.verify_password("x", "not-a-hash")


def test_block_rendering_escapes_user_content():
    html = render_blocks(
        [
            {"type": "paragraph", "text": "<script>alert(1)</script>"},
            {"type": "button", "text": "Go", "link": "javascript:alert(1)"},
            {"type": "heading", "text": "Hi", "color": "red;background:url(x)"},
        ]
    )
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "javascript:" not in html
    assert "url(x)" not in html


def test_merge_tags_escape_values():
    out = render_merge_tags("Hi {{ first_name }}!{{unknown}}", {"first_name": "<b>Al</b>"})
    assert out == "Hi &lt;b&gt;Al&lt;/b&gt;!"
