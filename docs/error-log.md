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
