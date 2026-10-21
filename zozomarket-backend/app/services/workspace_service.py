"""The signed-in account's workspace profile, brand, and sending defaults."""

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.account import User, Workspace
from app.schemas.workspace import WorkspaceUpdate
from app.services import media_service


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
    return workspace


async def set_logo(session: AsyncSession, user: User, file: UploadFile) -> Workspace:
    asset = await media_service.upload(session, file)
    workspace = await get_workspace(session, user)
    workspace.logo_url = asset.url
    await session.commit()
    await session.refresh(workspace)
    return workspace
