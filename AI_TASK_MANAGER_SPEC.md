# AI Task Manager — Build Specification

> A handover document for Claude Code. This file contains everything you need to build the project. No code — only specifications, decisions, and acceptance criteria.

---

## 1. Vision

A personal AI-powered task manager built for a single user. The primary interface is a **chat with an AI coach** (powered by Anthropic's Claude API). The coach manages todos, schedules reminders, organizes work across multiple life categories, remembers the user's preferences over time, and proactively suggests what to work on.

The product gets smarter the more it is used, because the AI builds a long-term memory about the user.

The chat is the front door. A calendar view and a tasks list view are secondary surfaces.

---

## 2. Tech Stack (locked in — do not substitute)

- **Framework**: Next.js (latest stable, App Router)
- **Hosting**: Vercel (Hobby tier is fine)
- **Database & Auth**: Supabase (Postgres + Auth + Realtime)
- **Vector search**: Supabase pgvector extension
- **AI**: Anthropic API, Claude Sonnet (latest), via the official Anthropic SDK
- **Streaming chat UI**: Vercel AI SDK
- **UI components**: shadcn/ui + Tailwind CSS
- **Notifications**: Web Push API (browser push) + Resend (email fallback)
- **Voice input**: Web Speech API (browser-native)
- **Cron jobs**: Vercel Cron
- **Embeddings**: Voyage AI (`voyage-3` or current best) — Anthropic's recommended provider

---

## 3. Audience & Auth Model

This is a **single-user** application. The owner is the only person who can sign in.

- Use Supabase Magic Link auth (email-based, passwordless).
- Gate sign-in by an `OWNER_EMAIL` environment variable. Reject any other email at the API layer.
- All tables still use Row-Level Security (RLS) tied to `auth.uid()`. Belt and suspenders.
- No signup flow, no public landing page, no marketing site. The root route redirects: signed in → `/chat`, signed out → `/login`.

---

## 4. Core Concepts

### 4.1 Categories
The user's life is organized into **categories**. Out of the box, seed these five (the user can edit later):
- Personal
- Home
- Business 1
- Business 2
- Gym

Each category has a name, a color, an icon, and an optional **context blurb** — free text the user (or the AI) writes to give the AI background ("Business 2 is my SaaS for dentists, launching Q3"). The context blurb is injected into the AI's system prompt when relevant.

### 4.2 Tasks
A task belongs to one category and has:
- title (required)
- description (optional)
- status: `todo` | `doing` | `done` | `blocked`
- priority: 1 (high) → 5 (low)
- due_date (optional, when the task is due)
- scheduled_for (optional, when a reminder fires)
- recurring pattern (optional: `daily`, `weekly:mon,wed,fri`, etc.)
- completed_at timestamp

### 4.3 The Coach
The Coach is the AI persona the user chats with. It is **proactive**, **remembers preferences**, and **asks clarifying questions when truly necessary**. It is NOT preachy, does NOT lecture about productivity, and matches the user's energy and tone.

The Coach has access to a fixed set of **tools** (described in section 6) and uses them to read and write the user's data. The Coach never claims to have done something it didn't actually do via a tool call.

### 4.4 Memory
The Coach has a long-term memory store. Every time the user shares a preference, fact, or pattern about themselves, the Coach can save it as a memory. On every new message, the system retrieves the most relevant memories (via vector search) and injects them into the Coach's prompt, so the Coach feels like it knows the user. The more the user uses the app, the better this gets.

---

## 5. Database Schema (described in plain English)

Build the following tables in Supabase. Enable the `vector` extension first.

### `categories`
- id (uuid, primary key)
- user_id (uuid, foreign key to auth.users)
- name (text)
- color (text — hex code)
- icon (text — lucide-react icon name)
- context (text — optional background blurb for the AI)
- created_at (timestamp)

### `tasks`
- id (uuid, primary key)
- user_id (uuid, foreign key to auth.users)
- category_id (uuid, foreign key to categories, nullable)
- title (text)
- description (text, nullable)
- status (text, default `todo`)
- priority (integer, default 3)
- due_date (timestamp, nullable)
- scheduled_for (timestamp, nullable — when a reminder should fire)
- recurring (text, nullable — pattern string like `daily` or `weekly:mon,wed,fri`)
- reminder_sent (boolean, default false)
- completed_at (timestamp, nullable)
- created_at (timestamp)

### `conversations`
- id (uuid, primary key)
- user_id (uuid)
- title (text — auto-generated summary, nullable)
- started_at (timestamp)
- last_message_at (timestamp)

### `messages`
- id (uuid, primary key)
- conversation_id (uuid, foreign key, on-delete-cascade)
- role (text — `user`, `assistant`, or `tool`)
- content (jsonb — flexible enough to store text, tool calls, and tool results)
- created_at (timestamp)

### `memory`
- id (uuid, primary key)
- user_id (uuid)
- category_id (uuid, foreign key, nullable — for category-scoped memories)
- content (text — the fact in plain language)
- embedding (vector, 1024 dimensions for voyage-3)
- importance (integer 1–5, default 3)
- created_at (timestamp)
- Index: ivfflat on `embedding` for cosine similarity

### `push_subscriptions`
- id (uuid, primary key)
- user_id (uuid)
- endpoint (text)
- keys (jsonb)
- created_at (timestamp)

### RLS Policies
Every table must have RLS enabled. Policy on every table: `user_id = auth.uid()` for select, insert, update, delete.

---

## 6. The Tools the Coach Can Call

The Coach interacts with the database **only** through these tools. Do not let the AI write SQL or call routes directly. Each tool is a server-side function exposed to the AI via the Anthropic tool-use API.

| Tool | What it does | Inputs |
|---|---|---|
| `create_task` | Creates a new task | title, category (name or id), due_date?, scheduled_for?, priority?, recurring?, description? |
| `list_tasks` | Returns tasks matching filters | category?, status?, due_before?, due_after?, limit? |
| `update_task` | Edits a task | id, any of the task fields |
| `complete_task` | Marks a task done, sets completed_at | id |
| `delete_task` | Deletes a task | id |
| `schedule_reminder` | Sets `scheduled_for` on a task | task_id, when (ISO timestamp or natural language to be parsed) |
| `create_category` | Creates a new category | name, color?, icon?, context? |
| `update_category` | Edits a category (especially its context blurb) | id, fields |
| `list_categories` | Returns all categories | (none) |
| `remember` | Saves a durable fact about the user | content, category_id?, importance? |
| `search_memory` | Semantic search over saved memories | query, limit? |
| `forget` | Deletes a memory by id | id |

Each tool returns a structured result the Coach can read and reason about in its next turn. The chat endpoint runs a **tool-use loop**: Claude responds → if it called tools, execute them → feed results back → Claude responds again, until Claude returns a final text-only message.

---

## 7. The Coach's System Prompt (composed dynamically every turn)

The system prompt is rebuilt on every chat turn from these pieces:

1. **Identity & rules** (static)
   - "You are [name]'s personal coach and task manager."
   - Behavior rules (see section 8 below)
2. **Time context**
   - Current date and time in the user's timezone
   - Day of week
3. **Current state**
   - Top 10 open tasks across all categories, sorted by priority and due date
   - List of category names + their context blurbs
4. **Relevant memory**
   - Embed the user's latest message
   - Vector search the `memory` table
   - Pull top 5 memories above similarity threshold 0.75
   - Inject them as "Things you know about [name]"
5. **Conversation history**
   - The last ~10 messages are passed in the API call's `messages` array, not the system prompt

---

## 8. Coach Behavior Rules

These go into the system prompt verbatim, paraphrased for clarity:

- **Be proactive.** When the user is vague ("I'm bored", "what now?", "got 30 min"), call `list_tasks` and suggest one based on time of day, energy required, priority, and what they've recently completed.
- **Auto-categorize.** Infer the category from the task itself. "Hit a deadlift PR" → Gym. "Email accountant" → whichever business is relevant. Only ask if it's truly ambiguous between two categories.
- **Ask clarifying questions sparingly.** When something is genuinely ambiguous and matters (e.g., "remind me about the meeting" — *which* meeting?), ask. Don't ask about defaults you can reasonably guess.
- **Remember things automatically.** When the user shares a preference, pattern, or fact ("I do my best work in the morning", "my coach's name is Marc", "Business 2 launches in March"), call `remember` without being told to.
- **Don't lecture.** No productivity sermons. No unsolicited advice about "balance" or "self-care" unless directly asked.
- **Match the user's energy.** Casual when they're casual. Direct when they're direct. Do not be overly cheerful.
- **Always use tools.** Never say "I've added that to your list" without actually calling `create_task`. Never invent tasks or facts.
- **Confirm destructive actions.** Before `delete_task` or `forget`, confirm in plain language unless the user explicitly said "delete X."
- **Surface what you're doing.** When you call tools, briefly say what you did ("Added 'deadlift PRs' to Gym, due Friday"). Don't be silent after a tool call.

---

## 9. Features

### 9.1 Chat (primary surface, route: `/chat`)
- Streaming responses via Vercel AI SDK
- Markdown rendering in assistant messages
- Tool calls visualized inline as small chips ("Created task: Deadlift PRs")
- Composer with text input + voice button + send button
- Conversations persist; user can start a new conversation or scroll history
- Sidebar lists past conversations with auto-generated titles
- Mobile-responsive (works fine on a phone browser, but no native PWA install required for v1)

### 9.2 Voice Input
- Browser Web Speech API (`SpeechRecognition`)
- Press-and-hold mic button OR toggle mode
- Live transcript appears in the composer as the user speaks
- On release / pause, the transcript is finalized; user can still edit before sending
- Falls back gracefully if the browser doesn't support it (button is disabled, tooltip explains why)

### 9.3 Calendar (route: `/calendar`)
- Month view (default), with optional week view toggle
- Use `react-big-calendar` (free, mature)
- Tasks with `due_date` OR `scheduled_for` show as events on that date
- Color of the event matches its category color
- Click an event → side drawer with task details + a "discuss this with the Coach" button that jumps to a new chat seeded with the task as context
- Drag an event to a new date → calls `update_task` to reschedule

### 9.4 Tasks list view (route: `/tasks`)
- Simple list, filterable by category and status
- Inline edit, complete, delete
- This view is for power-using when chat feels slower than just clicking

### 9.5 Reminders / Notifications
- Two channels: **Web Push** (primary) and **Email via Resend** (fallback / redundancy)
- A Vercel Cron job runs every 5 minutes
- It queries: `tasks where scheduled_for <= now() AND reminder_sent = false`
- For each matching task, it sends a push (if subscribed) and an email
- Marks `reminder_sent = true`
- For recurring tasks, it also creates the next occurrence based on the `recurring` pattern
- The Settings page lets the user enable/disable push, manage their email address, and run a "test notification"

### 9.6 Settings (route: `/settings`)
- Manage categories (CRUD, edit color/icon/context blurb)
- Notification preferences (push on/off, email on/off, test buttons)
- Memory browser (view all saved memories, edit, delete) — important for the user to feel in control of what the AI "knows"
- Export data (JSON download of all tasks, memories, conversations) — nice to have for v1

---

## 10. Example User Flows

### Flow A: Quick capture
> User: "remind me to call the dentist tomorrow at 10"
- Coach calls `create_task(title="Call the dentist", category="Personal", scheduled_for="<tomorrow 10am>")`
- Coach replies: "Done — I'll remind you tomorrow at 10."

### Flow B: Coach mode (proactive)
> User: "I have an hour, what should I work on?"
- Coach calls `list_tasks(status="todo")` and `search_memory("energy preferences time of day")`
- Memory returns: "User prefers deep work in the morning, admin tasks in afternoon."
- It's 9am. Coach picks a high-priority Business task.
- Coach replies: "It's morning — your best deep-work window. You've got 'Draft proposal for X' in Business 1, priority 1. Want to start there?"

### Flow C: Auto-remembered preference
> User: "I always feel sluggish on Mondays, let's keep gym easy that day."
- Coach calls `remember(content="User feels sluggish on Mondays — schedule lighter gym sessions then", category=Gym, importance=2)`
- Coach replies: "Noted. I'll suggest mobility or cardio for Mondays going forward."

### Flow D: Clarifying question
> User: "remind me about the meeting"
- Coach has no context about a specific meeting.
- Coach replies: "Which meeting? I don't see one on your tasks — want me to add one?"

### Flow E: Calendar reschedule
- User drags a task from Tuesday to Thursday on the calendar.
- The frontend calls `update_task(id=..., scheduled_for=<Thursday>)` directly (not through chat — this is direct UI manipulation).
- Calendar refreshes.

---

## 11. Build Phases

Build in this order. Don't skip ahead — each phase produces a usable artifact.

### Phase 1 — Foundation (no AI yet)
**Goal**: A working Next.js + Supabase app where the owner can sign in and manually manage tasks and categories.

Deliverables:
- Next.js project scaffolded
- Supabase project created, schema migrated, RLS policies live
- Magic-link auth working, gated by `OWNER_EMAIL`
- Five default categories seeded for the user
- A working `/tasks` list view: create, edit, complete, delete tasks
- A working `/settings` page for categories CRUD
- Deployed to Vercel with environment variables

Acceptance criteria:
- Owner can sign in with magic link
- Non-owner emails are rejected
- Owner can create a task in "Gym" category and see it in the list
- Refreshing the page preserves data (it's actually in Supabase)

### Phase 2 — The Coach (chat + tool use + memory)
**Goal**: A chatbot at `/chat` that can manage tasks via natural conversation and remembers things.

Deliverables:
- `/api/chat` route with the tool-use loop
- All 12 tools from section 6 implemented as server-side functions
- Streaming chat UI built with Vercel AI SDK and shadcn
- Conversation persistence (new convo on first message, messages stored)
- Memory table populated when Coach calls `remember`
- Voyage embeddings integrated; vector search wired into the system prompt assembly
- Dynamic system prompt assembled per turn (identity + time + tasks + memories)
- Coach behavior rules in place

Acceptance criteria:
- Saying "add deadlift PRs to gym" creates a task in the Gym category
- Saying "what should I do now?" produces a context-aware suggestion
- Sharing a preference ("I work best in the morning") results in a memory being saved
- That memory influences a later suggestion in a different conversation
- The Coach never claims to have done something without a corresponding tool call in the message log

### Phase 3 — Voice, Calendar, Reminders
**Goal**: Feature-complete v1.

Deliverables:
- Web Speech API voice input on the chat composer
- `/calendar` route with month and week views, drag-to-reschedule
- Web Push subscription flow + service worker
- Resend integration for email reminders
- Vercel Cron job hitting `/api/cron/reminders` every 5 minutes
- Recurring task expansion logic
- Memory browser UI in `/settings`
- Mobile-responsive layout pass

Acceptance criteria:
- User can speak a task and it's correctly transcribed and sent
- A task with `scheduled_for` set to 2 minutes from now produces a push notification AND an email
- A daily recurring task generates the next occurrence after the previous one is completed or its reminder fires
- Dragging a calendar event to a new day updates the task in the database
- The user can view, edit, and delete saved memories from settings

---

## 12. Non-Goals for v1

To keep scope tight, we are explicitly **not** building:
- Multi-user / team features
- A marketing site or landing page
- Native mobile apps (the web app is mobile-responsive, that's enough)
- PWA install / offline support
- Third-party calendar sync (Google Calendar, iCal) — maybe v2
- File attachments on tasks
- Subtasks / task hierarchies
- Tags beyond the category system
- Task sharing / delegation
- Analytics dashboards / streaks / gamification
- Whisper-based voice (stick with Web Speech API; revisit if quality is poor)

---

## 13. Decisions Already Made (do not re-debate)

- The chat is the primary interface. Calendar and Tasks list are secondary.
- The AI uses tools, not regex parsing of user messages.
- Categories are user-managed but seeded with 5 defaults.
- Memory is automatic — the Coach decides when to save things, not the user.
- Single-user with magic-link auth + email gate. No signup.
- pgvector lives in the same Supabase Postgres database. No separate vector DB.
- Notifications use Web Push first, email second. No SMS.
- Stripe / payments / pricing: not applicable, single-user app.

---

## 14. Environment Variables Needed

Set these in Vercel project settings and `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, used in API routes)
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`
- `RESEND_API_KEY`
- `OWNER_EMAIL` (the only email allowed to sign in)
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (for Web Push)
- `CRON_SECRET` (Vercel Cron auth header)

---

## 15. Open Questions for the User

These are intentionally left for the user to answer before or during the build. None of them block Phase 1.

1. What's the user's name (used in the Coach's greeting and prompt)?
2. What's the user's timezone?
3. Default category colors and icons — pick reasonable ones, the user can change later.
4. Tone of the Coach: dry/neutral, warm/encouraging, or blunt? (Default to neutral if unanswered.)
5. Should the Coach have a name, or just be "the Coach"?

---

## 16. Definition of Done (v1)

The project ships when:
- All three phases pass their acceptance criteria
- The user can chat with the Coach on desktop and mobile browsers
- A reminder set today actually fires today
- The Coach correctly recalls a fact mentioned in a previous conversation
- Deploy is on Vercel, hooked to the main branch, with all env vars set
- The user has used it for 3 consecutive days without hitting a blocking bug

That's the bar.
