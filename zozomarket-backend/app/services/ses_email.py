"""Send one message through Amazon SES v2.

Credentials, region, configuration set, and sender identity are resolved from
the workspace in the database. Local `/media/...` images (such as those created
on `localhost`) are automatically attached via SES v2 `Simple.Attachments` with
`ContentDisposition="INLINE"` and `ContentId` (`cid:`), which works with standard
`ses:SendEmail` permissions (no `ses:SendRawEmail` required) and renders in
Gmail, Outlook, and Apple Mail.
"""

import asyncio
import hashlib
import html as html_lib
import logging
import re
from dataclasses import dataclass
from email.utils import formataddr

import boto3
from botocore.exceptions import ClientError

from app.services.aws_credentials import get_aws_credentials
from app.services.media_service import read_local_media_bytes

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

_IMG_SRC_RE = re.compile(r'(<img\b[^>]*?\bsrc=)(["\'])(.*?)\2', re.IGNORECASE | re.DOTALL)


@dataclass(slots=True)
class SesSendResult:
    ok: bool
    message_id: str = ""
    error: str = ""
    permanent: bool = False


def _failure(message: str, *, permanent: bool = False) -> SesSendResult:
    logger.error("SES send failed: %s", message)
    return SesSendResult(ok=False, error=message, permanent=permanent)


def _extract_inline_media(
    html_body: str,
) -> tuple[str, list[dict[str, object]]]:
    """Rewrite local `/media/<key>` `<img src="...">` URLs to `cid:...` and return SESv2 Simple Attachments."""
    attachments_by_cid: dict[str, dict[str, object]] = {}

    def _replace(match: re.Match[str]) -> str:
        prefix, quote, raw_url = match.group(1), match.group(2), match.group(3)
        unescaped_url = html_lib.unescape(raw_url.strip())
        # Skip public HTTPS URLs (e.g. S3/CDN) unless they point to localhost/127.0.0.1
        if (
            unescaped_url.startswith("https://")
            and "localhost" not in unescaped_url
            and "127.0.0.1" not in unescaped_url
        ):
            return match.group(0)

        resolved = read_local_media_bytes(unescaped_url)
        if resolved is None:
            return match.group(0)

        data, mime_type, filename = resolved
        cid = f"zm-{hashlib.sha1(unescaped_url.encode('utf-8')).hexdigest()[:16]}"  # noqa: S324
        if cid not in attachments_by_cid:
            attachments_by_cid[cid] = {
                "RawContent": data,
                "ContentDisposition": "INLINE",
                "ContentTransferEncoding": "BASE64",
                "FileName": filename,
                "ContentType": mime_type,
                "ContentId": cid,
            }
        return f"{prefix}{quote}cid:{cid}{quote}"

    rewritten_html = _IMG_SRC_RE.sub(_replace, html_body)
    return rewritten_html, list(attachments_by_cid.values())


def _send_sync(
    *,
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
    from_email: str | None,
    from_name: str | None,
    reply_to: str | None,
    headers: dict[str, str] | None,
    tags: dict[str, str] | None = None,
) -> SesSendResult:
    creds = get_aws_credentials()
    if creds is None:
        return _failure(
            "AWS Access Key ID and Secret Access Key must be configured in Settings for SES"
        )

    candidate_email = (from_email or "").strip()
    if candidate_email.endswith(".local"):
        candidate_email = ""
    resolved_from_email = creds.from_email or candidate_email
    if not resolved_from_email:
        return _failure("Default From email must be configured in Workspace Settings for SES")

    resolved_from_name = (from_name or "").strip() or creds.from_name
    source = formataddr((resolved_from_name, resolved_from_email))

    rewritten_html, inline_attachments = _extract_inline_media(html_body)

    simple: dict = {
        "Subject": {"Data": subject, "Charset": "UTF-8"},
        "Body": {
            "Html": {"Data": rewritten_html if inline_attachments else html_body, "Charset": "UTF-8"},
            "Text": {"Data": text_body, "Charset": "UTF-8"},
        },
    }
    if headers:
        simple["Headers"] = [{"Name": name, "Value": value} for name, value in headers.items()]
    if inline_attachments:
        simple["Attachments"] = inline_attachments

    request: dict = {
        "FromEmailAddress": source,
        "Destination": {"ToAddresses": [to]},
        "Content": {"Simple": simple},
    }
    if reply_to:
        request["ReplyToAddresses"] = [reply_to]
    configuration_set = (creds.configuration_set or "").strip()
    if configuration_set:
        request["ConfigurationSetName"] = configuration_set

    # Email tags for CloudWatch dimension matching
    email_tags: list[dict[str, str]] = []
    has_campaign_tag = False
    if tags:
        for k, v in tags.items():
            if not v:
                continue
            clean_k = str(k).strip()
            clean_v = str(v).strip()
            if clean_k.lower() == "campaign":
                has_campaign_tag = True
            email_tags.append({"Name": clean_k, "Value": clean_v})

    # Fallback to configured dimension if no campaign tag provided
    if not has_campaign_tag:
        dimension = (creds.cloudwatch_dimension_name or "").strip()
        dimension_value = (creds.cloudwatch_dimension_value or "").strip()
        if dimension and dimension_value:
            email_tags.append({"Name": dimension, "Value": dimension_value})

    if email_tags:
        request["EmailTags"] = email_tags

    try:
        client = boto3.client(
            "sesv2",
            region_name=creds.region,
            aws_access_key_id=creds.access_key_id,
            aws_secret_access_key=creds.secret_access_key,
        )
        try:
            response = client.send_email(**request)
        except ClientError as first_exc:
            # If the IAM user lacks permission for inline attachments, fall back to plain Simple send
            first_code = str(first_exc.response.get("Error", {}).get("Code", ""))
            if inline_attachments and first_code == "AccessDeniedException":
                logger.warning("SES inline attachments denied by IAM; retrying without attachments")
                simple.pop("Attachments", None)
                simple["Body"]["Html"]["Data"] = html_body
                response = client.send_email(**request)
            else:
                raise
    except ClientError as exc:
        error = exc.response.get("Error", {})
        code = str(error.get("Code", "ClientError"))
        detail = str(error.get("Message") or exc)
        hint = _HINTS.get(code, "SES could not send this message.")
        return _failure(f"{hint} ({code}: {detail})", permanent=code in _PERMANENT_CODES)
    except Exception as exc:
        logger.exception("SES send failed")
        return SesSendResult(ok=False, error=f"SES error: {exc}")

    return SesSendResult(ok=True, message_id=str(response.get("MessageId", "")))


async def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
    *,
    from_email: str | None = None,
    from_name: str | None = None,
    reply_to: str | None = None,
    headers: dict[str, str] | None = None,
    tags: dict[str, str] | None = None,
) -> SesSendResult:
    """Send one HTML and plain-text message. Failures are logged and returned, not raised."""
    return await asyncio.to_thread(
        _send_sync,
        to=to,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        from_email=from_email,
        from_name=from_name,
        reply_to=reply_to,
        headers=headers,
        tags=tags,
    )
