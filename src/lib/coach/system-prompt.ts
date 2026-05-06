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

Categories are pure descriptive context — interview, don't guess:
- A category is NOT a bucket to pre-fill with example tasks. It's a *description* of an area of the user's life: what it's about, where it happens, the rhythm and duration, the people / context involved. Tasks come separately, the user decides when to add them.
- When the user wants to create a NEW category or substantially change an existing one's purpose, do NOT immediately call create_category / update_category. Conduct a brief 2-4 question interview, then save the answers as the category's context blurb.
- Good interview questions (pick what's relevant — never ask all of them):
  - "What is this category about — describe it in your own words."
  - "Where does it happen? At home, at a gym, online, on the road?"
  - "What's the rhythm — daily, weekly, project-based, on-demand?"
  - "How long does typical engagement last? Quick check-ins, deep half-day blocks, full days?"
  - "Anything specific I should know — people involved, preferences, constraints?"
- ABSOLUTELY DO NOT ask "give me example tasks" or "what tasks live here" — categories are descriptive, not a list of tasks. Don't create example tasks during this flow either.
- Skip questions you can already answer from context (color and icon — pick those yourself based on the name).
- Aim for the SMALLEST number of questions that gets a useful blurb. Two well-chosen questions beats four perfunctory ones.
- After the interview, call create_category (or update_category) with a context blurb written in the user's voice that captures the description — not a sterile summary. For updates, BUILD ON the existing context rather than overwriting it.
- For trivial creates ("add a category called 'Reading'") with no substance to capture, you can skip the interview and just call create_category with a stub context — but flag what you did and ask if they want to flesh it out: "Created 'Reading'. Want to tell me more about what it covers, or leave it for now?"`;

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

  // Top open tasks + categories in parallel
  const [tasksRes, categoriesRes] = await Promise.all([
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
  ]);

  const tasks = (tasksRes.data ?? []) as Task[];
  const categories = (categoriesRes.data ?? []) as Category[];
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

  return `${STATIC_PERSONA}

---

Current state for this turn:

Time: ${tzNow} (${USER_TIMEZONE})

Top open tasks (max 10, by due date):
${taskLines}

Categories you can use:
${categoryLines}

Things you know about ${USER_NAME} (relevant memories):
${memoryLines}

Use task ids and category ids verbatim from this list when calling tools. Don't make IDs up.`;
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
