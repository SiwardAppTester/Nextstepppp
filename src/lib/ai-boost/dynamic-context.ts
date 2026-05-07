import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";

const USER_TIMEZONE = "Europe/Amsterdam";

type Category = { id: string; name: string; context: string | null };
type Goal = {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
};

/**
 * Build the per-turn <user_context> block. Includes:
 * - Current datetime + user timezone (for resolving relative dates).
 * - Every category with its FULL context string.
 * - Active goals per category (with id and target_date so Claude can link
 *   tasks/events to them via goal_id).
 * - Per-category open-task count and upcoming-event count (next 7 days).
 *
 * Tasks/events themselves are not enumerated by default — Claude calls
 * list_tasks / list_events when it needs detail.
 */
export async function buildUserContextBlock(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const now = new Date();
  const isoNow = now.toISOString();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: categoriesData }, { data: goalsData }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, context")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("goals")
      .select("id, category_id, title, description, target_date")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);

  const categories = (categoriesData ?? []) as Category[];
  const goals = (goalsData ?? []) as Goal[];

  // Group active goals by category for cheap lookup.
  const goalsByCategory = new Map<string, Goal[]>();
  for (const g of goals) {
    const list = goalsByCategory.get(g.category_id) ?? [];
    list.push(g);
    goalsByCategory.set(g.category_id, list);
  }

  // Per-category counts. 2N round-trips — fine for one user with a small
  // number of categories.
  const [taskCounts, eventCounts] = await Promise.all([
    Promise.all(
      categories.map(async (c) => {
        const { count } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("category_id", c.id)
          .eq("status", "todo");
        return [c.id, count ?? 0] as const;
      })
    ),
    Promise.all(
      categories.map(async (c) => {
        const { count } = await supabase
          .from("events")
          .select("*", { count: "exact", head: true })
          .eq("category_id", c.id)
          .gte("start_at", isoNow)
          .lte("start_at", sevenDaysFromNow);
        return [c.id, count ?? 0] as const;
      })
    ),
  ]);

  const taskCountById = new Map(taskCounts);
  const eventCountById = new Map(eventCounts);

  const localReadable = new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const lines: string[] = [];
  lines.push(`Current datetime: ${isoNow} (${localReadable} ${USER_TIMEZONE})`);
  lines.push(`User timezone: ${USER_TIMEZONE}`);
  lines.push("");
  lines.push("Categories:");

  if (categories.length === 0) {
    lines.push("");
    lines.push(
      "(No categories yet. If the user shares something meaningful, run the new-category interview and create the first one.)"
    );
  } else {
    categories.forEach((c, idx) => {
      const tasks = taskCountById.get(c.id) ?? 0;
      const events = eventCountById.get(c.id) ?? 0;
      const cgoals = goalsByCategory.get(c.id) ?? [];
      lines.push("");
      lines.push(`[${idx + 1}] ${c.name} (id: ${c.id})`);
      lines.push(`Context: ${c.context?.trim() ? c.context : "(empty — fill this in as the user shares info)"}`);
      if (cgoals.length === 0) {
        lines.push("Active goals: (none — if the user shares ambition, propose creating a goal)");
      } else {
        lines.push("Active goals:");
        for (const g of cgoals) {
          const target = g.target_date ? `, target ${format(new Date(g.target_date), "MMM d yyyy")}` : "";
          const desc = g.description?.trim() ? ` — ${g.description.trim()}` : "";
          lines.push(`  - ${g.title}${desc} (id: ${g.id}${target})`);
        }
      }
      lines.push(`Open tasks: ${tasks} | Upcoming events (next 7 days): ${events}`);
    });
  }

  return `<user_context>\n${lines.join("\n")}\n</user_context>`;
}
