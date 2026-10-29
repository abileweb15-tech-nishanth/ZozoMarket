"""Send one message through Amazon SES v2.

Credentials and the verified From address come from settings (the `.env` file).
Nothing in this module is an account id, a key, or an email address.
"""

import asyncio
import logging
from dataclasses import dataclass
from email.utils import formataddr

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

# A rejected recipient will not succeed on retry. Throttling and account
# configuration problems stay retryable so a later attempt can go through.
_PERMANENT_CODES = {"MessageRejected"}

_HINTS = {
    "MessageRejected": (
        "SES rejected the message. The From address must be a verified identity, "
        "and in the sandbox the recipient must be verified too."
    ),
    "AccessDeniedException": (
        "SES denied the send. The IAM user needs ses:SendEmail on the verified identity."
    ),
    "SendingPausedException": "SES sending is paused for this account or identity.",
    "TooManyRequestsException": "SES is throttling sends. Retry later.",
    "ConfigurationSetDoesNotExistException": (
        "SES_CONFIGURATION_SET does not match a configuration set in this region."
    ),
}


@dataclass(slots=True)
class SesSendResult:
    ok: bool
    message_id: str = ""
    error: str = ""
    permanent: bool = False


def _secret(value: object) -> str:
    if value is None:
        return ""
    revealed = value.get_secret_value() if hasattr(value, "get_secret_value") else str(value)
    return revealed or ""


def _failure(message: str, *, permanent: bool = False) -> SesSendResult:
    logger.error("SES send failed: %s", message)
    return SesSendResult(ok=False, error=message, permanent=permanent)


def _send_sync(
    *,
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
    from_name: str | None,
    reply_to: str | None,
    headers: dict[str, str] | None,
) -> SesSendResult:
    access_key = (settings.AWS_ACCESS_KEY_ID or "").strip()
    secret_key = _secret(settings.AWS_SECRET_ACCESS_KEY)
    from_email = (settings.SES_FROM_EMAIL or "").strip()
    if not access_key or not secret_key:
        return _failure("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SES")
    if not from_email:
        return _failure("SES_FROM_EMAIL is required for SES")

    # SES only accepts the verified identity. The campaign From address is not used.
    source = formataddr((from_name or settings.EMAIL_FROM_NAME or "", from_email))
    simple: dict = {
        "Subject": {"Data": subject, "Charset": "UTF-8"},
        "Body": {
            "Html": {"Data": html_body, "Charset": "UTF-8"},
            "Text": {"Data": text_body, "Charset": "UTF-8"},
        },
    }
    if headers:
        simple["Headers"] = [{"Name": name, "Value": value} for name, value in headers.items()]

    request: dict = {
        "FromEmailAddress": source,
        "Destination": {"ToAddresses": [to]},
        "Content": {"Simple": simple},
    }
    if reply_to:
        request["ReplyToAddresses"] = [reply_to]
    configuration_set = (settings.SES_CONFIGURATION_SET or "").strip()
    if configuration_set:
        request["ConfigurationSetName"] = configuration_set
    # The configuration set publishes this tag to CloudWatch as its dimension.
    dimension = (settings.SES_CLOUDWATCH_DIMENSION_NAME or "").strip()
    dimension_value = (settings.SES_CLOUDWATCH_DIMENSION_VALUE or "").strip()
    if dimension and dimension_value:
        request["EmailTags"] = [{"Name": dimension, "Value": dimension_value}]

    try:
        # boto3 reads the keys we pass here. It does not look for a hardcoded profile.
        client = boto3.client(
            "sesv2",
            region_name=settings.AWS_REGION,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        response = client.send_email(**request)
    except ClientError as exc:
        error = exc.response.get("Error", {})
        code = str(error.get("Code", "ClientError"))
        detail = str(error.get("Message") or exc)
        hint = _HINTS.get(code, "SES could not send this message.")
        return _failure(f"{hint} ({code}: {detail})", permanent=code in _PERMANENT_CODES)
    except Exception as exc:
        # A missing region or a network failure must not escape into FastAPI.
        logger.exception("SES send failed")
        return SesSendResult(ok=False, error=f"SES error: {exc}")

    return SesSendResult(ok=True, message_id=str(response.get("MessageId", "")))


async def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
    *,
    from_name: str | None = None,
    reply_to: str | None = None,
    headers: dict[str, str] | None = None,
) -> SesSendResult:
    """Send one HTML and plain-text message. Failures are logged and returned, not raised."""
    # boto3 is synchronous. The thread keeps the API event loop free while SES responds.
    return await asyncio.to_thread(
        _send_sync,
        to=to,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        from_name=from_name,
        reply_to=reply_to,
        headers=headers,
    )
