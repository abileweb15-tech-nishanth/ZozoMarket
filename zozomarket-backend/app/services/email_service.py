"""Outbound email: provider abstraction, personalisation and tracking injection."""

import asyncio
import logging
import re
import smtplib
import ssl
import uuid
from collections import deque
from dataclasses import dataclass, field
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr, make_msgid
from functools import lru_cache
from typing import Protocol
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.core.security import sign_token
from app.services.template_service import contact_variables, html_to_text, render_merge_tags

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class OutboundEmail:
    to: str
    subject: str
    html: str
    text: str = ""
    from_email: str = field(default_factory=lambda: settings.EMAIL_FROM_ADDRESS)
    from_name: str | None = field(default_factory=lambda: settings.EMAIL_FROM_NAME)
    reply_to: str | None = None
    headers: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class SendResult:
    provider_message_id: str


class EmailDeliveryError(Exception):
    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent  # True => hard bounce / rejected recipient


class EmailSender(Protocol):
    name: str

    async def send(self, email: OutboundEmail) -> SendResult: ...


class ConsoleSender:
    """Logs instead of sending. Keeps the last messages in memory for tests and dev tooling."""

    name = "console"

    def __init__(self) -> None:
        self.outbox: deque[OutboundEmail] = deque(maxlen=500)

    async def send(self, email: OutboundEmail) -> SendResult:
        self.outbox.append(email)
        logger.info("[console-email] to=%s subject=%r", email.to, email.subject)
        return SendResult(provider_message_id=f"console-{uuid.uuid4()}")


class SMTPSender:
    """Works with any SMTP relay, including Amazon SES / Postmark / Mailgun SMTP endpoints."""

    name = "smtp"

    def _build(self, email: OutboundEmail) -> MimeMessage:
        msg = MimeMessage()
        msg["Subject"] = email.subject
        msg["From"] = formataddr((email.from_name or "", email.from_email))
        msg["To"] = email.to
        msg["Message-ID"] = make_msgid(domain=email.from_email.rpartition("@")[2] or None)
        if email.reply_to:
            msg["Reply-To"] = email.reply_to
        for key, value in email.headers.items():
            msg[key] = value
        msg.set_content(email.text or html_to_text(email.html))
        msg.add_alternative(email.html, subtype="html")
        return msg

    def _send_sync(self, msg: MimeMessage) -> None:
        password = settings.SMTP_PASSWORD.get_secret_value() if settings.SMTP_PASSWORD else None
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls(context=ssl.create_default_context())
            if settings.SMTP_USERNAME and password:
                smtp.login(settings.SMTP_USERNAME, password)
            smtp.send_message(msg)

    async def send(self, email: OutboundEmail) -> SendResult:
        msg = self._build(email)
        try:
            await asyncio.to_thread(self._send_sync, msg)
        except smtplib.SMTPRecipientsRefused as exc:
            raise EmailDeliveryError(
                f"Recipient refused: {exc.recipients}", permanent=True
            ) from exc
        except smtplib.SMTPResponseException as exc:
            raise EmailDeliveryError(
                f"SMTP {exc.smtp_code}: {exc.smtp_error!r}", permanent=500 <= exc.smtp_code < 600
            ) from exc
        except (OSError, smtplib.SMTPException) as exc:
            raise EmailDeliveryError(f"SMTP error: {exc}") from exc
        return SendResult(provider_message_id=str(msg["Message-ID"]).strip("<>"))


class ResendSender:
    name = "resend"
    endpoint = "https://api.resend.com/emails"

    def __init__(self) -> None:
        if not settings.RESEND_API_KEY:
            raise RuntimeError("RESEND_API_KEY is required for EMAIL_PROVIDER=resend")
        self._client = httpx.AsyncClient(
            timeout=30,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY.get_secret_value()}"},
        )

    async def send(self, email: OutboundEmail) -> SendResult:
        payload = {
            "from": formataddr((email.from_name or "", email.from_email)),
            "to": [email.to],
            "subject": email.subject,
            "html": email.html,
            "text": email.text or html_to_text(email.html),
            "headers": email.headers,
        }
        if email.reply_to:
            payload["reply_to"] = email.reply_to
        try:
            resp = await self._client.post(self.endpoint, json=payload)
        except httpx.HTTPError as exc:
            raise EmailDeliveryError(f"Resend transport error: {exc}") from exc
        if resp.status_code >= 400:
            raise EmailDeliveryError(
                f"Resend {resp.status_code}: {resp.text[:300]}",
                permanent=resp.status_code in (400, 403, 422),
            )
        return SendResult(provider_message_id=resp.json().get("id", ""))


@lru_cache
def get_sender() -> EmailSender:
    match settings.EMAIL_PROVIDER:
        case "smtp":
            return SMTPSender()
        case "resend":
            return ResendSender()
        case _:
            return ConsoleSender()


# --- Personalisation & tracking --------------------------------------------------

_HREF = re.compile(r'href="(https?://[^"]+)"', re.IGNORECASE)


def api_url(path: str) -> str:
    return f"{settings.PUBLIC_BASE_URL.rstrip('/')}{settings.API_V1_PREFIX}{path}"


def unsubscribe_url(contact_id: str, message_id: str | None = None) -> str:
    token = sign_token("unsubscribe", {"c": contact_id, "m": message_id})
    return api_url(f"/t/u/{token}")


def _rewrite_links(markup: str, message_id: str) -> str:
    own = settings.PUBLIC_BASE_URL.rstrip("/")

    def _sub(match: re.Match[str]) -> str:
        url = match.group(1)
        if url.startswith(own):
            return match.group(0)
        token = sign_token("click", {"m": message_id, "u": url})
        return f'href="{api_url(f"/t/c/{quote(token)}")}"'

    return _HREF.sub(_sub, markup)


def _append_before_body_end(markup: str, snippet: str) -> str:
    idx = markup.lower().rfind("</body>")
    return markup[:idx] + snippet + markup[idx:] if idx != -1 else markup + snippet


def personalise(
    *,
    html: str,
    subject: str,
    contact_id: str,
    name: str,
    email: str,
    attributes: dict | None = None,
    message_id: str | None = None,
    track: bool = True,
) -> tuple[str, str, dict[str, str]]:
    """Return (html, subject, headers) ready for a single recipient."""
    unsub = unsubscribe_url(contact_id, message_id)
    variables = contact_variables(name, email, attributes)
    variables["unsubscribe_url"] = unsub
    variables["preferences_url"] = unsub

    has_unsub_link = "unsubscribe_url" in html
    body = render_merge_tags(html, variables)
    if not has_unsub_link:
        # CAN-SPAM / GDPR: every marketing email must carry a working unsubscribe link.
        body = _append_before_body_end(
            body,
            '<p style="font:12px Arial,sans-serif;color:#6b7280;text-align:center;">'
            f'<a href="{unsub}" style="color:#6b7280;">Unsubscribe</a></p>',
        )
    if track and message_id and settings.EMAIL_TRACKING_ENABLED:
        body = _rewrite_links(body, message_id)
        pixel = api_url(f"/t/o/{sign_token('open', {'m': message_id})}.gif")
        body = _append_before_body_end(
            body, f'<img src="{pixel}" width="1" height="1" alt="" style="display:none;">'
        )
    headers = {
        "List-Unsubscribe": f"<{unsub}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    return body, render_merge_tags(subject, variables, escape=False), headers


async def send_email(email: OutboundEmail) -> SendResult:
    if not email.text:
        email.text = html_to_text(email.html)
    return await get_sender().send(email)
