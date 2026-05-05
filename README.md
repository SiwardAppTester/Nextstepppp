# Nextsteppp

Single-user AI task manager. Chat with a Claude-powered Coach that manages your todos,
schedules reminders, and remembers what matters. Calendar and tasks list are secondary surfaces.

Built per [`AI_TASK_MANAGER_SPEC.md`](./AI_TASK_MANAGER_SPEC.md).

## Status — Phase 1 (UI shell)

What works **right now**, with no external services:

- ✅ Dark, futuristic UI shell — sidebar nav, top bar, all four core surfaces
- ✅ `/login` magic-link form (UI only; backend wires next)
- ✅ `/chat` with mock Coach responses + tool-call chips + typing indicator
- ✅ `/tasks` with filtering by status and category, search
- ✅ `/calendar` month grid populated from mock data
- ✅ `/settings` for profile, categories, notifications, memory, data
- ✅ Supabase SQL migration written (`supabase/migrations/0001_init.sql`)

What's stubbed pending services:

- 🔌 Real magic-link auth → needs Supabase project + `OWNER_EMAIL`
- 🔌 Real CRUD against the database → needs Supabase
- 🔌 Coach (`/api/chat`) → Phase 2 (needs Anthropic + Voyage)
- 🔌 Voice, Web Push, email reminders, cron → Phase 3 (needs Resend, VAPID)

## Quick start

```bash
npm run dev
# → http://localhost:3000
```

You'll be redirected to `/chat`. Try sending a message — you'll get a mock Coach reply.

## Wiring up Supabase (next step)

1. Create a Supabase project at https://supabase.com (free tier is fine).
2. In SQL Editor, run [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql).
3. In **Authentication → Providers**, enable Email + magic links.
4. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OWNER_EMAIL`
5. Restart `npm run dev`.

## Project layout

```
src/
  app/
    layout.tsx              Root shell (fonts, ambient background)
    page.tsx                Redirects to /chat
    globals.css             Design tokens (colors, shadows, glow)
    login/page.tsx
    (app)/                  Authed app group
      layout.tsx            Sidebar + frame
      chat/page.tsx
      tasks/page.tsx
      calendar/page.tsx
      settings/page.tsx
  components/
    ui/                     Primitives (Button, Card, Input, ...)
    app-sidebar.tsx
    topbar.tsx
    chat-message.tsx
    chat-composer.tsx
    task-row.tsx
  lib/
    utils.ts                cn() helper
    types.ts
    mock-data.ts            Replace with Supabase queries in Phase 1.5
supabase/
  migrations/
    0001_init.sql           Tables + RLS + pgvector + seed function
```

## Phase plan

- **Phase 1** — Foundation: UI shell, Supabase auth + manual CRUD (in progress)
- **Phase 2** — Coach: `/api/chat`, 12 tools, memory + Voyage embeddings, streaming
- **Phase 3** — Voice (Web Speech API), calendar drag-to-reschedule, Web Push, email
  reminders via Resend, Vercel Cron, recurring tasks

## Design notes

- **Vibe**: dark, futuristic, clean. Floating cards with depth via layered surfaces +
  soft shadows + selective accent glow on focus / active states.
- **Accent**: cyan-blue (`hsl(200 100% 62%)`) for the "alive" elements only —
  buttons, focus rings, the active nav item, the Coach avatar.
- **No gradients** beyond one ambient backdrop wash and hover transitions.
- **Type**: Geist Sans + tabular figures for numerics.

Want to tweak the look? Edit `src/app/globals.css` — all design tokens live in the
`@theme` block at the top.
