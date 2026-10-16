"""API-key auth, signed tokens for public links, and password hashing."""

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from app.core.config import settings
from app.core.exceptions import UnauthorizedError


def _secret() -> bytes:
    return settings.SECRET_KEY.get_secret_value().encode()


# --- API keys -----------------------------------------------------------------


def verify_api_key(presented: str | None) -> None:
    """Raise unless `presented` matches one of the configured API keys (constant time)."""
    if not settings.auth_enabled:
        return
    if not presented:
        raise UnauthorizedError("Missing API key")
    candidate = presented.encode()
    if not any(hmac.compare_digest(candidate, key.encode()) for key in settings.API_KEYS):
        raise UnauthorizedError("Invalid API key")


def generate_api_key() -> str:
    return f"zm_{secrets.token_urlsafe(32)}"


# --- Signed tokens (tracking pixels, click redirects, unsubscribe, double opt-in) ---


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def sign_token(purpose: str, payload: dict[str, Any], ttl_seconds: int | None = None) -> str:
    body: dict[str, Any] = {"p": purpose, "d": payload}
    if ttl_seconds is not None:
        body["exp"] = int(time.time()) + ttl_seconds
    raw = _b64(json.dumps(body, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), raw.encode(), hashlib.sha256).digest()[:16])
    return f"{raw}.{sig}"


def verify_token(purpose: str, token: str) -> dict[str, Any] | None:
    """Return the payload if the token is authentic, unexpired, and for `purpose`."""
    try:
        raw, sig = token.split(".", 1)
        expected = _b64(hmac.new(_secret(), raw.encode(), hashlib.sha256).digest()[:16])
        if not hmac.compare_digest(sig, expected):
            return None
        body = json.loads(_unb64(raw))
    except (ValueError, json.JSONDecodeError):
        return None
    if body.get("p") != purpose:
        return None
    if "exp" in body and body["exp"] < time.time():
        return None
    return body.get("d")


def verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    if settings.WEBHOOK_SECRET is None:
        return not settings.auth_enabled
    if not signature:
        return False
    expected = hmac.new(
        settings.WEBHOOK_SECRET.get_secret_value().encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature.removeprefix("sha256="), expected)


# --- Password hashing (scrypt, stdlib) -----------------------------------------

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = hashed.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    candidate = hashlib.scrypt(password.encode(), salt=_unb64(salt), n=int(n), r=int(r), p=int(p))
    return hmac.compare_digest(candidate, _unb64(digest))
