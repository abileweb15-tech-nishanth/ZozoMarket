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

## Entry: 2026-10-27 - Edited HTML reverted to the old blocks

- **Date**: 2026-10-27
- **Error or symptom**: Changing the HTML in Code, then opening Visual or Preview, showed the email from before the edit. Opening Code again could put the old HTML back.
- **Root cause**: The builder kept the block list and the HTML as two copies. Leaving Code saved the blocks, and the API rebuilt `html` from them. A block render that finished after typing replaced the textarea.
- **Solution**: The first Code edit marks the HTML as the only source for Visual, Preview, and save. A late render is ignored. **Use the previous blocks** is what returns to the block canvas. An update that does not send a design leaves saved HTML in place.
- **Files affected**:
  - `zozomarket-frontend/app/(app)/email/builder/page.tsx`
  - `zozomarket-frontend/components/automations/email-step.tsx`
  - `zozomarket-backend/tests/test_campaigns.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_campaigns.py -q`
- **Verification result**: `pytest tests/test_campaigns.py -q` — 10 passed. Saved HTML stays after a rename. Sending a design again replaces it with the block HTML.

## Entry: 2026-10-28 - Saved template preview kept the original HTML

- **Date**: 2026-10-28
- **Error or symptom**: Editing a saved template’s HTML, then previewing that template, still showed the HTML from before the edit.
- **Root cause**: Use Template copied the layout into a new campaign and never wrote the template. The gallery also kept the first preview it loaded. The app had no call to `PATCH /templates/{id}`.
- **Solution**: Edit opens the builder on the saved template and saves `html` with an empty design when Code is the source. Preview fetches `/preview.html` again and replaces the card thumbnail. A campaign that came from a template can write the current email back with Update template.
- **Files affected**:
  - `zozomarket-frontend/app/(app)/email/builder/page.tsx`
  - `zozomarket-frontend/app/(app)/email/templates/page.tsx`
  - `zozomarket-frontend/lib/api.ts`
  - `zozomarket-backend/tests/test_templates_media.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_templates_media.py -q`
- **Verification result**: `pytest tests/test_templates_media.py -q` — 6 passed. Edit opened Saved code template in Code. After the heading was changed to “Edited template heading”, the saved template stored that HTML with an empty design, the gallery card showed it, and `preview.html` returned it. Autumn note was left unchanged.

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

## Entry: 2026-10-23 - A waiting automation never resumed

- **Date**: 2026-10-23
- **Error or symptom**: A delay step stored `next_run_at` on the enrollment, and the contact stayed there after the wait elapsed.
- **Root cause**: `scheduler_tick` claimed due campaigns and never called `process_due_enrollments`.
- **Solution**: The same tick claims due enrollments for Active automations and continues the graph. Pause leaves those rows unclaimed. Tag changes during a tick use the contact's workspace.
- **Files affected**:
  - `zozomarket-backend/app/workers/jobs.py`
  - `zozomarket-backend/app/services/automation_service.py`
  - `zozomarket-backend/tests/test_automations.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_automations.py -q`
- **Verification result**: `pytest tests/test_automations.py -q` — 4 passed. The funnel test sends, waits, resumes on a later tick, and takes the click branch.

## Entry: 2026-10-23 - New automation steps landed off screen, and the test ignored the chosen email

- **Date**: 2026-10-23
- **Error or symptom**: Adding a step from the left list placed the box below the visible canvas. An email step could not use a saved template. The test sent the first email by list order, not the one the user built or picked.
- **Root cause**: The free canvas placed new nodes at a fixed offset under the last node. The email settings had only subject and HTML fields. `send_test` took the first Email node in `nodes` and ignored the edges.
- **Solution**: The builder is now a vertical flow. Each step has a + button below it, positions are computed, and a Condition splits into Yes and No columns. The email drawer shows saved and starter templates with previews. `/test` takes a `nodeId` and sends that step. Without a `nodeId`, it sends the first email reached from the trigger along the edges. The subject falls back to the template's subject, and a provider failure returns a readable 409. Tag steps without a tag fail validation.
- **Files affected**:
  - `zozomarket-frontend/lib/automation-tree.ts`
  - `zozomarket-frontend/components/automations/builder.tsx`
  - `zozomarket-frontend/components/automations/steps.ts`
  - `zozomarket-frontend/components/automations/email-step.tsx`
  - `zozomarket-backend/app/services/automation_service.py`
  - `zozomarket-backend/app/schemas/automation.py`
  - `zozomarket-backend/tests/test_automations.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_automations.py -q`
  - Browser: built trigger, email with Autumn note, wait 1 day, condition clicked, Yes add tag, No end. Saved, reloaded, activated, then cleared the subject on a written-HTML email.
- **Verification result**: `pytest tests/test_automations.py -q` — 5 passed. After reload the same tree appeared. Activate set the automation live. The cleared subject showed a red badge on the email card, and Activate was refused with "Fix 1 problem before activating". The test send reached Mailtrap, which refused the seeded `@example.com` owner address because demo domains only deliver to the Mailtrap account owner; the builder showed that message.

## Entry: 2026-10-26 - Open rate showed 175% after every email was opened

- **Date**: 2026-10-26
- **Error or symptom**: Four delivered emails that were all opened showed an average open rate of 175%.
- **Root cause**: SES CloudWatch counts every open event. The dashboard divided 7 events by 4 deliveries.
- **Solution**: Each SES day's opens and clicks are capped at that day's deliveries before the rate and the email-trend chart are built.
- **Files affected**:
  - `zozomarket-backend/app/services/analytics_service.py`
  - `zozomarket-backend/tests/test_insights.py`
- **Tests performed**:
  - `.venv\Scripts\python.exe -m pytest tests/test_insights.py tests/test_core.py -q`
- **Verification result**: `pytest tests/test_insights.py tests/test_core.py -q` — 20 passed. Seven open events and four deliveries produce an open rate of 100%, and the performance series reports 4 opens for that day.
