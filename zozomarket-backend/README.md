# ZozoMarket Backend

Production-ready FastAPI backend for **ZozoMarket**, an AI-powered email marketing platform.
It serves the Next.js app in `../zozomarket-frontend`.

- **Stack:** Python 3.11+, FastAPI (async), Pydantic v2, SQLAlchemy 2 (async), Alembic,
  PostgreSQL (asyncpg) or SQLite (aiosqlite), Celery + Redis (optional), Pytest, Ruff.
- **Domains:** campaigns and send lifecycle, visual-builder templates, drip automations,
  audience CRM, campaign calendar, analytics and deliverability, lead capture forms,
  media library, and the AI copywriter.

---

## Quick start (local, SQLite, no external services)

```bash
cd zozomarket-backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env             # optional: defaults work out of the box
uvicorn app.main:app --reload
```

- API docs: <http://localhost:8000/docs> (OpenAPI JSON at `/api/v1/openapi.json`)
- Health: `GET /health`, readiness (checks the DB): `GET /health/ready`

On first start, tables are created and **demo data** that mirrors the frontend's
`data/marketing-data.json` is seeded, using the same IDs (`c1`, `u1`, `t1`, …). Emails go to
the `console` provider, which logs them instead of sending. When `API_KEYS` is empty, auth is
disabled and a warning is logged. Never run like that outside local development.

> Seeded campaigns that are `Scheduled` in the past (for example "October Newsletter") are
> dispatched by the scheduler on first boot, exactly as a real overdue schedule would be.

## Full stack with Docker (PostgreSQL + Redis + Celery)

```bash
cp .env.example .env    # set SECRET_KEY and API_KEYS
docker compose up --build
```

| Service  | Role                                                                    |
|----------|-------------------------------------------------------------------------|
| `api`    | Runs `alembic upgrade head`, then uvicorn on :8000                      |
| `worker` | Celery worker: campaign dispatch                                        |
| `beat`   | Celery beat: scheduler tick (due campaigns and automation steps)         |
| `db`     | PostgreSQL 16                                                           |
| `redis`  | Celery broker / result backend                                          |

## Tests and linting

```bash
pytest                 # 49 integration and unit tests, temp SQLite DB, no network
ruff check . && ruff format --check .
```

---

## Architecture

```text
app/
├── api/
│   ├── deps.py                 # DB session, API-key auth, pagination
│   └── v1/
│       ├── api.py              # Aggregates routers under /api/v1 (private vs public)
│       └── endpoints/          # dashboard, campaigns, automations, contacts, calendar,
│                               # templates, forms (+ public), media, analytics, ai,
│                               # tracking (open/click/unsubscribe + webhooks)
├── core/                       # config, database, security, exceptions, logging
├── models/                     # SQLAlchemy ORM models
├── schemas/                    # Pydantic v2 request/response models (camelCase JSON)
├── services/                   # Business logic (no FastAPI imports apart from UploadFile)
│   ├── campaign_service.py     # CRUD, lifecycle state machine, dispatch, calendar
│   ├── contact_service.py      # CRM, tags, bulk ops, segmentation, CSV import/export
│   ├── automation_service.py   # Workflow validation, triggers, enrollment, step engine
│   ├── email_service.py        # Console / SMTP / Resend providers, personalisation, tracking
│   ├── template_service.py     # Builder blocks → email-safe HTML, merge tags
│   ├── analytics_service.py    # Event recording, aggregates, KPIs
│   ├── form_service.py         # Forms, public submit, double opt-in, landing pages
│   ├── media_service.py        # Storage backend + asset metadata
│   ├── ai_service.py           # OpenAI / Anthropic clients + deterministic mock
│   └── seed.py                 # Demo data
├── workers/                    # jobs (session-owning), in-process scheduler, Celery app
└── main.py                     # App factory, middleware, lifespan
alembic/                        # Async migration environment + versions
tests/                          # Pytest suite
```

### API conventions (matches the frontend)

- **Envelope:** `{"success": true, "data": …}`. Lists add `total`, `page`, `pageSize`, `pages`.
- **Errors:** `{"success": false, "error": "Human message", "code": "machine_code", "details"?: …}`
  with codes such as `not_found`, `conflict`, `invalid_state`, `validation_error` (422),
  `unauthorized`, `campaign_incomplete`, and `unsupported_media_type`.
