# ZozoMarket Frontend Architecture & Structure Guide (Email Marketing Edition)

This document provides a comprehensive breakdown of the `zozomarket-frontend` codebase, detailing the folder structure, file responsibilities, design rationales (**Why**), and operational workflows (**How**).

---

## 1. Executive Summary & Architecture Philosophy

ZozoMarket is an AI-powered SaaS platform focused strictly on **Email Marketing**, delivering automated drip journeys, visual email building, audience CRM, and deep deliverability analytics.

*(Note: Social media marketing capabilities are phased out of this version and reserved for future updates).*

### Core Architectural Decisions:
1. **App Router Structure (`app/`)**: Leverages Next.js App Router route grouping `(app)` to apply a consistent responsive sidebar and header layout across all application pages without polluting URL paths.
2. **Decoupled Data Layer (`lib/api.ts` & `data/marketing-data.json`)**: UI components do not hardcode mock data or direct database queries. Instead, all features interact with an asynchronous service layer (`api.*`) that simulates network latency and persists state changes into browser storage. This guarantees an effortless future migration to the Python FastAPI backend.
3. **Atomic UI Component Hierarchy (`components/ui` vs `components/app`)**: Strict division between generic design system primitives (`components/ui/`) and domain-specific marketing widgets (`components/app/`).
4. **Tailwind CSS v4 & Theming**: Employs CSS custom properties with light/dark theme switching handled through `next-themes` and accessible contrast tokens.

---

## 2. Directory Map

