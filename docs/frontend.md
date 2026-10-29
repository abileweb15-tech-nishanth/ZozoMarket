# ZozoMarket Frontend Architecture & Structure Guide (Email Marketing Edition)

This document provides a comprehensive breakdown of the `zozomarket-frontend` codebase, detailing the folder structure, file responsibilities, design rationales (**Why**), and operational workflows (**How**).

---

## 1. Executive Summary & Architecture Philosophy

ZozoMarket is an email marketing SaaS platform, delivering automated drip journeys, visual email building, audience CRM, and deep deliverability analytics.

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
│   ├── f/[slug]/               # Public form link. A live signup is stored as a contact.
│   ├── (auth)/                 # Sign in and account creation. No app sidebar.
│   ├── (app)/                  # Route group sharing the authenticated dashboard layout
│   │   ├── layout.tsx          # App shell: Sidebar + Header + Main content area
│   │   ├── dashboard/          # Email marketing command center & key performance indicators
│   │   ├── calendar/           # Email campaign calendar (newsletters, blasts, drips)
│   │   ├── email/              # Email marketing core features
│   │   │   ├── campaigns/      # Broadcasts list, status tracking, open & click rates
│   │   │   ├── builder/        # Visual drag-and-drop / block-based email editor
│   │   │   └── templates/      # Saved layouts. Edit updates the template; Use Template starts a campaign
│   │   ├── contacts/           # Audience CRM, tags, filters, and subscriber management
│   │   ├── forms/              # Lead capture forms & landing pages
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
│   │   ├── app-header.tsx      # Top bar (breadcrumb, workspace name, theme toggle, account menu)
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

#### 2. Account pages (`app/(auth)/*`)
- **`login/page.tsx`**: Sign in with the email and password chosen on account creation. The email field is focused first. A missing or invalid email, or a missing password, is shown on the field. A rejected sign-in stays on the form. An existing session opens the dashboard.
- **`signup/page.tsx`**: Creates the account and the workspace in three steps, using the same fields Workspace Settings needs. **Account**: name, sign-in email, password entered twice (at least 8 characters, with a strength meter). **Workspace**: workspace name, optional website, time zone, and physical mailing address. **Sending**: from name, from email, and optional reply-to. Continue validates the current step only. Back keeps what was typed. Workspace name, from name, and from email fill from the account step when those fields are still empty. Time zone defaults to the browser zone when it is one of UTC, Asia/Kolkata, America/New_York, America/Los_Angeles, or Europe/London, otherwise UTC. An existing session opens the dashboard.
- **`components/app/auth-screen.tsx`**: Shared layout for both pages. Desktop shows a short product panel beside the form. Signup uses a wider card and a step indicator. Passwords can be shown or hidden.

#### 3. The `(app)` Route Group
Parenthesis notation `(app)` defines an App Router **Route Group**. It does *not* appear in the browser URL path (e.g., `app/(app)/dashboard` resolves to `/dashboard`, not `/(app)/dashboard`).
- **`app/(app)/layout.tsx`**:
  - **Why**: Provides a unified shell layout containing `<AppSidebar />` on the left and `<AppHeader />` with `<main>{children}</main>` on the right.
  - **How**: Renders once for all sub-routes. When navigating between `/dashboard`, `/email/campaigns`, and `/analytics`, the sidebar and header remain mounted without re-rendering or losing scroll state.

#### 4. Core Feature Pages (`app/(app)/*`)
- **`dashboard/page.tsx`**: Email marketing command center featuring:
  - High-level KPIs: emails delivered, delivery rate, open rate, click rate, subscribers, and scheduled campaigns. The three rate cards also show the count (`4 of 4 sent`, `4 opened`, `0 clicked`). The Email Analytics page shows the same open and click lines.
  - 6-week Email Performance Trend line chart (Delivered, Opens, Clicks).
  - Campaign open-rate vs click-rate bar comparison.
  - Recent Campaigns and Upcoming Scheduled Email Dispatches tables.
