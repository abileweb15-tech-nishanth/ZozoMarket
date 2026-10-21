# Error Log

## Entry: 2026-10-14 - Tailwind v4 Build Error: Cannot resolve 'shadcn/tailwind.css'

- **Date**: 2026-10-14
- **Error or symptom**:
  ```text
  Build Error
  Error evaluating Node.js code
  CssSyntaxError: tailwindcss: C:\Users\ELCOT\Desktop\ZozoMarket\zozomarket-frontend\app\globals.css:1:1: Can't resolve 'shadcn/tailwind.css' in 'C:\Users\ELCOT\Desktop\ZozoMarket\zozomarket-frontend\app'
  ```
- **Root cause**:
  `zozomarket-frontend/package.json` had `"shadcn": "^1.0.0"`. This constrained npm/pnpm to install legacy `shadcn@1.0.0` (a 2023 placeholder release containing only an empty `index.js`). In Tailwind CSS v4, `app/globals.css` imports `@import 'shadcn/tailwind.css'`, which is exported starting from modern `shadcn` CLI (version 4.x+ at `./dist/tailwind.css`). Because version 1.0.0 lacked this export and file, Turbopack and `@tailwindcss/postcss` failed to resolve the stylesheet during build/dev evaluation.
- **Solution**:
  Updated the `shadcn` package to the latest version (`^4.21.4`) via `pnpm add shadcn@latest`. Verified that `node_modules/shadcn/dist/tailwind.css` is present and satisfies the module export `./tailwind.css`.
- **Files affected**:
  - `zozomarket-frontend/package.json`
  - `zozomarket-frontend/pnpm-lock.yaml`
- **Tests performed**:
  - `pnpm exec tsc --noEmit` (TypeScript validation)
  - `pnpm run build` (Next.js 16.4.0 Turbopack production build)
- **Verification result**:
  Build succeeded completely (`Compiled successfully in 17.3s`, all 21 static pages generated with 0 errors).

## Entry: 2026-10-20 - Creating a form with a taken slug returned 500

- **Date**: 2026-10-20
- **Error or symptom**: `POST /api/v1/forms` returned `Internal server error` when the generated slug already belonged to another workspace.
- **Root cause**: The slug column is unique for the whole database. The uniqueness check only saw the signed-in workspace, so it treated another workspace's slug as free and the insert raised a unique violation.
- **Solution**: Slug lookups in `create_form`, `update_form`, and `_unique_slug` use `include_all_workspaces`. A colliding name gets a different slug.
- **Files affected**:
  - `zozomarket-backend/app/services/form_service.py`
  - `zozomarket-backend/tests/test_forms.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_forms.py -q`
- **Verification result**: `pytest tests/test_forms.py -q` — 7 passed.

## Entry: 2026-10-20 - Dashboard mail counts were shared across accounts

- **Date**: 2026-10-20
- **Error or symptom**: Every signed-in workspace saw the same sent, delivered, and open numbers.
- **Root cause**: Mailtrap stats are one shared sending log. The dashboard replaced each workspace's own counts with that log.
- **Solution**: Only the workspace for `mnishanthkumar2@gmail.com` reads the Mailtrap log. Other workspaces keep the counts from mail they sent.
- **Files affected**:
  - `zozomarket-backend/app/services/analytics_service.py`
  - `zozomarket-backend/tests/test_insights.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_insights.py -q`
- **Verification result**: `pytest tests/test_insights.py -q` — 6 passed.
