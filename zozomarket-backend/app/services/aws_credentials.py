"""Database-backed AWS credentials, encryption, and thread-safe runtime cache.

AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, SES configuration set,
CloudWatch dimensions, and SQS queue URL are resolved from the workspace in the
database and never read from `.env`.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import threading
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Workspace

logger = logging.getLogger(__name__)

_ENC_PREFIX = "enc:v1:"
_LOCK = threading.RLock()
_CACHED_CREDENTIALS: AwsCredentials | None = None


@dataclass(frozen=True, slots=True)
class AwsCredentials:
    access_key_id: str
    secret_access_key: str
    region: str
    configuration_set: str = "zozomarket-tracking"
    cloudwatch_dimension_name: str = "campaign"
    cloudwatch_dimension_value: str = "zozomarket"
    sqs_queue_url: str = ""
    s3_bucket_name: str = ""
    s3_media_enabled: bool = True
    from_email: str = ""
    from_name: str = ""


def _fernet() -> Fernet:
    raw_secret = settings.SECRET_KEY.get_secret_value().encode("utf-8")
    digest = hashlib.sha256(raw_secret).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_credential(value: str, *, disable_encryption: bool = False) -> str:
    """Encrypt a credential with Fernet unless encryption is explicitly disabled."""
    cleaned = value.strip()
    if not cleaned:
        return ""
    if disable_encryption:
        return cleaned
    token = _fernet().encrypt(cleaned.encode("utf-8")).decode("ascii")
    return f"{_ENC_PREFIX}{token}"


def decrypt_credential(stored: str | None) -> str:
    """Decrypt a stored credential, or return plaintext if stored unencrypted."""
    if not stored:
        return ""
    if not stored.startswith(_ENC_PREFIX):
        return stored.strip()
    token = stored.removeprefix(_ENC_PREFIX)
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8").strip()
    except InvalidToken:
        logger.error("Failed to decrypt stored AWS credential; check SECRET_KEY")
        return ""


def get_aws_credentials() -> AwsCredentials | None:
    """Return the active AWS credentials and configuration from the runtime cache."""
    with _LOCK:
        return _CACHED_CREDENTIALS


def set_aws_credentials_cache(creds: AwsCredentials | None) -> None:
    """Update the in-memory AWS credentials snapshot."""
    with _LOCK:
        global _CACHED_CREDENTIALS
        _CACHED_CREDENTIALS = creds


def clear_aws_caches() -> None:
    """Clear cached CloudWatch/SES analytics responses after credential or region updates."""
    from app.services import ses_analytics_service, ses_stats

    ses_analytics_service._CACHE.clear()
    ses_analytics_service._ACTIVE_CAMPAIGNS_CACHE = (0.0, [])
    ses_stats._CACHE.clear()


def credentials_from_workspace(workspace: Workspace) -> AwsCredentials | None:
    """Build AwsCredentials from a Workspace row if both keys are present."""
    access_key = decrypt_credential(workspace.aws_access_key_id)
    secret_key = decrypt_credential(workspace.aws_secret_access_key)
    region = (workspace.aws_region or "us-east-1").strip() or "us-east-1"
    if not access_key or not secret_key:
        return None
    config_set = (workspace.ses_configuration_set or "").strip() or "zozomarket-tracking"
    sqs_url = (workspace.sqs_queue_url or "").strip()
    s3_enabled = bool(getattr(workspace, "aws_s3_media_enabled", True))
    s3_bucket = (workspace.s3_bucket_name or "").strip() if s3_enabled else ""
    from_email = (workspace.from_email or "").strip()
    from_name = (workspace.from_name or "").strip() or (workspace.name or "").strip()
    return AwsCredentials(
        access_key_id=access_key,
        secret_access_key=secret_key,
        region=region,
        configuration_set=config_set,
        cloudwatch_dimension_name="campaign",
        cloudwatch_dimension_value="zozomarket",
        sqs_queue_url=sqs_url,
        s3_bucket_name=s3_bucket,
        s3_media_enabled=s3_enabled,
        from_email=from_email,
        from_name=from_name,
    )


async def load_aws_credentials(
    session: AsyncSession, workspace_id: str | None = None
) -> AwsCredentials | None:
    """Load AWS credentials from the database and refresh the runtime cache."""
    if workspace_id is not None:
        workspace = await session.get(Workspace, workspace_id)
    else:
        result = await session.execute(
            select(Workspace)
            .where(Workspace.aws_access_key_id.is_not(None))
            .order_by(Workspace.updated_at.desc())
            .limit(1)
        )
        workspace = result.scalar_one_or_none()
        if workspace is None:
            fallback = await session.execute(
                select(Workspace).order_by(Workspace.created_at.asc()).limit(1)
            )
            workspace = fallback.scalar_one_or_none()

    creds = credentials_from_workspace(workspace) if workspace is not None else None
    set_aws_credentials_cache(creds)
    return creds
