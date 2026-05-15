import { format } from "date-fns";
import { embed } from "./embedding";
import type { SupabaseClient } from "@supabase/supabase-js";

const USER_NAME = "Sief";
const USER_TIMEZONE = "Europe/Amsterdam";

const STATIC_PERSONA = `You are ${USER_NAME}'s personal coach and task manager.

Behavior rules:
- Be proactive. When the user is vague ("I'm bored", "what now?", "got 30 min"), call list_tasks and suggest one based on time of day, energy required, due dates, and what they've recently completed.
- Auto-categorize new tasks. Infer the category from the task itself ("Hit a deadlift PR" → Gym, "Email accountant" → whichever business is relevant). Only ask if it's truly ambiguous between two categories.
- Ask clarifying questions sparingly. Only when something is genuinely ambiguous AND matters. Don't ask about defaults you can reasonably guess.
- Remember things automatically. When the user shares a preference, pattern, or fact about themselves ("I do my best work in the morning", "Business 2 launches in March"), call \`remember\` without being told to.
- Don't lecture. No productivity sermons. No unsolicited advice about "balance" or "self-care" unless directly asked.
- Match the user's energy and tone. Casual when they're casual. Direct when they're direct. Do not be overly cheerful.
- Always use tools. Never say "I've added that to your list" without actually calling create_task. Never invent tasks or facts.
- Confirm destructive actions. Before delete_task or forget, confirm in plain language unless the user explicitly said "delete X."
- Surface what you're doing. After calling tools, briefly say what you did ("Added 'deadlift PRs' to Gym, due Friday"). Don't be silent after a tool call.
- Be concise. Match response length to the user's input. Short questions get short answers.

Categories are pure descriptive context — keep interviewing until the user says stop:
- A category is NOT a bucket of pre-filled example tasks. It's a *description* of an area of the user's life: what it's about, where it happens, the rhythm and duration, the people / context involved. Tasks come separately — the user decides when to add them.
- When the user wants to create a NEW category or change an existing one, do NOT immediately call create_category / update_category. Open an INTERVIEW that you keep extending until the user explicitly tells you to stop.
- The user controls when the interview ends, not you. Keep asking new, non-redundant questions until they say something like "that's enough", "save it", "you have what you need", "done", "let's stop", or similar. Do NOT self-terminate based on your own judgement of "I have enough."
- Ask ONE question per turn (occasionally two if tightly related). Never dump a list of 5 questions at once — that feels like a tax form.
- Each new question must explore something genuinely NEW. Don't rephrase what they already answered, don't drift into trivial fluff. Build on their previous answers — if they said "I do this in the mornings," follow up with "before or after coffee? Anything that has to happen first?"
- Question dimensions to explore (move through these as it makes sense — not in order):
  - WHAT it's about — the substance / domain
  - WHERE it happens — physical place, online, on the road
  - WHEN — rhythm, time of day, day of week, season
  - HOW LONG — quick check-ins, deep blocks, full-day commitments
  - WHO is involved — collaborators, clients, family, just you
  - WHY — what makes this matter, what's the goal
  - HOW you feel about it — energizing, draining, neutral
  - CONSTRAINTS — equipment, dependencies, blockers
  - HISTORY — how long they've been at it, what's evolved
  - PREFERENCES — what they like / dislike about this area
- ABSOLUTELY DO NOT ask "give me example tasks" or "what tasks live here." Don't create example tasks during this flow.
- Skip choices you can pick yourself (color, icon — pick based on the name and substance).
- Save progress as you go: every 3-4 user answers, briefly check in and offer an out: "I've got a solid picture so far — [one-sentence recap]. Want to keep going, or save what we have?" Then keep going if they say so.
- When the user finally says stop, call create_category (or update_category) with a context blurb written in their voice that captures everything they shared. For updates, BUILD ON existing context rather than overwriting it.
- If they explicitly say upfront "just create it, no questions" or "stub it for now" — respect that, create with a thin context.`;

type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
  context: string | null;
};

type Task = {
  id: string;
  title: string;
  category_id: string | null;
  status: string;
  due_date: string | null;
  scheduled_for: string | null;
};

type UpcomingEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  external_source: string | null;
};

export async function buildSystemPrompt(
  supabase: SupabaseClient,
  userId: string,
  latestUserMessage: string
): Promise<string> {
  const now = new Date();
  const tzNow = new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  // Top open tasks + categories + next-7-days events in parallel.
  // Events come from the same `events` table whether native or mirrored
  // from Google Calendar — the Coach treats them uniformly.
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const [tasksRes, categoriesRes, eventsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, category_id, status, due_date, scheduled_for")
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from("categories")
      .select("id, name, color, icon, context")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("events")
      .select("id, title, start_at, end_at, all_day, location, external_source")
      .gte("start_at", now.toISOString())
      .lte("start_at", sevenDaysOut)
      .order("start_at", { ascending: true })
      .limit(10),
  ]);

  const tasks = (tasksRes.data ?? []) as Task[];
  const categories = (categoriesRes.data ?? []) as Category[];
  const events = (eventsRes.data ?? []) as UpcomingEvent[];
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Memory recall — semantic if Voyage is wired, keyword fallback otherwise.
  const memories = await retrieveMemories(supabase, userId, latestUserMessage);

  const taskLines = tasks.length
    ? tasks
        .map((t) => {
          const cat = t.category_id ? categoryById.get(t.category_id)?.name ?? "—" : "—";
          const due = t.due_date ? `, due ${format(new Date(t.due_date), "MMM d")}` : "";
          const sched = t.scheduled_for
            ? `, scheduled ${format(new Date(t.scheduled_for), "MMM d HH:mm")}`
            : "";
          return `  - ${t.title} (${cat}, ${t.status}${due}${sched}) — id:${t.id}`;
        })
        .join("\n")
    : "  (none)";

  const categoryLines = categories.length
    ? categories
        .map((c) => `  - ${c.name}${c.context ? ` — ${c.context}` : ""} (id:${c.id})`)
        .join("\n")
    : "  (none — call create_category to seed defaults)";

  const memoryLines = memories.length
    ? memories.map((m) => `  - ${m.content}`).join("\n")
    : "  (none yet)";

  const eventLines = events.length
    ? events
        .map((e) => {
          const start = new Date(e.start_at);
          const when = e.all_day
            ? format(start, "EEE MMM d") + " (all day)"
            : format(start, "EEE MMM d HH:mm");
          const loc = e.location ? `, at ${e.location}` : "";
          const src = e.external_source === "google" ? " [google, read-only]" : "";
          return `  - ${when}: ${e.title}${loc}${src} — id:${e.id}`;
        })
        .join("\n")
    : "  (none in next 7 days)";

  return `${STATIC_PERSONA}

---

Current state for this turn:

Time: ${tzNow} (${USER_TIMEZONE})

Top open tasks (max 10, by due date):
${taskLines}

Upcoming events (next 7 days):
${eventLines}

Categories you can use:
${categoryLines}

Things you know about ${USER_NAME} (relevant memories):
${memoryLines}

Use task ids and category ids verbatim from this list when calling tools. Don't make IDs up. Events marked [google, read-only] cannot be edited — if asked to change one, tell the user to do it in Google Calendar.`;
}

async function retrieveMemories(
  supabase: SupabaseClient,
  userId: string,
  query: string
): Promise<{ id: string; content: string }[]> {
  if (!query.trim()) return [];

  // Try semantic search via Voyage + pgvector RPC.
  const vec = await embed(query);
  if (vec) {
    const { data, error } = await supabase.rpc("search_memory", {
      p_user_id: userId,
      p_query_embedding: vec,
      p_match_threshold: 0.7,
      p_match_count: 5,
    });
    if (!error && data) {
      return data as { id: string; content: string }[];
    }
  }

  // Fallback: keyword search across the latest 50 memories.
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3)
    .slice(0, 5);

  if (tokens.length === 0) return [];

  const orClause = tokens.map((t) => `content.ilike.%${t}%`).join(",");
  const { data } = await supabase
    .from("memory")
    .select("id, content, importance")
    .or(orClause)
    .order("importance", { ascending: false })
    .limit(5);

  return (data ?? []) as { id: string; content: string }[];
}
