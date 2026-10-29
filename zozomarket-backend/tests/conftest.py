import os
import tempfile
from collections.abc import AsyncIterator

# Configure before any `app` import: settings are read once at import time.
_tmp = tempfile.mkdtemp(prefix="zozo-test-")
_media_dir = os.path.join(_tmp, "media")
_db_path = os.path.join(_tmp, "test.db").replace("\\", "/")
os.environ.update(
    {
        "ENVIRONMENT": "test",
        # A file (not :memory:) so the app and test sessions get separate connections.
        "DATABASE_URL": f"sqlite+aiosqlite:///{_db_path}",
        "API_KEYS": "",
        "WEBHOOK_SECRET": "whsec-test",
        "SCHEDULER_ENABLED": "false",
        "SEED_DEMO_DATA": "false",
        "AUTO_CREATE_TABLES": "false",
        "EMAIL_PROVIDER": "console",
        "MEDIA_ROOT": _media_dir,
        "MEDIA_MAX_UPLOAD_MB": "1",
        "PUBLIC_BASE_URL": "http://testserver",
        "TASK_BACKEND": "inline",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

import app.models  # noqa: E402
from app.core import database  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.main import app  # noqa: E402
from app.services.email_service import ConsoleSender, get_sender  # noqa: E402


@pytest.fixture(autouse=True)
async def _fresh_db() -> AsyncIterator[None]:
    async with database.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture(autouse=True)
def outbox() -> ConsoleSender:
    sender = get_sender()
    assert isinstance(sender, ConsoleSender)
    sender.outbox.clear()
    return sender


def account_body(**overrides: object) -> dict:
    """Signup body with the workspace details a campaign needs."""
    body = {
        "name": "Test User",
        "email": "test@example.com",
        "password": "password123",
        "workspaceName": "Test Workspace",
        "mailingAddress": "1 Market Street",
        "fromName": "Test Workspace",
        "fromEmail": "hello@example.com",
    }
    body.update(overrides)
    return body


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        created = await c.post("/api/v1/auth/signup", json=account_body())
        assert created.status_code == 201, created.text
        c.headers["Authorization"] = f"Bearer {created.json()['data']['accessToken']}"
        yield c


@pytest.fixture
async def anon_client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    # Deferred transactions: this session holds read snapshots across API calls, and must
    # not take the write lock the app's BEGIN IMMEDIATE sessions need.
    engine = database.create_engine(os.environ["DATABASE_URL"], sqlite_immediate=False)
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        yield s
    await engine.dispose()


async def make_contact(client: httpx.AsyncClient, email: str, **extra) -> dict:
    resp = await client.post("/api/v1/contacts", json={"email": email, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


SIMPLE_DESIGN = [
    {"type": "heading", "text": "Hello {{first_name}}"},
    {"type": "paragraph", "text": "Read our news"},
    {"type": "button", "text": "Shop", "link": "https://shop.example.com/sale"},
]


async def make_campaign(client: httpx.AsyncClient, **extra) -> dict:
    body = {"name": "Launch", "subject": "Hi {{first_name}}", "design": SIMPLE_DESIGN, **extra}
    resp = await client.post("/api/v1/campaigns", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]
