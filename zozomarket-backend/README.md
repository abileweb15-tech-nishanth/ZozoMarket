# ZozoMarket Backend — Email Marketing Platform API

Production-ready FastAPI backend for **ZozoMarket**, an email marketing SaaS platform.
It powers the Next.js frontend in `../zozomarket-frontend`.

- **Technology Stack**: Python 3.11+, FastAPI (AsyncIO), Pydantic v2, SQLAlchemy 2.0 (async), Alembic, SQLite (`aiosqlite`) for local dev, PostgreSQL (`asyncpg`) for production, Celery + Redis (optional worker mode), Pytest (50 automated tests), Ruff.
- **Core Domains**: Email Campaigns & Lifecycle, Visual Email Builder Templates, Drip Automations, Audience CRM & Contacts, Campaign Calendar, Deliverability & Analytics, Lead Capture Forms & Landing Pages, Media Asset Storage.

---

## 1. How to Run the Backend

The backend is pre-configured with a virtual environment (`.venv`) and all dependencies installed.

### Option A: Local Development (Fastest, zero setup, SQLite)

No Docker or PostgreSQL required. It uses an embedded asynchronous SQLite database (`zozomarket.db`) and auto-seeds initial data matching the frontend's mock database.

#### On Windows (PowerShell or Command Prompt):
```powershell
cd zozomarket-backend

# 1. Activate the virtual environment
.\.venv\Scripts\activate

# 2. (Optional) Copy environment template
cp .env.example .env

# 3. Start the FastAPI development server with hot reload
python -m uvicorn app.main:app --reload --port 8000
```

#### On macOS / Linux:
```bash
cd zozomarket-backend

# 1. Activate virtual environment (or create with `python3 -m venv .venv`)
source .venv/bin/activate

# 2. Start the FastAPI server
uvicorn app.main:app --reload --port 8000
```

