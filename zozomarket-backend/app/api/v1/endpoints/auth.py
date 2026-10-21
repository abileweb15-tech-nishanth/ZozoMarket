from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    AuthSession,
    LoginRequest,
    ProfileUpdate,
    RefreshRequest,
    SignupRequest,
    UserRead,
)
from app.schemas.common import ApiResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/signup", response_model=ApiResponse[AuthSession], status_code=201)
async def signup(db: DbSession, body: SignupRequest):
    return ApiResponse(data=await auth_service.signup(db, body))


@router.post("/login", response_model=ApiResponse[AuthSession])
async def login(db: DbSession, body: LoginRequest):
    return ApiResponse(data=await auth_service.login(db, body))


@router.post("/refresh", response_model=ApiResponse[AuthSession])
async def refresh(db: DbSession, body: RefreshRequest):
    return ApiResponse(data=await auth_service.refresh(db, body.refresh_token))


@router.get("/me", response_model=ApiResponse[UserRead])
async def me(user: CurrentUser):
    return ApiResponse(data=UserRead.from_user(user))


@router.patch("/me", response_model=ApiResponse[UserRead])
async def update_me(db: DbSession, user: CurrentUser, body: ProfileUpdate):
    updated = await auth_service.update_profile(db, user, body)
    return ApiResponse(data=UserRead.from_user(updated))
