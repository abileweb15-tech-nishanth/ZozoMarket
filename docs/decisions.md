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
