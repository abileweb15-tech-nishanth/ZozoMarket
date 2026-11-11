import httpx
import pytest
from pydantic import ValidationError

from app.core import security
from app.core.config import _DEFAULT_SECRET, Settings, settings
from app.core.ratelimit import limiter
from app.main import create_app


async def test_docs_disabled_and_hsts_enabled_in_production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    prod_app = create_app()
    transport = httpx.ASGITransport(app=prod_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        for path in ("/docs", "/redoc", "/redocs", "/api/v1/openapi.json"):
            res = await client.get(path)
            assert res.status_code == 404, f"Expected 404 for {path}, got {res.status_code}"

        health = await client.get("/health")
        assert health.status_code == 200
        assert health.headers["x-frame-options"] == "DENY"
        assert health.headers["x-content-type-options"] == "nosniff"
        assert health.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        assert health.headers["content-security-policy"] == "default-src 'none'"
        assert health.headers["permissions-policy"] == "geolocation=(), microphone=(), camera=()"
        assert health.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


async def test_docs_available_in_non_production(anon_client):
    for path in ("/docs", "/redoc", "/api/v1/openapi.json"):
        res = await anon_client.get(path)
        assert res.status_code == 200, f"Expected 200 for {path} in test env"
    docs = await anon_client.get("/docs")
    assert docs.headers.get("content-security-policy") != "default-src 'none'"


async def test_security_headers_preserve_public_html_features(client, anon_client):
    created = await client.post(
        "/api/v1/forms",
        json={"name": "Embed Test", "title": "Embed", "kind": "Landing Pages", "fields": []},
    )
    form = created.json()["data"]
    await client.patch(f"/api/v1/forms/{form['id']}", json={"status": "Live"})

    page = await anon_client.get(f"/api/v1/public/pages/{form['slug']}")
    assert page.status_code == 200
    assert "x-frame-options" not in page.headers
    assert "script-src 'unsafe-inline'" in page.headers["content-security-policy"]
    assert "connect-src 'self'" in page.headers["content-security-policy"]

    token = security.sign_token("unsubscribe", {"c": "contact-1"})
    unsub = await anon_client.get(f"/api/v1/t/u/{token}")
    assert unsub.status_code == 200
    assert unsub.headers["x-frame-options"] == "DENY"
    assert "script-src 'unsafe-inline'" in unsub.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in unsub.headers["content-security-policy"]


def test_production_config_guards():
    valid = Settings(
        _env_file=None,
        ENVIRONMENT="production",
        SECRET_KEY="x" * 40,
        WEBHOOK_SECRET="whsec_live_secret_value",
        PUBLIC_BASE_URL="https://api.zozomarket.zozothemes.com",
        FRONTEND_URL="https://zozomarket.zozothemes.com",
        SEED_DEMO_DATA=False,
        AUTO_CREATE_TABLES=False,
    )
    assert valid.ACCESS_TOKEN_MINUTES == 15
    assert valid.REFRESH_TOKEN_DAYS == 7

    base = dict(
        _env_file=None,
        ENVIRONMENT="production",
        SECRET_KEY="x" * 40,
        WEBHOOK_SECRET="whsec_live_secret_value",
        PUBLIC_BASE_URL="https://api.zozomarket.zozothemes.com",
        SEED_DEMO_DATA=False,
        AUTO_CREATE_TABLES=False,
    )

    with pytest.raises(ValidationError, match="SECRET_KEY must be set"):
        Settings(**{**base, "SECRET_KEY": _DEFAULT_SECRET})

    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(**{**base, "SECRET_KEY": "too-short-secret"})

    with pytest.raises(ValidationError, match="WEBHOOK_SECRET must be set"):
        Settings(**{**base, "WEBHOOK_SECRET": None})

    with pytest.raises(ValidationError, match="WEBHOOK_SECRET must be set"):
        Settings(**{**base, "WEBHOOK_SECRET": "   "})

    with pytest.raises(ValidationError, match="PUBLIC_BASE_URL"):
        Settings(**{**base, "PUBLIC_BASE_URL": "http://localhost:8000"})


def test_webhook_fails_closed_in_production_without_secret(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", None)
    assert security.verify_webhook_signature(b"{}", None) is False
    assert security.verify_webhook_signature(b"{}", "sha256=deadbeef") is False


async def test_auth_login_rate_limiting(anon_client, monkeypatch):
    limiter.reset()
    monkeypatch.setattr(limiter, "enabled", True)
    try:
        for i in range(10):
            res = await anon_client.post(
                "/api/v1/auth/login",
                json={"email": f"nobody{i}@example.com", "password": "wrong-password"},
            )
            assert res.status_code == 401

        blocked = await anon_client.post(
            "/api/v1/auth/login",
            json={"email": "nobody10@example.com", "password": "wrong-password"},
        )
        assert blocked.status_code == 429
        assert blocked.json()["success"] is False
        assert blocked.json()["code"] == "rate_limited"
        assert int(blocked.headers["retry-after"]) >= 1
    finally:
        limiter.reset()


async def test_cors_allows_only_expected_headers(anon_client):
    preflight = await anon_client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )
    assert preflight.status_code == 200
    allowed = {
        h.strip().lower()
        for h in preflight.headers.get("access-control-allow-headers", "").split(",")
        if h.strip()
    }
    assert "*" not in allowed
    assert {"authorization", "content-type", "x-request-id", "x-api-key"}.issubset(allowed)

    disallowed = await anon_client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Custom-Arbitrary-Header",
        },
    )
    assert disallowed.status_code == 400
