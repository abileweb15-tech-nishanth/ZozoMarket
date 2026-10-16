# ZozoMarket System Architecture

## Overview
ZozoMarket is an integrated marketing SaaS application delivering unified Email and Social Media marketing management.

## Architecture Blueprint

```
+-------------------------------------------------------------------------------+
|                               ZozoMarket Client                               |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  |                           Next.js App Router                            |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  |  |   Dashboard & KPI  |  |   Email Marketing    |  |  Social Media   |  |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  |  |   Contacts & CRM   |  |  Forms & Lead Gen    |  |  AI Assistant   |  |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  |  |  Unified Calendar  |  |  Cross-Analytics     |  | Media Library   |  |  |
|  |  +--------------------+  +----------------------+  +-----------------+  |  |
|  +-------------------------------------------------------------------------+  |
|                                     |                                         |
|  +-------------------------------------------------------------------------+  |
|  |                      UI Layer (Components & Design)                     |  |
|  |  - components/app: Domain widgets (AppSidebar, AppHeader, Charts, Panel)|  |
|  |  - components/ui:  Atoms & Primitives (Button, Dialog, Table, Input)    |  |
|  |  - Tailwind CSS v4 + next-themes (OKLCH palette & Theme Variables)      |  |
|  +-------------------------------------------------------------------------+  |
|                                     |                                         |
|  +-------------------------------------------------------------------------+  |
|  |                    Data Layer (Decoupled Client API)                    |  |
|  |  - lib/api.ts: Async REST Client service interface                      |  |
|  |  - Browser LocalStorage persistence                                     |  |
|  |  - data/marketing-data.json: Structured mock dataset                    |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
                                      |
                           (Future API Integration)
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                           ZozoMarket Python Backend                           |
|  - FastAPI REST Endpoints                                                     |
|  - SQLAlchemy / PostgreSQL Database                                           |
|  - AI Agent Integrations (LLM orchestration)                                  |
|  - Background Job Workers (Celery / Redis)                                    |
+-------------------------------------------------------------------------------+
```

## Detailed Documentation
For detailed frontend file maps and directory explanations, refer to [docs/frontend.md](./frontend.md).
