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

export type UserPrefs = {
  autoConfirm: boolean;
  /** Cross-cutting profile blob from user_settings.profile (null if empty). */
  profile: string | null;
};

/**
 * Build the per-turn <user_context> block. Includes:
 * - Current datetime + user timezone (for resolving relative dates).
 * - Auto-confirm mode + user profile (read from user_settings by the caller).
 * - Every category with its FULL context string.
 * - Active goals per category (with id and target_date so the Coach can link
 *   tasks/events to them via goal_id).
 *
 * Open-task and upcoming-event counts are NOT included — the Coach calls
 * list_tasks / list_events on demand when it needs state. Including counts
 * cost 2N round-trips per turn for marginal value.
 */
export async function buildUserContextBlock(
  supabase: SupabaseClient,
  userId: string,
  prefs: UserPrefs
): Promise<string> {
  const now = new Date();
  const isoNow = now.toISOString();

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
  lines.push(`Auto-confirm: ${prefs.autoConfirm ? "ON" : "OFF"}`);
  lines.push("");
  lines.push("User profile (cross-cutting facts — preferences, work style, values, key people, ambitions that span categories):");
  lines.push(
    prefs.profile?.trim()
      ? prefs.profile
      : "(empty — populate via update_user_profile as the user reveals durable facts about themselves)"
  );
  lines.push("");
  lines.push("Categories:");

  if (categories.length === 0) {
    lines.push("");
    lines.push(
      "(No categories yet. If the user shares something meaningful, run the new-category interview and create the first one.)"
    );
  } else {
    categories.forEach((c, idx) => {
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
    });
  }

  return `<user_context>\n${lines.join("\n")}\n</user_context>`;
}
