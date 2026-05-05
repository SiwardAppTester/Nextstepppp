import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./embedding";
import { addMinutes, addHours, addDays, parse, parseISO, isValid } from "date-fns";

/**
 * The Coach's tool surface — the only way it touches the database.
 *
 * Returns an object literal of tools keyed by name, ready to spread into
 * `streamText({ tools: ... })`. The supabase client + user_id are captured
 * via closure so each `execute` runs as the authed owner.
 */
export function buildCoachTools(supabase: SupabaseClient, userId: string) {
  return {
    create_task: tool({
      description:
        "Create a new task for the user. Auto-categorize by inferring from the title. Only ask the user for a category if it's truly ambiguous. Always call this when the user says anything like 'add X', 'remind me to X', 'I need to X'.",
      inputSchema: z.object({
        title: z.string().describe("The task title — short and action-oriented."),
        category_id: z
          .string()
          .nullable()
          .optional()
          .describe("Category id from the system context. Null/omit if uncategorized."),
        priority: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .default(3)
          .describe("1=high, 5=low. Default 3."),
        due_date: z
          .string()
          .nullable()
          .optional()
          .describe("ISO timestamp when the task is due."),
        scheduled_for: z
          .string()
          .nullable()
          .optional()
          .describe(
            "ISO timestamp when a reminder should fire. Pass natural-language like 'tomorrow 10am' and it'll be parsed."
          ),
        recurring: z
          .string()
          .nullable()
          .optional()
          .describe("Pattern: 'daily', 'weekly:mon,wed,fri', etc."),
        description: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const scheduled_for = input.scheduled_for
          ? coerceToISO(input.scheduled_for)
          : null;
        const due_date = input.due_date ? coerceToISO(input.due_date) : null;

        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            title: input.title,
            category_id: input.category_id ?? null,
            priority: input.priority ?? 3,
            due_date,
            scheduled_for,
            recurring: input.recurring ?? null,
            description: input.description ?? null,
          })
          .select("id, title")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id, title: data.title };
      },
    }),

    list_tasks: tool({
      description:
        "List the user's tasks, filterable by category, status, or due-date window. Use this whenever you need to know what's on the user's plate or before suggesting what to work on.",
      inputSchema: z.object({
        category_id: z.string().nullable().optional(),
        status: z.enum(["todo", "doing", "done", "blocked"]).optional(),
        due_before: z.string().nullable().optional().describe("ISO timestamp."),
        due_after: z.string().nullable().optional().describe("ISO timestamp."),
        limit: z.number().int().min(1).max(50).optional().default(20),
      }),
      execute: async (input) => {
        let q = supabase
          .from("tasks")
          .select("id, title, description, status, priority, category_id, due_date, scheduled_for, recurring, created_at")
          .order("priority", { ascending: true })
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(input.limit ?? 20);
        if (input.category_id) q = q.eq("category_id", input.category_id);
        if (input.status) q = q.eq("status", input.status);
        if (input.due_before) q = q.lte("due_date", coerceToISO(input.due_before));
        if (input.due_after) q = q.gte("due_date", coerceToISO(input.due_after));
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, tasks: data ?? [] };
      },
    }),

    update_task: tool({
      description:
        "Edit one or more fields on an existing task. Pass only the fields you want to change.",
      inputSchema: z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        category_id: z.string().nullable().optional(),
        status: z.enum(["todo", "doing", "done", "blocked"]).optional(),
        priority: z.number().int().min(1).max(5).optional(),
        due_date: z.string().nullable().optional(),
        scheduled_for: z.string().nullable().optional(),
        recurring: z.string().nullable().optional(),
      }),
      execute: async ({ id, ...rest }) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v === undefined) continue;
          if ((k === "due_date" || k === "scheduled_for") && typeof v === "string") {
            patch[k] = coerceToISO(v);
          } else {
            patch[k] = v;
          }
        }
        if (Object.keys(patch).length === 0)
          return { ok: false, error: "Nothing to update" };
        const { error } = await supabase
          .from("tasks")
          .update(patch)
          .eq("id", id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, id };
      },
    }),

    complete_task: tool({
      description:
        "Mark a task as done and stamp completed_at. For recurring tasks, also creates the next occurrence.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { data: existing, error: getErr } = await supabase
          .from("tasks")
          .select("id, recurring, scheduled_for, due_date, title, category_id, priority, description")
          .eq("id", id)
          .single();
        if (getErr) return { ok: false, error: getErr.message };

        const completedAt = new Date().toISOString();
        const { error } = await supabase
          .from("tasks")
          .update({ status: "done", completed_at: completedAt })
          .eq("id", id);
        if (error) return { ok: false, error: error.message };

        // Recurring: create next occurrence
        if (existing?.recurring) {
          const next = nextOccurrence(existing.recurring, existing.scheduled_for ?? existing.due_date);
          if (next) {
            await supabase.from("tasks").insert({
              user_id: userId,
              title: existing.title,
              description: existing.description,
              category_id: existing.category_id,
              priority: existing.priority,
              recurring: existing.recurring,
              scheduled_for: existing.scheduled_for ? next : null,
              due_date: existing.due_date ? next : null,
            });
          }
        }
        return { ok: true, id };
      },
    }),

    delete_task: tool({
      description: "Permanently delete a task. Confirm with the user first unless they explicitly said 'delete'.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { error } = await supabase.from("tasks").delete().eq("id", id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, id };
      },
    }),

    schedule_reminder: tool({
      description:
        "Set or update when a reminder should fire on an existing task. Accepts ISO timestamp or natural language ('tomorrow 10am', 'in 2 hours').",
      inputSchema: z.object({
        task_id: z.string(),
        when: z.string(),
      }),
      execute: async ({ task_id, when }) => {
        const iso = coerceToISO(when);
        const { error } = await supabase
          .from("tasks")
          .update({ scheduled_for: iso, reminder_sent: false })
          .eq("id", task_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, task_id, scheduled_for: iso };
      },
    }),

    create_category: tool({
      description:
        "Create a new category. Defaults are sane — pass color/icon/context only when meaningful.",
      inputSchema: z.object({
        name: z.string(),
        color: z.string().optional().default("#9098A8").describe("Hex color, e.g. '#4DA8FF'."),
        icon: z.string().optional().default("Tag").describe("Lucide icon name."),
        context: z
          .string()
          .nullable()
          .optional()
          .describe("Background blurb the Coach uses when relevant."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("categories")
          .insert({
            user_id: userId,
            name: input.name,
            color: input.color ?? "#9098A8",
            icon: input.icon ?? "Tag",
            context: input.context ?? null,
          })
          .select("id, name")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id, name: data.name };
      },
    }),

    update_category: tool({
      description: "Edit a category — most often its context blurb.",
      inputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        context: z.string().nullable().optional(),
      }),
      execute: async ({ id, ...rest }) => {
        const patch = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined)
        );
        if (Object.keys(patch).length === 0)
          return { ok: false, error: "Nothing to update" };
        const { error } = await supabase
          .from("categories")
          .update(patch)
          .eq("id", id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, id };
      },
    }),

    list_categories: tool({
      description: "List all categories for the user.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("categories")
          .select("id, name, color, icon, context")
          .order("created_at", { ascending: true });
        if (error) return { ok: false, error: error.message };
        return { ok: true, categories: data ?? [] };
      },
    }),

    remember: tool({
      description:
        "Save a durable fact about the user — a preference, pattern, or background detail. Call this proactively when the user shares anything memorable. Importance: 5 = critical (always recall), 3 = useful, 1 = trivia.",
      inputSchema: z.object({
        content: z.string().describe("The fact in plain language, in the user's voice when possible."),
        category_id: z.string().nullable().optional(),
        importance: z.number().int().min(1).max(5).optional().default(3),
      }),
      execute: async (input) => {
        const vec = await embed(input.content);
        const { data, error } = await supabase
          .from("memory")
          .insert({
            user_id: userId,
            content: input.content,
            category_id: input.category_id ?? null,
            importance: input.importance ?? 3,
            embedding: vec, // null if Voyage isn't configured — search falls back to keyword
          })
          .select("id, content")
          .single();
        if (error) return { ok: false, error: error.message };
        return {
          ok: true,
          id: data.id,
          embedded: vec !== null,
          note: vec === null ? "Saved without embedding (VOYAGE_API_KEY not set)." : undefined,
        };
      },
    }),

    search_memory: tool({
      description:
        "Find memories relevant to a query via semantic search. Use this to recall what you know about the user before answering.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).optional().default(5),
      }),
      execute: async ({ query, limit }) => {
        const vec = await embed(query);
        if (vec) {
          const { data, error } = await supabase.rpc("search_memory", {
            p_user_id: userId,
            p_query_embedding: vec,
            p_match_threshold: 0.65,
            p_match_count: limit,
          });
          if (error) return { ok: false, error: error.message };
          return { ok: true, memories: data ?? [], mode: "semantic" as const };
        }
        // Fallback: keyword search
        const tokens = query
          .toLowerCase()
          .split(/\W+/)
          .filter((t) => t.length > 2)
          .slice(0, 5);
        if (tokens.length === 0) return { ok: true, memories: [], mode: "keyword" as const };
        const orClause = tokens.map((t) => `content.ilike.%${t}%`).join(",");
        const { data, error } = await supabase
          .from("memory")
          .select("id, content, importance")
          .or(orClause)
          .order("importance", { ascending: false })
          .limit(limit ?? 5);
        if (error) return { ok: false, error: error.message };
        return { ok: true, memories: data ?? [], mode: "keyword" as const };
      },
    }),

    forget: tool({
      description:
        "Delete a memory by id. Confirm with the user first unless they explicitly said 'forget' or 'delete'.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { error } = await supabase.from("memory").delete().eq("id", id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, id };
      },
    }),
  };
}

