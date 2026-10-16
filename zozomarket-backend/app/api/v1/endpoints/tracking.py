"""Public, unauthenticated endpoints hit from inside delivered emails, plus provider webhooks.
All tokens are HMAC-signed, so ids cannot be forged or enumerated."""

import base64
import json
import logging
from urllib.parse import urlparse

from fastapi import APIRouter, Header, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select

from app.api.deps import DbSession
from app.core.exceptions import AppError, NotFoundError, UnauthorizedError
from app.core.security import verify_token, verify_webhook_signature
from app.models.message import EmailMessage
from app.schemas.common import SuccessResponse
from app.services import analytics_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/t", tags=["Tracking"], include_in_schema=True)
webhook_router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

_PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
_NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate, private"}


@router.get("/o/{token}.gif", include_in_schema=False)
async def track_open(db: DbSession, token: str):
    payload = verify_token("open", token)
    if payload and payload.get("m"):
        try:
            await analytics_service.record_open(db, payload["m"])
        except Exception:  # tracking must never break image rendering
            logger.exception("Failed to record open")
            await db.rollback()
    return Response(content=_PIXEL, media_type="image/gif", headers=_NO_CACHE)


@router.get("/c/{token}", include_in_schema=False)
async def track_click(db: DbSession, token: str):
    payload = verify_token("click", token)
    url = (payload or {}).get("u", "")
    if not payload or urlparse(url).scheme not in ("http", "https"):
        # Signed tokens make this a non-open redirect; reject anything else.
        raise NotFoundError("Link not found")
    try:
        await analytics_service.record_click(db, payload["m"])
    except Exception:
        logger.exception("Failed to record click")
        await db.rollback()
    return RedirectResponse(url, status_code=302, headers=_NO_CACHE)


def _unsubscribe_payload(token: str) -> dict:
    payload = verify_token("unsubscribe", token)
    if not payload or not payload.get("c"):
        raise AppError("This unsubscribe link is invalid", code="invalid_token")
    return payload


@router.get("/u/{token}", response_class=HTMLResponse, include_in_schema=False)
async def unsubscribe_page(token: str):
    """Confirmation page only: GET must not unsubscribe, because mail security scanners
    prefetch every link in an email."""
    _unsubscribe_payload(token)
    return HTMLResponse(
        "<!DOCTYPE html><html><body style='font-family:system-ui;text-align:center;"
        "padding:64px'><h1 id='h'>Unsubscribe from our emails?</h1>"
        "<button id='b' style='padding:12px 20px;font-size:16px'>Unsubscribe</button>"
        "<script>document.getElementById('b').onclick=async()=>{"
        "const r=await fetch(location.href,{method:'POST'});"
        "document.getElementById('h').textContent=r.ok?"
        "\"You've been unsubscribed.\":'Something went wrong, please try again.';"
        "document.getElementById('b').remove();};</script></body></html>"
    )


@router.post("/u/{token}", response_model=SuccessResponse, include_in_schema=False)
async def one_click_unsubscribe(db: DbSession, token: str):
    """Confirmation button target and RFC 8058 List-Unsubscribe-Post (Gmail / Yahoo)."""
    payload = _unsubscribe_payload(token)
    await analytics_service.record_unsubscribe(db, payload["c"], payload.get("m"))
    return SuccessResponse()


class DeliveryEvent(BaseModel):
    message_id: str = Field(alias="messageId", description="Provider message id")
    event: str = Field(pattern="^(delivered|bounced|complained)$")
    bounce_type: str = Field(default="hard", alias="bounceType", pattern="^(hard|soft)$")
    reason: str | None = None


@webhook_router.post("/email", response_model=SuccessResponse)
async def email_webhook(
    db: DbSession,
    request: Request,
    x_signature: str | None = Header(default=None, alias="X-Zozo-Signature"),
):
    """Normalised delivery webhook. Signed with HMAC-SHA256(WEBHOOK_SECRET, body) in the
    `X-Zozo-Signature` header. Adapt provider payloads (SES/SNS, Resend, …) to this shape."""
    body = await request.body()
    if not verify_webhook_signature(body, x_signature):
        raise UnauthorizedError("Invalid webhook signature")
    try:
        event = DeliveryEvent.model_validate(json.loads(body))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise AppError("Invalid webhook payload", code="validation_error") from exc

    message = await db.scalar(
        select(EmailMessage).where(EmailMessage.provider_message_id == event.message_id)
    )
    if message is None:
        return SuccessResponse()  # unknown / already purged: acknowledge so provider stops retrying
    if event.event == "bounced":
        await analytics_service.record_bounce(
            db, message, bounce_type=event.bounce_type, reason=event.reason
        )
    elif event.event == "complained" and message.contact_id:
        await analytics_service.record_unsubscribe(db, message.contact_id, message.id)
    await db.commit()
    return SuccessResponse()
