# Architecture Decision Records (ADR)

## ADR-001: JSON Data Store & Frontend API-like Service Architecture

- **Date**: 2026-10-14
- **Status**: Accepted
- **Context**:
  The application initially used hardcoded in-memory arrays in TypeScript. To transition toward an API-driven architecture without requiring an external backend server process during local frontend development and testing, an API-like client service layer backed by structured JSON was required.
- **Decision**:
  1. Centralized marketing data into [zozomarket-frontend/data/marketing-data.json](file:///c:/Users/ELCOT/Desktop/ZozoMarket/zozomarket-frontend/data/marketing-data.json).
  2. Created an asynchronous API client service in [zozomarket-frontend/lib/api.ts](file:///c:/Users/ELCOT/Desktop/ZozoMarket/zozomarket-frontend/lib/api.ts) with CRUD methods (`list`, `get`, `create`, `update`, `delete`, `bulkDelete`, `bulkAddTag`) and client-side persistence.
  3. Added Next.js App Router API route handlers under `/api/*` for standard HTTP REST request/response capabilities.
  4. Preserved all UI components, animations, styles, and color themes intact.
- **Consequences**:
  - Full separation between presentation components and data fetching.
  - Easy transition to a remote FastAPI backend in the future by simply swapping endpoints in `lib/api.ts`.
  - Zero external server dependencies required for frontend development and static builds.

## ADR-002: PostgreSQL for structured data, disk for files

- **Date**: 2026-10-17
- **Status**: Accepted
- **Context**: The API had been pointed at MySQL. The existing PostgreSQL database `zozomarket` is the store for accounts, campaigns, and other rows. Uploaded images are files, not database blobs.
- **Decision**:
  1. `DATABASE_URL` uses `postgresql+asyncpg` against database `zozomarket`. Alembic creates and alters tables. Tests stay on SQLite.
  2. Media files, including a workspace logo, stay under `zozomarket-backend/storage/media`. The database stores the URL.
  3. Workspace profile, brand, and sending defaults are columns on `workspaces`, loaded and saved through `GET`/`PATCH /api/v1/workspace` and `POST /api/v1/workspace/logo`.
- **Consequences**: Existing MySQL rows are not copied. A fresh signup is required against PostgreSQL.

## ADR-003: No AI copywriter in the product

- **Date**: 2026-10-17
- **Status**: Accepted
- **Context**: The dashboard, email builder, navigation, and API exposed an AI assistant, sample recommendations, and a copywriter backed by a mock or third-party model.
- **Decision**: Remove those screens, client methods, and the `/api/v1/ai` routes. Email composition stays in the visual builder.
- **Consequences**: `POST /ai/generate`, `/ai/subject-lines`, and `/ai/preheaders` are gone. OpenAI and Anthropic settings are no longer read.

## ADR-004: Email funnels reuse the existing send path

- **Date**: 2026-10-23
- **Status**: Accepted
- **Context**: Automations were a straight list of steps. A delay stored `next_run_at`, but the scheduler never resumed it, and there was no canvas.
- **Decision**:
  1. Store the canvas as `nodes` and `edges` on the automation. Activating copies that graph onto each new enrollment.
  2. One contact enters an automation once. Audience actions are tag add and tag remove.
  3. Resume waits from PostgreSQL on the existing scheduler. Do not add Redis for delays.
  4. The builder is a vertical flow, as in FluentCRM, ActiveCampaign, and Mailchimp Customer Journeys. Steps lay themselves out from the trigger, a + between steps adds the next one, and a condition splits into Yes and No columns that do not merge. It is plain React. The earlier `@xyflow/react` free canvas was removed (2026-10-23) because new steps landed off screen and every connection had to be dragged by hand.
  5. Order, cart, purchase, and website triggers stay visible and disabled.
- **Consequences**: People already in a funnel keep the graph they started with. A paused automation does not claim due rows. The stored graph is always a tree, so positions are computed rather than edited.