- **Casing:** JSON is camelCase (`scheduledAt`, `audienceTags`). Input accepts camelCase or
  snake_case. Unknown input fields are rejected (`extra="forbid"`).
- **Enums** use the frontend's display strings: `Draft | Scheduled | Sending | Sent | Failed`,
  `Newsletter | Promotional | Automated | Announcement`, `Subscribed | Unsubscribed | Pending`.
- **Pagination:** `?page=1&pageSize=50` (max 200).
- **Auth:** `X-API-Key: <key>` or `Authorization: Bearer <key>` on everything except `/public/*`,
  `/t/*` (signed tracking links) and `/webhooks/*` (HMAC-signed).

### Key design decisions

| Concern | Approach |
|---|---|
| Send lifecycle | `Draft ⇄ Scheduled → Sending → Sent / Failed`, with `Failed → Sending` on retry. Every move into `Sending` is a conditional `UPDATE … WHERE status IN (…)`, so exactly one worker owns a dispatch even with many API replicas or Celery workers. |
| Idempotent dispatch | One `email_messages` row per (campaign, contact) under a unique constraint. Batches of `SEND_BATCH_SIZE` go out with bounded concurrency. A crash or retry resumes where it stopped: delivered recipients are never re-mailed, and transient failures are retried. Dispatches stalled for 15 minutes are resumed automatically. |
| Analytics at scale | Events update counters with `SET x = x + 1`. First-open and first-click detection uses conditional UPDATEs, so concurrent hits never double count. Charts read the pre-aggregated `email_stats_daily` table and never scan messages. |
| Tracking and links | Open pixel, click redirect, and unsubscribe links carry HMAC-signed tokens: ids can't be forged, and the click redirect can't be abused as an open redirect. A click also counts as an open when images are blocked. |
| Compliance | An unsubscribe link is auto-appended if the template lacks `{{unsubscribe_url}}`. RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers are sent. GET on the unsubscribe link only shows a confirmation, because mail scanners prefetch links. Hard bounces and complaints suppress the contact. Imports never resubscribe opted-out contacts. |
| Automations | Linear node lists (`Trigger / Delay / Condition / Email / End`), the same shape as the frontend builder. Enrollments carry a cursor and `next_run_at`. Workers claim due steps with a lease, and each contact is enrolled at most once per workflow. Triggers: subscribe, tag added, form submitted, plus external events (`POST /automations/events`, e.g. `order_completed`, `cart_abandoned`). |
| Templates | Builder blocks render to table-based, inline-styled HTML. All text is escaped, colours and URLs are allow-listed, and merge tags (`{{first_name}}`) are substituted by regex with escaping. There's no template engine, so there's no server-side template injection. |
| Media | Streamed uploads with a size cap, allow-listed MIME types plus extension, and magic-byte checks. SVG and HTML are rejected to prevent stored XSS. Storage is behind a `StorageBackend` protocol (local disk now, S3 drop-in later). |
| AI | Provider-agnostic JSON prompting over plain `httpx`, with OpenAI and Anthropic supported. Output is validated, and a deterministic mock is used on failure or when unconfigured (`AI_FALLBACK_TO_MOCK`). |
| Background work | `TASK_BACKEND=inline` uses FastAPI `BackgroundTasks` plus an asyncio scheduler loop. `TASK_BACKEND=celery` uses Redis, a worker, and beat. Jobs own their DB sessions, so the same code runs in both modes. |
| Security | Constant-time API key comparison, scrypt password hashing, production guards (startup fails without `SECRET_KEY` and `API_KEYS`), `nosniff`, request IDs, CSV formula-injection escaping, a honeypot on public forms, and escaped `LIKE` searches. |

---

## Endpoint reference (all under `/api/v1`)

**Dashboard:** `GET /dashboard` (KPIs, recent campaigns, upcoming sends) · `GET /dashboard/kpis`

**Campaigns:** `GET/POST /campaigns` · `GET/PATCH/DELETE /campaigns/{id}` ·
`GET /campaigns/stats` · `GET /campaigns/estimate?tags=VIP` ·
`POST /campaigns/{id}/schedule` `{scheduledAt}` · `/unschedule` · `/send` (202, also retries) ·
`/test` `{emails}` · `/duplicate`

