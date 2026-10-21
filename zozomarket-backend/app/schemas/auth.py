from pydantic import EmailStr, Field

from app.models.account import User
from app.schemas.common import CamelModel, InputModel


class SignupRequest(InputModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    workspace_name: str | None = Field(default=None, max_length=200)


class LoginRequest(InputModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshRequest(InputModel):
    refresh_token: str = Field(min_length=1)


class ProfileUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    workspace_name: str | None = Field(default=None, min_length=1, max_length=200)
    current_password: str | None = Field(default=None, max_length=200)
    new_password: str | None = Field(default=None, min_length=8, max_length=200)


class UserRead(CamelModel):
    id: str
    email: EmailStr
    name: str
    workspace_id: str
    workspace_name: str

    @classmethod
    def from_user(cls, user: User) -> "UserRead":
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            workspace_id=user.workspace_id,
            workspace_name=user.workspace.name,
        )


class AuthSession(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int
    user: UserRead
