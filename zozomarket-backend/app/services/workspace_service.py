"""The signed-in account's workspace profile, brand, and sending defaults."""

import asyncio
import logging

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.account import User, Workspace
from app.schemas.workspace import AwsSettingsUpdate, WorkspaceUpdate
from app.services import media_service
from app.services.aws_credentials import (
    clear_aws_caches,
    credentials_from_workspace,
    decrypt_credential,
    encrypt_credential,
    set_aws_credentials_cache,
)
from app.services.aws_provisioner import (
    DEFAULT_CONFIGURATION_SET,
    provision_aws_infrastructure,
)

logger = logging.getLogger(__name__)


async def get_workspace(session: AsyncSession, user: User) -> Workspace:
    workspace = await session.get(Workspace, user.workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found")
    return workspace


async def update_workspace(session: AsyncSession, user: User, data: WorkspaceUpdate) -> Workspace:
    workspace = await get_workspace(session, user)
    changes = data.model_dump(exclude_unset=True)
    if "from_name" in changes and changes["from_name"] is None:
        changes["from_name"] = ""
    if "mailing_address" in changes and changes["mailing_address"] is None:
        changes["mailing_address"] = ""
    for key, value in changes.items():
        setattr(workspace, key, value)
    await session.commit()
    await session.refresh(workspace)
    set_aws_credentials_cache(credentials_from_workspace(workspace))
    return workspace


async def set_logo(session: AsyncSession, user: User, file: UploadFile) -> Workspace:
    asset = await media_service.upload(session, file)
    workspace = await get_workspace(session, user)
    workspace.logo_url = asset.url
    await session.commit()
    await session.refresh(workspace)
    return workspace


async def update_aws_settings(
    session: AsyncSession, user: User, data: AwsSettingsUpdate
) -> tuple[Workspace, list[str]]:
    workspace = await get_workspace(session, user)

    disable_encryption = (
        data.aws_encryption_disabled
        if data.aws_encryption_disabled is not None
        else bool(workspace.aws_encryption_disabled)
    )
    encryption_changed = (
        data.aws_encryption_disabled is not None
        and data.aws_encryption_disabled != bool(workspace.aws_encryption_disabled)
    )
    workspace.aws_encryption_disabled = disable_encryption

    if data.aws_access_key_id is not None:
        workspace.aws_access_key_id = encrypt_credential(
            data.aws_access_key_id, disable_encryption=disable_encryption
        )
    elif encryption_changed and workspace.aws_access_key_id:
        plain_access = decrypt_credential(workspace.aws_access_key_id)
        if plain_access:
            workspace.aws_access_key_id = encrypt_credential(
                plain_access, disable_encryption=disable_encryption
            )

    if data.aws_secret_access_key is not None:
        workspace.aws_secret_access_key = encrypt_credential(
            data.aws_secret_access_key, disable_encryption=disable_encryption
        )
    elif encryption_changed and workspace.aws_secret_access_key:
        plain_secret = decrypt_credential(workspace.aws_secret_access_key)
        if plain_secret:
            workspace.aws_secret_access_key = encrypt_credential(
                plain_secret, disable_encryption=disable_encryption
            )

    if data.aws_region is not None:
        workspace.aws_region = data.aws_region
    if data.aws_s3_media_enabled is not None:
        workspace.aws_s3_media_enabled = data.aws_s3_media_enabled

    enable_s3 = bool(getattr(workspace, "aws_s3_media_enabled", True))
    if not enable_s3:
        workspace.s3_bucket_name = None

    warnings: list[str] = []
    access_key = decrypt_credential(workspace.aws_access_key_id)
    secret_key = decrypt_credential(workspace.aws_secret_access_key)
    region = (workspace.aws_region or "us-east-1").strip() or "us-east-1"

    if access_key and secret_key:
        provisioned = await asyncio.to_thread(
            provision_aws_infrastructure,
            access_key,
            secret_key,
            region,
            enable_s3_media=enable_s3,
        )
        workspace.ses_configuration_set = (
            provisioned.configuration_set
            or workspace.ses_configuration_set
            or DEFAULT_CONFIGURATION_SET
        )
        if provisioned.sqs_queue_url:
            workspace.sqs_queue_url = provisioned.sqs_queue_url
        if enable_s3 and provisioned.s3_bucket_name:
            workspace.s3_bucket_name = provisioned.s3_bucket_name
        warnings = provisioned.warnings

    await session.commit()
    await session.refresh(workspace)

    set_aws_credentials_cache(credentials_from_workspace(workspace))
    clear_aws_caches()
    return workspace, warnings