**Contacts:** `GET/POST /contacts` (filters `q,status,tag,source,sort`) ·
`GET/PATCH/DELETE /contacts/{id}` · `GET /contacts/stats` · `GET /contacts/tags` ·
`POST /contacts/import` (multipart CSV) · `GET /contacts/export` (streamed CSV) ·
`POST /contacts/bulk-delete | bulk-tag | bulk-untag | bulk-status`

**Automations:** `GET/POST /automations` · `GET/PATCH/DELETE /automations/{id}` ·
`POST /automations/{id}/activate | pause | enroll` · `GET /automations/{id}/stats` ·
`POST /automations/events`

**Calendar:** `GET /calendar?start&end&type&status` · `GET /calendar/upcoming` ·
`GET /calendar/summary`

**Templates:** `GET/POST /templates` · `GET/PATCH/DELETE /templates/{id}` ·
`GET /templates/categories` · `POST /templates/render` · `POST /templates/{id}/preview` ·
`GET /templates/{id}/preview.html` · `POST /templates/{id}/duplicate`

**Forms:** `GET/POST /forms` · `GET/PATCH/DELETE /forms/{id}`.
**Public (no auth):** `GET /public/forms/{slug}` · `POST /public/forms/{slug}/view` ·
`POST /public/forms/{slug}/submit` · `GET /public/pages/{slug}` (hosted landing page) ·
`GET /public/confirm/{token}` (double opt-in)

**Media:** `GET/POST /media` (multipart `files`) · `GET/PATCH/DELETE /media/{id}` ·
`GET /media/usage`. Files are served from `/media/...`.

**Analytics:** `GET /analytics/overview` · `GET /analytics/performance?interval=day|week|month` ·
`GET /analytics/campaigns` · `GET /analytics/campaigns/{id}` · `GET /analytics/deliverability`

**AI:** `POST /ai/generate` · `POST /ai/subject-lines` · `POST /ai/preheaders`

**Tracking and webhooks:** `GET /t/o/{token}.gif` · `GET /t/c/{token}` · `GET|POST /t/u/{token}` ·
`POST /webhooks/email` (normalised `{messageId, event: delivered|bounced|complained}`)

---

## Connecting the frontend

`zozomarket-frontend/lib/api.ts` currently reads mock JSON and localStorage. To switch to this
API, replace each method body with a `fetch` to the matching endpoint and unwrap `.data`:

```ts
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.NEXT_PUBLIC_ZOZO_KEY ?? '', ...init?.headers },
  })
  const body = await res.json()
  if (!body.success) throw new Error(body.error)
  return body.data as T
}
```

Mapping: `campaigns.list → GET /campaigns`, `contacts.bulkAddTag → POST /contacts/bulk-tag`,
`calendar.list → GET /calendar`, `analytics.getEmailPerformance → GET /analytics/performance`,
`dashboard.getKPIs → GET /dashboard/kpis`, `media.rename → PATCH /media/{id}`.
Campaign `status` changes go through the lifecycle endpoints (`/schedule`, `/send`), not PATCH.

> For a browser-facing deployment, put the API key behind the Next.js server (route handlers or
> server actions) rather than exposing it via `NEXT_PUBLIC_*`.

## Production checklist

- `ENVIRONMENT=production`, a strong `SECRET_KEY`, and non-empty `API_KEYS` (startup fails otherwise)
- PostgreSQL `DATABASE_URL`, `AUTO_CREATE_TABLES=false`, `SEED_DEMO_DATA=false`
- `TASK_BACKEND=celery` with worker and beat when running more than one API instance
- A real `EMAIL_PROVIDER`, plus SPF, DKIM, and DMARC on the sending domain, and `WEBHOOK_SECRET`
  configured for bounce webhooks
- `PUBLIC_BASE_URL` set to the public HTTPS origin; shared or object storage for media when
  running multiple replicas

## Known limitations / next steps

- **Single-tenant:** API keys authenticate a single workspace. Multi-tenancy (users,
  workspaces, a `workspace_id` on every table, JWT sessions) is the main remaining step for SaaS.
- No built-in rate limiting on public form and tracking endpoints; put the API behind a
  gateway or WAF, or add a Redis limiter.
- The inactivity trigger (`no opens in 90 days`) is enrolled through `POST /automations/events`
  or manual enrollment; there is no periodic inactivity scan yet.
- Provider-specific webhook adapters (SES/SNS, Resend) should translate into the normalised
  `/webhooks/email` payload.
