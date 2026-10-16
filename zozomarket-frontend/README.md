# ZozoMarket — Email Marketing Frontend

Modern, high-converting Email Marketing SaaS application built with Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons, and shadcn/ui.

## Focus & Scope: Email Marketing Platform

This application is strictly focused on **Email Marketing**:
- **Campaign Management**: Broadcast creation, scheduling, status tracking, and recipient targeting.
- **Visual Email Builder**: Block-based template editor with responsive live preview.
- **Email Automations**: Visual drip sequences, trigger rules, and customer onboarding flows.
- **Templates Gallery**: Pre-built layouts for newsletters, product launches, flash sales, and announcements.
- **Campaign Calendar**: Monthly and list-view schedule of upcoming email dispatches.
- **AI Email Copywriter**: Intelligent assistant generating high-converting subject lines, preheaders, and email copy.
- **Audience & Contacts**: Subscriber management, tags, CSV import, and segment filtering.
- **Lead Capture Forms**: Embeddable newsletter signup forms and landing pages.
- **Email Analytics**: Open rates, click-through rates, bounce tracking, and performance over time.

*(Note: Social media marketing features are reserved for future releases).*

## Tech Stack

- **Framework**: Next.js 16 (App Router with Turbopack)
- **UI Library**: React 19
- **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss`) with CSS custom properties
- **Components**: shadcn/ui (`@base-ui/react`), Sonner toasts, Lucide icons
- **Data Visualization**: Recharts
- **Theme**: Light & Dark mode support via `next-themes`
- **Data Layer**: Simulated async REST API client layer (`lib/api.ts`) backed by structured dataset (`data/marketing-data.json`) and Next.js App Router API endpoints (`app/api/*`)

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Run Development Server

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser. The root path automatically redirects to `/dashboard`.

### 3. Production Build

```bash
pnpm run build
pnpm run start
```

## Documentation

- [docs/frontend.md](../docs/frontend.md) — Comprehensive guide to the folder structure, architecture, and file explanations.
- [docs/architecture.md](../docs/architecture.md) — System architecture diagram and backend integration points.
- [docs/decisions.md](../docs/decisions.md) — Architecture decision records.
- [docs/error-log.md](../docs/error-log.md) — Error investigation and resolutions log.
