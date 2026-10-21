from fastapi import APIRouter, File, UploadFile

from app.api.deps import CurrentUser, DbSession
from app.schemas.common import ApiResponse
from app.schemas.workspace import WorkspaceRead, WorkspaceUpdate
from app.services import workspace_service

router = APIRouter(prefix="/workspace", tags=["Workspace"])


def _read(workspace, user) -> WorkspaceRead:
    return WorkspaceRead.from_workspace(
        workspace, owner_name=user.name, owner_email=user.email
    )


@router.get("", response_model=ApiResponse[WorkspaceRead])
async def get_workspace(db: DbSession, user: CurrentUser):
    workspace = await workspace_service.get_workspace(db, user)
    return ApiResponse(data=_read(workspace, user))


@router.patch("", response_model=ApiResponse[WorkspaceRead])
async def update_workspace(db: DbSession, user: CurrentUser, body: WorkspaceUpdate):
    workspace = await workspace_service.update_workspace(db, user, body)
    return ApiResponse(data=_read(workspace, user))


@router.post("/logo", response_model=ApiResponse[WorkspaceRead])
async def upload_logo(db: DbSession, user: CurrentUser, file: UploadFile = File(...)):
    """Store the logo file under storage/media and keep only its URL on the workspace."""
    workspace = await workspace_service.set_logo(db, user, file)
    return ApiResponse(data=_read(workspace, user))