#### Verifying it's running:
- **Interactive Swagger Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **OpenAPI JSON Specification**: [http://localhost:8000/api/v1/openapi.json](http://localhost:8000/api/v1/openapi.json)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health) (`{"status": "ok", "version": "0.1.0"}`)
- **Readiness Check**: [http://localhost:8000/health/ready](http://localhost:8000/health/ready) (`{"status": "ready"}`)

---

### Option B: Full-Stack Production Container (Docker Compose)

Runs PostgreSQL 16, Redis, Celery Worker, Celery Beat scheduler, and the FastAPI application in production mode:

```bash
cd zozomarket-backend
cp .env.example .env
docker compose up --build
```

| Container | Role | Port |
| :--- | :--- | :--- |
| `api` | Runs Alembic migrations, then starts Uvicorn production server | `8000` |
| `worker` | Celery asynchronous worker processing bulk email dispatches | — |
| `beat` | Celery Beat periodic scheduler polling due campaigns and drip steps | — |
| `db` | PostgreSQL 16 database | `5432` |
| `redis` | Redis cache and Celery message broker | `6379` |

---

## 2. Running the Test Suite & Linter

The backend includes a comprehensive async test suite with 50 tests covering every domain:

```powershell
# Run all tests (all 50 pass)
.\.venv\Scripts\python.exe -m pytest

# Run linter & code formatting checks
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\ruff.exe format --check .
```

---

## 3. How the Backend Works

### A. Application Lifecycle & Startup (`app/main.py`)
1. **Database Initialization**: On startup (`lifespan`), `database.create_all()` creates tables if `AUTO_CREATE_TABLES=True`.
2. **Demo Data Seeding**: If `SEED_DEMO_DATA=True`, `app.services.seed.seed_demo_data()` automatically populates the database with initial campaigns, contacts, templates, and metrics mirroring `marketing-data.json` with matching IDs (`c1`, `c2`, `u1`, `t1`).
3. **In-process Scheduler**: If `TASK_BACKEND=inline` (default for local dev), an internal asyncio background loop polls every 30 seconds for scheduled campaigns and automated drip steps.
4. **CORS Middleware**: Explicitly allows requests from Next.js (`http://localhost:3000` and `http://127.0.0.1:3000`).

### B. Campaign Send Lifecycle & Idempotency
- **Lifecycle**: `Draft` ⇄ `Scheduled` → `Sending` → `Sent` or `Failed`.
- **Concurrency Protection**: Transitioning into `Sending` executes an atomic conditional SQL `UPDATE ... WHERE status IN (...)`. Only one worker can claim and send a campaign.
- **Idempotent Delivery**: One `email_messages` row is created per (campaign, contact) with a unique DB constraint. If a dispatch crashes or is retried, delivered contacts are never emailed twice, and transient failures resume automatically.
- **Delivery Engine**: `EMAIL_PROVIDER=console` logs mail locally. `ses` sends the rendered HTML through the Amazon SES v2 API. The From address is `SES_FROM_EMAIL`, and `SES_CONFIGURATION_SET` is attached when it is set. Dashboard delivery, open, and click figures come from that configuration set's CloudWatch metrics. `resend` is another relay.

### C. Open & Click Tracking Engine
- Emails generated with HTML include an invisible open pixel (`/api/v1/t/o/{token}.gif`) and wrapped click links (`/api/v1/t/c/{token}`).
- Tracking tokens are cryptographically signed with HMAC so IDs and destinations cannot be forged or abused as open redirects.
- If email clients block images, clicking any link automatically counts as an email open.

### D. Automation & Drip Sequence Engine (`app/services/automation_service.py`)
- Workflows are defined as directed step lists (`Trigger` -> `Delay` -> `Condition` -> `Email` -> `End`).
- Contacts are enrolled via triggers (e.g., newsletter signup, VIP tag added, or webhook events).
- The scheduler processes due steps and advances each contact through the drip journey.

---

## 4. API Endpoints Map (Prefix `/api/v1`)

| Domain | Method & Path | Description |
| :--- | :--- | :--- |
| **Dashboard** | `GET /dashboard` | Summary KPIs, recent campaigns, upcoming sends |
| | `GET /dashboard/kpis` | Executive performance metrics |
| **Campaigns** | `GET /campaigns` | List campaigns with search & status filters |
| | `POST /campaigns` | Create a new draft campaign |
| | `GET /campaigns/{id}` | Retrieve full campaign details |
| | `PATCH /campaigns/{id}` | Update draft or scheduled campaign |
| | `DELETE /campaigns/{id}` | Delete campaign |
| | `POST /campaigns/{id}/send` | Trigger immediate dispatch (returns 202 Accepted) |
| | `POST /campaigns/{id}/schedule` | Set future dispatch datetime |
| | `POST /campaigns/{id}/unschedule`| Revert scheduled campaign to draft |
| | `POST /campaigns/{id}/test` | Send proof email to specified addresses |
| | `POST /campaigns/{id}/duplicate`| Clone existing campaign |
| **Contacts** | `GET /contacts` | List subscribers (search, tags, status filters) |
| | `POST /contacts` | Create new contact |
| | `POST /contacts/bulk-tag` | Add tags to selected contacts |
| | `POST /contacts/bulk-delete` | Delete multiple contacts |
| | `POST /contacts/import` | Upload CSV subscriber list |
| | `GET /contacts/export` | Download CSV of subscribers |
| **Calendar** | `GET /calendar` | Campaign calendar events query |
| | `GET /calendar/upcoming` | Next 5 upcoming dispatches |
| **Automations** | `GET /automations` | List drip workflows |
| | `POST /automations` | Create new automated sequence |
| | `POST /automations/{id}/activate` | Activate drip workflow |
| **Analytics** | `GET /analytics/overview` | Overall deliverability and engagement |
| | `GET /analytics/performance` | Time-series delivery, opens, clicks chart data |
| **Templates** | `GET /templates` | List pre-built email templates |
| | `POST /templates/{id}/preview` | Render template HTML with mock variables |
| **Media** | `GET /media` | List stored digital assets |
| | `POST /media` | Upload marketing image or banner |
| | `PATCH /media/{id}` | Rename asset |
| | `DELETE /media/{id}` | Delete asset |
| **Public** | `POST /public/forms/{slug}/submit` | Embeddable lead capture form submit |
| | `GET /t/o/{token}.gif` | Email open tracking pixel |
| | `GET /t/c/{token}` | Email click tracking redirect |

---

## 5. Connecting the Frontend (`zozomarket-frontend`)

To point the Next.js frontend to this live backend:
1. In `zozomarket-frontend/.env.local` (create if needed):
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
   ```
2. The frontend and backend communicate via standardized JSON envelopes:
   `{ "success": true, "data": ... }`.
3. Both can run concurrently on your machine:
   - **Frontend**: `http://localhost:3000` (`pnpm run dev`)
   - **Backend**: `http://localhost:8000` (`python -m uvicorn app.main:app --reload`)
