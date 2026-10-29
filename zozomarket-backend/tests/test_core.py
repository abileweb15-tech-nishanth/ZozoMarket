import asyncio
import datetime as dt
import time

import pytest

from app.core import security
from app.core.config import settings
from app.services.email_service import EmailDeliveryError, OutboundEmail, get_sender
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


def _ses_settings(monkeypatch, **overrides: object) -> None:
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "ses")
    monkeypatch.setattr(settings, "AWS_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr(settings, "AWS_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setattr(settings, "AWS_REGION", "us-east-1")
    monkeypatch.setattr(settings, "SES_FROM_EMAIL", "sender@example.com")
    monkeypatch.setattr(settings, "SES_CONFIGURATION_SET", "tracking-set")
    monkeypatch.setattr(settings, "EMAIL_FROM_NAME", "ZozoMarket")
    for name, value in overrides.items():
        monkeypatch.setattr(settings, name, value)


def test_ses_send_forwards_html_and_configuration_set(monkeypatch):
    captured: dict[str, object] = {}

    class FakeClient:
        def send_email(self, **kwargs: object) -> dict[str, str]:
            captured["kwargs"] = kwargs
            return {"MessageId": "ses-1"}

    _ses_settings(monkeypatch)
    monkeypatch.setattr("boto3.client", lambda *_args, **_kwargs: FakeClient())
    get_sender.cache_clear()
    try:
        html = "<p>The fall menu is ready.</p>"
        result = asyncio.run(
            get_sender().send(
                OutboundEmail(
                    to="reader@example.com",
                    subject="[Test] Autumn note",
                    html=html,
                    from_email="other@example.com",
                    from_name="North Studio",
                    reply_to="reply@example.com",
                    headers={"List-Unsubscribe": "<https://example.com/unsub>"},
                )
            )
        )
        request = captured["kwargs"]
        simple = request["Content"]["Simple"]
        assert simple["Body"]["Html"]["Data"] == html
        assert simple["Subject"]["Data"] == "[Test] Autumn note"
        assert request["Destination"]["ToAddresses"] == ["reader@example.com"]
        assert request["FromEmailAddress"] == "North Studio <sender@example.com>"
        assert request["ReplyToAddresses"] == ["reply@example.com"]
        assert request["ConfigurationSetName"] == "tracking-set"
        assert request["EmailTags"] == [{"Name": "campaign", "Value": "zozomarket"}]
        assert simple["Headers"] == [
            {"Name": "List-Unsubscribe", "Value": "<https://example.com/unsub>"}
        ]
        assert result.provider_message_id == "ses-1"
    finally:
        get_sender.cache_clear()


def test_ses_message_rejected_is_permanent(monkeypatch):
    from botocore.exceptions import ClientError

    class FakeClient:
        def send_email(self, **_kwargs: object) -> dict[str, str]:
            raise ClientError(
                {"Error": {"Code": "MessageRejected", "Message": "Email address is not verified."}},
                "SendEmail",
            )

    _ses_settings(monkeypatch)
    monkeypatch.setattr("boto3.client", lambda *_args, **_kwargs: FakeClient())
    get_sender.cache_clear()
    try:
        with pytest.raises(EmailDeliveryError, match="MessageRejected") as caught:
            asyncio.run(
                get_sender().send(
                    OutboundEmail(to="reader@example.com", subject="Hi", html="<p>Hi</p>")
                )
            )
        assert caught.value.permanent is True
    finally:
        get_sender.cache_clear()


def test_ses_requires_credentials_before_calling_ses(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("SES was called")

    _ses_settings(monkeypatch, AWS_ACCESS_KEY_ID="", AWS_SECRET_ACCESS_KEY=None)
    monkeypatch.setattr("boto3.client", refuse)
    get_sender.cache_clear()
    try:
        with pytest.raises(EmailDeliveryError, match="AWS_ACCESS_KEY_ID"):
            asyncio.run(
                get_sender().send(
                    OutboundEmail(to="reader@example.com", subject="Hi", html="<p>Hi</p>")
                )
            )
    finally:
        get_sender.cache_clear()


def test_ses_daily_counts_read_cloudwatch(monkeypatch):
    from app.services import ses_stats

    ses_stats._CACHE.clear()
    seen: list[str] = []

    class FakeCloudWatch:
        def get_metric_statistics(self, **kwargs: object) -> dict[str, object]:
            seen.append(str(kwargs["MetricName"]))
            assert kwargs["Namespace"] == "AWS/SES"
            assert kwargs["Dimensions"] == [{"Name": "campaign", "Value": "zozomarket"}]
            if kwargs["MetricName"] == "Delivery":
                return {
                    "Datapoints": [
                        {"Timestamp": dt.datetime(2026, 10, 26, tzinfo=dt.UTC), "Sum": 3}
                    ]
                }
            if kwargs["MetricName"] == "Send":
                return {
                    "Datapoints": [
                        {"Timestamp": dt.datetime(2026, 10, 26, tzinfo=dt.UTC), "Sum": 4}
                    ]
                }
            return {"Datapoints": []}

    monkeypatch.setattr(settings, "AWS_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr(settings, "AWS_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setattr(settings, "AWS_REGION", "us-east-1")
    monkeypatch.setattr(settings, "SES_CLOUDWATCH_DIMENSION_NAME", "campaign")
    monkeypatch.setattr(settings, "SES_CLOUDWATCH_DIMENSION_VALUE", "zozomarket")
    monkeypatch.setattr("boto3.client", lambda *_args, **_kwargs: FakeCloudWatch())
    day = dt.date(2026, 10, 26)
    try:
        result = asyncio.run(ses_stats.daily_counts(day, day))
    finally:
        ses_stats._CACHE.clear()
    assert result is not None
    assert result[day]["delivered"] == 3
    assert result[day]["sent"] == 4
    assert result[day]["opens"] == 0
    assert set(seen) == {"Send", "Delivery", "Open", "Click", "Bounce"}


def test_merge_tags_escape_values():
    out = render_merge_tags("Hi {{ first_name }}!{{unknown}}", {"first_name": "<b>Al</b>"})
    assert out == "Hi &lt;b&gt;Al&lt;/b&gt;!"
