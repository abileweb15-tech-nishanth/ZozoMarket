from pydantic import EmailStr, Field, field_validator

from app.models.account import User
from app.schemas.common import CamelModel, InputModel

TIMEZONES = ("UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London")


class SignupRequest(InputModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    workspace_name: str = Field(min_length=1, max_length=200)
    website: str | None = Field(default=None, max_length=500)
    timezone: str = Field(default="UTC", min_length=1, max_length=64)
    mailing_address: str = Field(min_length=1, max_length=2000)
    from_name: str = Field(min_length=1, max_length=120)
    from_email: EmailStr
    reply_to: EmailStr | None = None

    @field_validator("website", "reply_to", mode="before")
    @classmethod
    def _blank_optional(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        if value not in TIMEZONES:
            raise ValueError("Choose a supported time zone")
        return value


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


class AccountDelete(InputModel):
    password: str = Field(min_length=1, max_length=200)


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