```text
zozomarket-frontend/
├── app/                        # Next.js App Router root
│   ├── (app)/                  # Route group sharing the authenticated dashboard layout
│   │   ├── layout.tsx          # App shell: Sidebar + Header + Main content area
│   │   ├── dashboard/          # Email marketing command center & key performance indicators
│   │   ├── calendar/           # Email campaign calendar (newsletters, blasts, drips)
│   │   ├── email/              # Email marketing core features
│   │   │   ├── campaigns/      # Broadcasts list, status tracking, open & click rates
│   │   │   ├── builder/        # Visual drag-and-drop / block-based email editor
│   │   │   ├── templates/      # Pre-built email template gallery
│   │   │   └── automations/    # Visual drip sequences & automated customer journeys
│   │   ├── contacts/           # Audience CRM, tags, filters, and subscriber management
│   │   ├── forms/              # Lead capture forms & landing pages
│   │   ├── ai-assistant/       # AI Email copywriter (subject lines, headers, body drafts)
│   │   ├── media/              # Media asset library (images, banners, logos for emails)
│   │   ├── analytics/          # Email delivery, open rates, click-through engagement
│   │   ├── integrations/       # External service connections (Shopify, Stripe, Zapier)
│   │   ├── settings/           # Workspace preferences and team settings
│   │   └── billing/            # Subscription plans, invoices, and payment methods
│   ├── api/                    # Next.js Server-side Route Handlers (REST endpoints)
│   │   ├── analytics/route.ts  # Email performance data endpoint
│   │   ├── calendar/route.ts   # Campaign events schedule endpoint
│   │   ├── campaigns/route.ts  # Email campaigns CRUD endpoint
│   │   ├── contacts/route.ts   # Subscriber management CRUD endpoint
│   │   └── dashboard/route.ts  # Executive dashboard KPIs endpoint
│   ├── globals.css             # Tailwind v4 theme variables & utility styles
│   ├── layout.tsx              # Root HTML/Body layout with theme provider & toasts
│   └── page.tsx                # Root index page (redirects to /dashboard)
├── components/                 # Reusable UI components
│   ├── app/                    # Domain-specific components
│   │   ├── app-header.tsx      # Top bar (search, quick actions, user profile, theme toggle)
│   │   ├── app-sidebar.tsx     # Navigation sidebar with collapsible sections
│   │   ├── charts.tsx          # Recharts wrappers (TrendChart, BarsChart)
│   │   ├── create-new-menu.tsx # Quick-action dropdown (+ Create Campaign, Automation, Contact)
│   │   ├── logo.tsx            # ZozoMarket brand SVG icon and typography
│   │   ├── shared.tsx          # Shared UI widgets (PageHeader, KpiCard, Panel, StatusBadge, etc.)
│   │   └── theme-toggle.tsx    # Light/Dark mode switcher button
│   └── ui/                     # Design system primitives (shadcn/ui & @base-ui/react)
│       ├── badge.tsx, button.tsx, card.tsx, checkbox.tsx, dialog.tsx,
│       ├── dropdown-menu.tsx, input.tsx, label.tsx, progress.tsx,
│       ├── select.tsx, separator.tsx, sheet.tsx, sonner.tsx, switch.tsx,
│       ├── table.tsx, tabs.tsx, textarea.tsx
├── data/
│   └── marketing-data.json     # Central mock database simulating email marketing backend records
├── lib/
│   ├── api.ts                  # Client-side API abstraction service & TypeScript types
│   ├── mock-data.ts            # Type-safe exports and formatting utilities
│   ├── nav.ts                  # Sidebar navigation groupings and route definitions
│   └── utils.ts                # ClassName helper `cn()` merging clsx and tailwind-merge
├── public/                     # Static assets (favicons, placeholder images, icons)
├── components.json             # shadcn/ui configuration file
├── next.config.mjs             # Next.js build and image optimization settings
├── package.json                # Project dependencies, scripts, and package metadata
├── postcss.config.mjs          # PostCSS configuration for Tailwind v4
└── tsconfig.json               # TypeScript configuration with `@/*` path alias
```

---

## 3. Deep-Dive into Directories & Files

### A. The Routing Layer (`app/`)

Next.js App Router uses folder-based routing where every directory containing a `page.tsx` becomes a reachable URL route.

#### 1. Root Files
- **`app/layout.tsx`**:
  - **Why**: Establishes global HTML document attributes (`<html lang="en">`), font definitions, theme provider wrapping (`next-themes`), and the global notification toast container (`<Toaster />`).
  - **How**: It executes on the server and wraps every page in the application.
- **`app/page.tsx`**:
  - **Why**: The root landing URL `/`.
  - **How**: Performs a server-side `redirect('/dashboard')` to immediately guide users to their email marketing command center.
- **`app/globals.css`**:
  - **Why**: Defines all design system color tokens using modern CSS custom properties (supporting light and dark mode) and imports `@import "tailwindcss";` for Tailwind v4.

#### 2. The `(app)` Route Group
Parenthesis notation `(app)` defines an App Router **Route Group**. It does *not* appear in the browser URL path (e.g., `app/(app)/dashboard` resolves to `/dashboard`, not `/(app)/dashboard`).
- **`app/(app)/layout.tsx`**:
  - **Why**: Provides a unified shell layout containing `<AppSidebar />` on the left and `<AppHeader />` with `<main>{children}</main>` on the right.
  - **How**: Renders once for all sub-routes. When navigating between `/dashboard`, `/email/campaigns`, and `/analytics`, the sidebar and header remain mounted without re-rendering or losing scroll state.

#### 3. Core Feature Pages (`app/(app)/*`)
- **`dashboard/page.tsx`**: Email marketing command center featuring:
  - High-level KPIs: Emails Delivered (95k), Delivery Rate (98.8%), Avg. Open Rate (39.8%), Avg. Click Rate (6.1%), Total Subscribers (18.4k), Scheduled Campaigns, Active Automations.
  - 6-week Email Performance Trend line chart (Delivered, Opens, Clicks).
  - Campaign open-rate vs click-rate bar comparison.
  - Recent Campaigns and Upcoming Scheduled Email Dispatches tables.
- **`calendar/page.tsx`**: Campaign Calendar tracking all scheduled email dispatches across dates and times. Filterable by type (*Newsletter*, *Promotional*, *Automated*, *Announcement*) in Month and List views.
- **`email/campaigns/page.tsx`**: Email broadcast manager tracking campaign statuses (*Draft*, *Scheduled*, *Sending*, *Sent*, *Failed*), audience segments, recipient counts, delivery rates, and open/click percentages.
- **`email/builder/page.tsx`**: Visual email editor allowing users to assemble emails using blocks (header, text, image, button, columns), preview live across devices, and test send.
- **`email/templates/page.tsx`**: Gallery of responsive pre-designed email templates (welcome emails, promotional blasts, product announcements).
- **`email/automations/page.tsx`**: Visual drip automation builder for customer lifecycle journeys (welcome drip series, abandoned cart recovery, re-engagement).
- **`contacts/page.tsx`**: Audience CRM with bulk tagging, bulk deletion, search, subscriber status filters (*Subscribed*, *Pending*, *Unsubscribed*), and contact creation dialog.
- **`forms/page.tsx`**: Lead capture forms and newsletter signup landing pages with conversion tracking.
- **`ai-assistant/page.tsx`**: AI Email Copywriter generating subject lines, preview text, headers, and body drafts tailored by email format (*Newsletter*, *Promotional Blast*, *Welcome Sequence*, *Announcement*) with 1-click export directly to the Email Builder.
- **`media/page.tsx`**: Digital asset manager for uploading, organizing, and selecting images and graphics used in email campaigns.
- **`analytics/page.tsx`**: Dedicated Email Analytics analyzing delivery health, weekly opens and clicks, and top-performing email campaigns.
- **`integrations/page.tsx`**: E-commerce and CRM connectors (Shopify, Stripe, Zapier, WordPress).
- **`settings/page.tsx`**: Workspace configuration, sender email domain verification, team roles, and notifications.
- **`billing/page.tsx`**: Subscription plans (Pro Plan), payment methods, and invoice records.

#### 4. Server-Side REST Endpoints (`app/api/*`)
- **`api/analytics/route.ts`**: Returns weekly email delivery and click performance metrics.
- **`api/calendar/route.ts`**: Returns scheduled email calendar events.
- **`api/campaigns/route.ts`**: GET/POST endpoints for email campaign records.
- **`api/contacts/route.ts`**: GET/POST endpoints for subscriber contact management.
- **`api/dashboard/route.ts`**: Summary endpoint providing dashboard KPIs, recent campaigns, and upcoming events.

---

### B. The Component Architecture (`components/`)

#### 1. Generic UI Primitives (`components/ui/`)
- Headless, accessible primitives styled with Tailwind CSS: `Button`, `Dialog`, `DropdownMenu`, `Input`, `Select`, `Table`, `Tabs`, `Switch`, `Badge`.
- Built on `@base-ui/react` and Radix standards.

#### 2. Domain Components (`components/app/`)
- **`app-header.tsx`**: Search input, workspace switcher, notification drawer, and theme toggle.
- **`app-sidebar.tsx`**: Collapsible vertical navigation based on `lib/nav.ts`.
- **`create-new-menu.tsx`**: "+ Create New" action menu with shortcuts (*Create Campaign*, *New Automation*, *Add Contact*, *Write with AI*).
- **`charts.tsx`**: Recharts wrappers (`TrendChart`, `BarsChart`) with theme-aware colors and responsive SVG containers.
- **`shared.tsx`**: Reusable design system widgets (`PageHeader`, `KpiCard`, `Panel`, `StatusBadge`, `SearchInput`, `NativeSelect`, `Segmented`, `TableWrap`, `EmptyState`, `ConfirmDialog`).

---

### C. Data & State Layer (`lib/` & `data/`)

#### 1. Central Data Source (`data/marketing-data.json`)
- Clean JSON dataset containing email campaigns, subscriber contacts, campaign events, templates, media assets, and delivery performance metrics.

#### 2. Async Client Service (`lib/api.ts`)
- Async service isolating UI pages from the transport layer.
- Methods: `api.dashboard.getKPIs()`, `api.campaigns.*`, `api.contacts.*`, `api.calendar.*`, `api.analytics.*`, `api.media.*`.
- Persists mutations in browser `localStorage`.
- Ready to be swapped for real Python FastAPI backend calls without touching React component code.

---

## 4. How Development & Build Work

```bash
# Start development server
pnpm run dev

# Run production build validation
pnpm run build
```
All routes compile statically or dynamically with Turbopack for optimal performance.
