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

## Entry: 2026-10-21 - Pasted HTML disappeared when leaving Code

- **Date**: 2026-10-21
- **Error or symptom**: Pasting HTML in the email builder Code editor, then switching to Visual, still showed the old blocks. Opening Code again replaced the paste with the HTML rendered from those blocks.
- **Root cause**: Visual always rendered the block list. Opening Code always called the block renderer and replaced the textarea.
- **Solution**: After the HTML is edited, Visual shows that HTML, and Code keeps the same text. Saving stores the HTML with an empty block design. **Use the previous blocks** is the step that returns to the block canvas.
- **Files affected**:
  - `zozomarket-frontend/app/(app)/email/builder/page.tsx`
  - `docs/frontend.md`
  - `docs/backend.md`
- **Tests performed**:
  - Browser: open a draft, switch to Code, paste HTML with the heading “Pasted studio heading”, switch to Visual, switch back to Code, and read the saved campaign.
- **Verification result**: Visual showed the pasted HTML. Code still contained “Pasted studio heading” and “Kept after visual.” The saved campaign had that HTML and an empty design.

## Entry: 2026-10-21 - HTML emails could not be saved as templates

- **Date**: 2026-10-21
- **Error or symptom**: Save as template was unavailable while the email was custom HTML. A saved HTML template also could not come back as that HTML.
- **Root cause**: The builder disabled Save as template for custom HTML and only sent the block design. Use Template always created a campaign from blocks, and an empty design was given a footer block that replaced the HTML.
- **Solution**: Save as template stores the HTML with an empty design. Use Template creates the campaign from that HTML, and the builder opens it in Code.
- **Files affected**:
  - `zozomarket-frontend/app/(app)/email/builder/page.tsx`
  - `zozomarket-frontend/app/(app)/email/templates/page.tsx`
  - `zozomarket-frontend/lib/api.ts`
  - `zozomarket-backend/tests/test_templates_media.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_templates_media.py -q`
  - Browser: paste HTML, save it as “Saved code template”, then Use Template.
- **Verification result**: `pytest tests/test_templates_media.py -q` — 5 passed. The saved template stored the HTML with an empty design. Use Template opened Code with `<h1>Saved code template</h1>`.
