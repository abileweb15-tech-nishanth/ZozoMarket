# ZozoMarket System Architecture

## Overview
ZozoMarket is an enterprise-grade marketing SaaS application focused on automated, high-converting Email Marketing.

## Architecture Blueprint

```text
+-------------------------------------------------------------------------------+
|                        ZozoMarket Client (Next.js 16)                         |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  |                           Next.js App Router                            |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  |  |   Dashboard & KPI  |  |   Email Campaigns    |  | Email Automation |  |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  |  |   Contacts & CRM   |  |  Forms & Lead Gen    |  |  Media Library  |  |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  |  | Campaign Calendar  |  | Deliverability Stats |  | Workspace       |  |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  +-------------------------------------------------------------------------+  |
|                                     |                                         |
|  +-------------------------------------------------------------------------+  |
|  |                      UI Layer (Components & Design)                     |  |
|  |  - components/app: Domain widgets (AppSidebar, AppHeader, Charts, Panel)|  |
|  |  - components/ui:  Atoms & Primitives (Button, Dialog, Table, Input)    |  |
|  |  - Tailwind CSS v4 + next-themes (Light & Dark theme variables)         |  |
|  +-------------------------------------------------------------------------+  |
|                                     |                                         |
|  +-------------------------------------------------------------------------+  |
|  |                    Data Layer (Decoupled Client API)                    |  |
|  |  - lib/api.ts: REST client for the FastAPI /api/v1 routes               |  |
|  |  - JWT session in the browser; rows come from PostgreSQL                |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
                                      |
                         (REST API: http://localhost:8000)
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                      ZozoMarket Python Backend (FastAPI)                      |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  |                      FastAPI REST Routers (/api/v1)                     |  |
|  |  - /auth, /workspace: Account, brand, and sending identity              |  |
|  |  - /dashboard, /analytics: KPIs; Mailtrap stats when that provider is on|  |
|  |  - /campaigns, /templates, /automations: send, schedule, and funnels    |  |
|  |  - /contacts, /forms, /media, /calendar                             |  |
|  |  - /t/* and /webhooks/email: Opens, clicks, unsubscribe, bounces        |  |
|  +-------------------------------------------------------------------------+  |
|                                     |                                         |
|  +-------------------------------------------------------------------------+  |
|  |                           Service Layer                                 |  |
|  |  - campaign, template, automation, contact, form, media, workspace      |  |
|  |  - email_service.py: console, smtp, resend, mailtrap                    |  |
|  |  - analytics_service.py and mailtrap_stats.py: local and Mailtrap totals|  |
|  +-------------------------------------------------------------------------+  |
|                                     |                                         |
|  +-------------------------------------------------------------------------+  |
|  |                     Database & Background Workers                       |  |
|  |  - Database: PostgreSQL (asyncpg). SQLite is used only by the test suite |  |
|  |  - Scheduler resumes due campaigns and automation waits from Postgres   |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

## Detailed Documentation
- Backend services, endpoints, schemas, and tests: [docs/backend.md](./backend.md).
- Frontend guide: [docs/frontend.md](./frontend.md).
- Decisions: [docs/decisions.md](./decisions.md).
- Verified bug fixes: [docs/error-log.md](./error-log.md).

## Documentation and test workflow
Any change to API behavior, a schema, a service, or a test updates [docs/backend.md](./backend.md) in the same change, including the test map. Frontend structure changes update [docs/frontend.md](./frontend.md). Run the relevant pytest files and record the command and result. Do not mark a test as passed unless it ran.
