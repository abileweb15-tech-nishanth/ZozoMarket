"""Signup, login, and profile for a single workspace per account."""

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    read_refresh_token,
    verify_password,
)
from app.models.account import User, Workspace
from app.models.media import MediaAsset
from app.schemas.auth import AuthSession, LoginRequest, ProfileUpdate, SignupRequest, UserRead
from app.services.media_service import get_storage


def _session(user: User) -> AuthSession:
    return AuthSession(
        access_token=create_access_token(user.id, user.workspace_id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.ACCESS_TOKEN_MINUTES * 60,
        user=UserRead.from_user(user),
    )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def signup(session: AsyncSession, data: SignupRequest) -> AuthSession:
    email = _normalize_email(data.email)
    existing = await session.scalar(select(User.id).where(User.email == email))
    if existing:
        raise ConflictError("An account with this email already exists")
    workspace = Workspace(
        name=data.workspace_name.strip(),
        website=data.website.strip() if data.website else None,
        timezone=data.timezone,
        mailing_address=data.mailing_address.strip(),
        from_name=data.from_name.strip(),
        from_email=str(data.from_email).strip().lower(),
        reply_to=str(data.reply_to).strip().lower() if data.reply_to else None,
    )
    session.add(workspace)
    await session.flush()
    user = User(
        email=email,
        name=data.name.strip(),
        password_hash=hash_password(data.password),
        workspace_id=workspace.id,
    )
    session.add(user)
    await session.flush()
    workspace.owner_id = user.id
    await session.commit()
    await session.refresh(user)
    return _session(user)


async def login(session: AsyncSession, data: LoginRequest) -> AuthSession:
    user = await session.scalar(select(User).where(User.email == _normalize_email(data.email)))
    if user is None or not verify_password(data.password, user.password_hash):
        raise UnauthorizedError("Email or password is incorrect")
    return _session(user)


async def refresh(session: AsyncSession, token: str) -> AuthSession:
    payload = read_refresh_token(token)
    if payload is None:
        raise UnauthorizedError("Refresh token is invalid or expired")
    user = await session.get(User, payload["sub"])
    if user is None:
        raise UnauthorizedError("Refresh token is invalid or expired")
    return _session(user)


async def update_profile(session: AsyncSession, user: User, data: ProfileUpdate) -> User:
    if data.new_password:
        if not data.current_password or not verify_password(
            data.current_password, user.password_hash
        ):
            raise UnauthorizedError("Current password is incorrect")
        user.password_hash = hash_password(data.new_password)
    if data.name is not None:
        user.name = data.name.strip()
    if data.workspace_name is not None:
        user.workspace.name = data.workspace_name.strip()
    await session.commit()
    await session.refresh(user)
    return user


async def delete_account(session: AsyncSession, user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError("Password is incorrect")
    workspace_id = user.workspace_id
    assets = (
        await session.scalars(select(MediaAsset).where(MediaAsset.workspace_id == workspace_id))
    ).all()
    storage = get_storage()
    for asset in assets:
        if asset.storage_key:
            await storage.delete(asset.storage_key)
    # Break the owner cycle, then delete the workspace so tenant rows and the user cascade.
    await session.execute(update(Workspace).where(Workspace.id == workspace_id).values(owner_id=None))
    await session.execute(delete(Workspace).where(Workspace.id == workspace_id))
    await session.commit()