- **`calendar/page.tsx`**: Campaign Calendar tracking all scheduled email dispatches across dates and times. Filterable by type (*Newsletter*, *Promotional*, *Automated*, *Announcement*) in Month and List views.
- **`email/campaigns/page.tsx`**: Email broadcast manager. Create Email Campaign opens the email builder. Each saved draft appears here, and its name or Edit opens that campaign in the builder. Draft and Scheduled rows can change status. The builder is not a sidebar item.
- **`email/builder/page.tsx`**: Visual email editor and an HTML code editor. The first edit in Code makes that HTML the email. Visual, Preview, and save all use it, and a slow block render cannot replace it. Switching back to Code keeps the same HTML. Saving clears the block design so a test send and a schedule send the HTML. Save as template stores that HTML. **Use the previous blocks** returns to the block canvas, and the next save sends those blocks. Save draft stores the campaign and opens the campaign list. A campaign created from a template shows **Update template**, which writes the current HTML or blocks back to that template. Opening `/email/builder?template=` edits the saved template itself: autosave and **Save template** call `PATCH /templates/{id}` with the same HTML-source rules, then return to the gallery. Schedule chooses all subscribers, contact tags, or a form's tags, then a date and time.
- **`email/templates/page.tsx`**: Gallery of saved and starter layouts. **Edit** on a saved template opens the builder for that template and saves HTML back onto it. Use Template still creates a draft campaign and opens the builder. Preview for a saved template fetches `/preview.html` again, so the dialog and the card show the HTML that was just saved. An HTML template opens in Code with that HTML. Delete removes a saved template. Starter layouts stay.
- **`email/automations/page.tsx`**: Search, status filter, and a table of funnels (name, trigger, status, enrolled, completed, updated). New automation opens the builder. Row actions edit, duplicate, activate, pause, archive, send a test of the first email on the flow, and delete.
- **`email/automations/[id]/page.tsx`**: Loads `components/automations/builder.tsx`, a vertical flow that starts at the trigger and lays itself out. A + between steps opens a picker grouped as Messages, Timing, Conditions, Contact actions, and Exit. A new step goes between the step above and the step below. A condition splits into Yes and No columns; the steps that were below it continue on Yes, and No gets an End. Deleting a step joins the steps around it. Deleting a condition removes both branches. End can only go at the end of a path. Steps the trigger cannot reach (from older drafts) are listed as Unconnected steps with Move onto the flow and Delete. Clicking a step opens a side drawer with its settings. After each save, `POST /validate` marks steps that need fixing with a red count and lists the rest in a banner. Activate saves first and runs only when nothing needs fixing. Active funnels show Save changes and Pause. The browser warns before leaving with unsaved changes.
- **`components/automations/email-step.tsx`**: Email step drawer. Subject, then Template or Write HTML. Template shows thumbnails of saved templates and starter layouts. Picking a starter saves a copy with `api.templates.create` and uses it. A template fills the subject when it is empty. The preview shows the chosen template or the HTML. Send test saves the draft, then sends this step to one address with `api.automations.test(id, email, nodeId)`.
- **`email/automations/[id]/activity/page.tsx`**: Enrollment counts, people in the funnel with their current step name and next run time, and a step log with contact, step name, readable action, and result.
- **`contacts/page.tsx`**: Audience CRM with bulk tagging, bulk deletion, search, subscriber status filters (*Subscribed*, *Pending*, *Unsubscribed*), and contact creation dialog. The Collected column shows answers stored from a form.
- **`forms/page.tsx`**: Signup forms, embedded forms, and popup forms. Landing pages are the same as signup forms, so they are listed and saved as signup forms. Each row has its own link, `/f/{slug}`, with Copy and Open. Edit opens the saved form so the title, fields, tags, and success message can be updated. Delete removes the form and leaves existing contacts. Set Live publishes the link.
- **`media/page.tsx`**: Digital asset manager for uploading, organizing, and selecting images and graphics used in email campaigns. Delete asks for confirmation, then removes the file.
- **`analytics/page.tsx`**: Dedicated Email Analytics analyzing delivery health, weekly opens and clicks, and top-performing email campaigns.
- **`integrations/page.tsx`**: E-commerce and CRM connectors (Shopify, Stripe, Zapier, WordPress).
- **`profile/page.tsx`**: Name, workspace name, and password. **Delete account** asks for the current password, then calls `DELETE /auth/me`, clears the session, and opens sign-in. A wrong password stays on the dialog.
- **`settings/page.tsx`**: Workspace configuration, sender email domain verification, team roles, and notifications.
- **`billing/page.tsx`**: Subscription plans (Pro Plan), payment methods, and invoice records.

#### 5. Server-Side REST Endpoints (`app/api/*`)
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
- **`app-header.tsx`**: Breadcrumb, workspace name, help, theme toggle, and account menu.
- **`app-sidebar.tsx`**: Collapsible vertical navigation based on `lib/nav.ts`. Email Marketing lists Email Campaigns, Email Templates, and Email Automation. The builder opens from Create Email Campaign. The funnel builder opens from Email Automation.
- **`create-new-menu.tsx`**: "+ Create New" action menu with shortcuts (*Create Campaign*, *New Automation*, *Add Contact*).
- **`charts.tsx`**: Recharts wrappers (`TrendChart`, `BarsChart`) with theme-aware colors and responsive SVG containers.
- **`shared.tsx`**: Reusable design system widgets (`PageHeader`, `KpiCard`, `Panel`, `StatusBadge`, `SearchInput`, `NativeSelect`, `Segmented`, `TableWrap`, `EmptyState`, `ConfirmDialog`).

---

### C. Data & State Layer (`lib/` & `data/`)

#### 1. Central Data Source (`data/marketing-data.json`)
- Clean JSON dataset containing email campaigns, subscriber contacts, campaign events, templates, media assets, and delivery performance metrics.

#### 2. Async Client Service (`lib/api.ts`)
- Async service isolating UI pages from the transport layer.
- Methods: `api.dashboard.getKPIs()`, `api.campaigns.*`, `api.contacts.*`, `api.forms.list/create/update/delete/submit`, `api.automations.*`, `api.calendar.*`, `api.analytics.*`, `api.media.*`.
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