/**
 * Coerce a date string (ISO, or natural language like 'tomorrow 10am' / 'in 2 hours')
 * into an ISO timestamp. Falls back to returning the input unchanged if parsing fails —
 * the database will reject malformed timestamps cleanly.
 */
function coerceToISO(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;

  // Try ISO first
  const iso = parseISO(trimmed);
  if (isValid(iso)) return iso.toISOString();

  // "in N {minutes|hours|days}"
  const inMatch = trimmed.match(/^in\s+(\d+)\s+(minute|hour|day)s?$/i);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const base = new Date();
    if (unit === "minute") return addMinutes(base, n).toISOString();
    if (unit === "hour") return addHours(base, n).toISOString();
    if (unit === "day") return addDays(base, n).toISOString();
  }

  // "tomorrow [HH:mm]" or "today [HH:mm]"
  const dayMatch = trimmed.match(/^(today|tomorrow)(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (dayMatch) {
    const day = dayMatch[1].toLowerCase();
    const base = day === "tomorrow" ? addDays(new Date(), 1) : new Date();
    let h = dayMatch[2] ? Number(dayMatch[2]) : 9;
    const m = dayMatch[3] ? Number(dayMatch[3]) : 0;
    const mer = dayMatch[4]?.toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    base.setHours(h, m, 0, 0);
    return base.toISOString();
  }

  // Last shot: Date constructor (handles e.g. "Mar 5 2026 10:00")
  const native = new Date(trimmed);
  if (isValid(native)) return native.toISOString();

  return trimmed; // db will error on bad input rather than silently wrong-time
}

function nextOccurrence(pattern: string, fromIso: string | null): string | null {
  const base = fromIso ? new Date(fromIso) : new Date();
  if (!isValid(base)) return null;
  const lower = pattern.toLowerCase().trim();

  if (lower === "daily") return addDays(base, 1).toISOString();
  if (lower === "weekly") return addDays(base, 7).toISOString();
  if (lower === "monthly") return addDays(base, 30).toISOString();

  if (lower.startsWith("weekly:")) {
    // weekly:mon,wed,fri — pick the next listed weekday after `base`.
    const days = lower.slice("weekly:".length).split(",").map((d) => d.trim());
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const targets = days.map((d) => dayMap[d]).filter((n) => n !== undefined);
    if (targets.length === 0) return null;
    for (let offset = 1; offset <= 7; offset++) {
      const candidate = addDays(base, offset);
      if (targets.includes(candidate.getDay())) return candidate.toISOString();
    }
  }
  return null;
}

// silence unused-import warning when bundler tree-shakes
void parse;
