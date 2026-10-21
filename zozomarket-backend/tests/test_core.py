import asyncio
import time

import pytest

from app.core import security
from app.core.config import settings
from app.core.exceptions import ExternalServiceError
from app.services.email_service import OutboundEmail, SMTPSender, SmtpSettings, get_sender
from app.services.template_service import render_blocks, render_merge_tags


async def test_health(anon_client):
    resp = await anon_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert (await anon_client.get("/health/ready")).json() == {"status": "ready"}


async def test_management_api_requires_jwt(anon_client):
    resp = await anon_client.get("/api/v1/contacts")
    assert resp.status_code == 401
    body = resp.json()
    assert body == {"success": False, "error": "Missing access token", "code": "unauthorized"}

    bad = await anon_client.get("/api/v1/contacts", headers={"Authorization": "Bearer nope"})
    assert bad.status_code == 401
    assert bad.json()["error"] == "Access token is invalid or expired"


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


def test_render_blocks_honors_image_width_and_text_style():
    html = render_blocks(
        [
            {
                "type": "image",
                "image": "https://example.com/a.png",
                "width": 240,
                "align": "center",
            },
            {"type": "heading", "text": "Hello", "size": 32, "color": "#112233"},
        ]
    )
    assert 'width="240"' in html
    assert "font-size:32px" in html
    assert "color:#112233" in html
    full = render_blocks([{"type": "image", "image": "https://example.com/a.png"}])
    assert 'width="600"' in full


def test_render_blocks_adds_unsubscribe_when_missing():
    html = render_blocks([{"type": "paragraph", "text": "Hello"}])
    assert "{{unsubscribe_url}}" in html
    kept = render_blocks([{"type": "footer", "text": "See {{unsubscribe_url}}"}])
    assert kept.count("{{unsubscribe_url}}") == 1


def test_mailtrap_message_includes_template_html(monkeypatch):
    captured: dict[str, object] = {}

    class FakeClient:
        def __init__(self, token: str) -> None:
            captured["token"] = token

        def send(self, mail: object) -> dict[str, object]:
            captured["mail"] = mail
            return {"success": True, "message_ids": ["msg-1"]}

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "mailtrap")
    monkeypatch.setattr(settings, "MAILTRAP_API_TOKEN", "test-token")
    monkeypatch.setattr("mailtrap.MailtrapClient", FakeClient)
    get_sender.cache_clear()
    try:
        sender = get_sender()
        html = "<p>The fall menu is ready.</p>"
        result = asyncio.run(
            sender.send(
                OutboundEmail(to="nishanth5554@gmail.com", subject="[Test] Autumn note", html=html)
            )
        )
        mail = captured["mail"]
        assert mail.html == html
        assert mail.subject == "[Test] Autumn note"
        assert mail.to[0].email == "nishanth5554@gmail.com"
        assert captured["token"] == "test-token"
        assert result.provider_message_id == "msg-1"
    finally:
        get_sender.cache_clear()


def test_mailtrap_requires_token_before_send(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "mailtrap")
    monkeypatch.setattr(settings, "MAILTRAP_API_TOKEN", None)

    def refuse(*_args, **_kwargs):
        raise AssertionError("Mailtrap API was called")

    monkeypatch.setattr("mailtrap.MailtrapClient", refuse)
    get_sender.cache_clear()
    try:
        with pytest.raises(ExternalServiceError, match="MAILTRAP_API_TOKEN"):
            get_sender()
    finally:
        get_sender.cache_clear()


def test_mailtrap_port_465_uses_implicit_tls(monkeypatch):
    opened: dict[str, int] = {}

    class FakeSmtp:
        def __init__(self, host, port, timeout=30, context=None):
            opened["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def login(self, username, password):
            opened["login"] = 1

        def send_message(self, message):
            opened["html"] = "fall menu" in message.as_string()

    def refuse_plain(*_args, **_kwargs):
        raise AssertionError("plain SMTP was used")

    monkeypatch.setattr("smtplib.SMTP_SSL", FakeSmtp)
    monkeypatch.setattr("smtplib.SMTP", refuse_plain)
    sender = SMTPSender(
        SmtpSettings("sandbox.smtp.mailtrap.io", 465, "inbox", "secret", True),
        name="mailtrap",
        require_login=True,
    )
    message = OutboundEmail(
        to="mira@example.com", subject="[Test] Hi", html="<p>fall menu</p>"
    )
    result = asyncio.run(sender.send(message))
    assert opened == {"port": 465, "login": 1, "html": True}
    assert result.provider_message_id


def test_merge_tags_escape_values():
    out = render_merge_tags("Hi {{ first_name }}!{{unknown}}", {"first_name": "<b>Al</b>"})
    assert out == "Hi &lt;b&gt;Al&lt;/b&gt;!"
