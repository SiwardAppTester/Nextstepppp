import { tool } from "ai";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProductInfo } from "@/lib/wishlist/fetch-product";

/**
 * AI Boost's tool surface. Each tool maps 1:1 to a DB operation against
 * Supabase. The supabase client is created server-side with the user's auth
 * cookie, so RLS enforces ownership for free — bad/foreign IDs simply hit
 * "row not found" rather than corrupting another user's data.
 */
export function buildAiBoostTools(supabase: SupabaseClient, userId: string) {
  return {
    update_category_context: tool({
      description:
        "Update a category's context blurb. Read the existing context from <user_context>, integrate the new information naturally while preserving existing important info, and return the FULL updated context string. Consolidate older info if context grows past ~1500 characters.",
      inputSchema: z.object({
        category_id: z.string(),
        new_context: z.string(),
        change_summary: z
          .string()
          .describe("Short human-readable note about what changed."),
      }),
      execute: async ({ category_id, new_context, change_summary }) => {
        const { error } = await supabase
          .from("categories")
          .update({ context: new_context })
          .eq("id", category_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, category_id, change_summary };
      },
    }),

    create_task: tool({
      description:
        "Create a new task in a category. Tasks are pure todo items with NO dates or times — anything time-anchored (deadlines, scheduled work, meetings) must be a create_event instead. When the task serves a specific goal, pass goal_id.",
      inputSchema: z.object({
        category_id: z.string(),
        title: z.string(),
        description: z.string().optional(),
        goal_id: z
          .string()
          .optional()
          .describe("ID of the goal this task serves. Leave unset if no goal clearly fits."),
        priority: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("1=highest, 5=lowest. Default 3."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            category_id: input.category_id,
            title: input.title,
            description: input.description ?? null,
            goal_id: input.goal_id ?? null,
            priority: input.priority ?? 3,
          })
          .select("id, title")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id, title: data.title };
      },
    }),

    update_task: tool({
      description:
        "Update fields on an existing task. Common uses: marking status='done', changing priority, editing title, re-routing to a different category, or linking/unlinking a goal. Tasks have no dates — use events for anything time-anchored.",
      inputSchema: z.object({
        task_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["todo", "done"]).optional(),
        priority: z.number().int().min(1).max(5).optional(),
        category_id: z.string().optional(),
        goal_id: z
          .string()
          .nullable()
          .optional()
          .describe("Goal id to link, or null to clear an existing link."),
      }),
      execute: async ({ task_id, ...rest }) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) patch[k] = v;
        }
        if (Object.keys(patch).length === 0) {
          return { ok: false, error: "Nothing to update." };
        }
        // Mark completed_at when transitioning to done.
        if (patch.status === "done") {
          patch.completed_at = new Date().toISOString();
        }
        const { data, error } = await supabase
          .from("tasks")
          .update(patch)
          .eq("id", task_id)
          .select("id")
          .single();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "Task not found." };
        return { ok: true, id: data.id };
      },
    }),

    delete_task: tool({
      description:
        "Permanently delete a task. Use when the user explicitly says delete/remove, OR when a task was created in error (e.g. you mistakenly created an event AND a task for the same thing — delete the wrong one).",
      inputSchema: z.object({ task_id: z.string() }),
      execute: async ({ task_id }) => {
        const { error } = await supabase.from("tasks").delete().eq("id", task_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, task_id };
      },
    }),

    create_event: tool({
      description:
        "Create a calendar event in a category. Use for time-anchored things that happen at a specific moment (meetings, workouts, appointments). For todo items, use create_task instead. When the event serves a specific goal, pass goal_id.",
      inputSchema: z.object({
        category_id: z.string(),
        title: z.string(),
        description: z.string().optional(),
        location: z.string().optional(),
        goal_id: z
          .string()
          .optional()
          .describe("ID of the goal this event serves. Leave unset if no goal clearly fits."),
        start_at: z
          .string()
          .describe("ISO 8601 with timezone offset. Required."),
        end_at: z.string().optional(),
        all_day: z
          .boolean()
          .optional()
          .describe("True for events without a specific time."),
        recurring: z.string().optional(),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("events")
          .insert({
            user_id: userId,
            category_id: input.category_id,
            title: input.title,
            description: input.description ?? null,
            location: input.location ?? null,
            goal_id: input.goal_id ?? null,
            start_at: input.start_at,
            end_at: input.end_at ?? null,
            all_day: input.all_day ?? false,
            recurring: input.recurring ?? null,
          })
          .select("id, title, start_at")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id, title: data.title, start_at: data.start_at };
      },
    }),

    update_event: tool({
      description: "Update fields on an existing event, including linking/unlinking a goal.",
      inputSchema: z.object({
        event_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        start_at: z.string().optional(),
        end_at: z.string().optional(),
        all_day: z.boolean().optional(),
        recurring: z.string().optional(),
        category_id: z.string().optional(),
        goal_id: z
          .string()
          .nullable()
          .optional()
          .describe("Goal id to link, or null to clear an existing link."),
      }),
      execute: async ({ event_id, ...rest }) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) patch[k] = v;
        }
        if (Object.keys(patch).length === 0) {
          return { ok: false, error: "Nothing to update." };
        }
        const { data, error } = await supabase
          .from("events")
          .update(patch)
          .eq("id", event_id)
          .select("id")
          .single();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "Event not found." };
        return { ok: true, id: data.id };
      },
    }),

    create_category: tool({
      description:
        "Create a new category. ONLY call this AFTER you have interviewed the user (3-5 questions) and synthesized their answers into a context blurb. Pick a color and Lucide icon that fit the theme.",
      inputSchema: z.object({
        name: z.string(),
        context: z
          .string()
          .describe("Synthesized 3-6 sentence context blurb from the interview."),
        color: z
          .string()
          .optional()
          .describe("Hex color, e.g. '#4DA8FF'. Pick something fitting."),
        icon: z
          .string()
          .optional()
          .describe("Lucide icon name, e.g. 'Briefcase', 'Dumbbell', 'BookOpen', 'Heart', 'Code'."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("categories")
          .insert({
            user_id: userId,
            name: input.name,
            context: input.context,
            color: input.color ?? "#4DA8FF",
            icon: input.icon ?? "Tag",
          })
          .select("id, name")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id, name: data.name };
      },
    }),

    update_category: tool({
      description:
        "Update a category's name, color, or icon. For updating the context blurb, use update_category_context instead.",
      inputSchema: z.object({
        category_id: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
      }),
      execute: async ({ category_id, ...rest }) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) patch[k] = v;
        }
        if (Object.keys(patch).length === 0) {
          return { ok: false, error: "Nothing to update." };
        }
        const { error } = await supabase
          .from("categories")
          .update(patch)
          .eq("id", category_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: category_id };
      },
    }),

    list_tasks: tool({
      description:
        "Fetch existing tasks, optionally filtered by category, status, or goal. Tasks have no dates — for date-based queries (today, this week, upcoming) use list_events.",
      inputSchema: z.object({
        category_id: z.string().optional(),
        goal_id: z.string().optional(),
        status: z.enum(["todo", "done"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        let q = supabase
          .from("tasks")
          .select(
            "id, title, description, status, priority, category_id, goal_id, completed_at, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(input.limit ?? 20);
        if (input.category_id) q = q.eq("category_id", input.category_id);
        if (input.goal_id) q = q.eq("goal_id", input.goal_id);
        if (input.status) q = q.eq("status", input.status);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, tasks: data ?? [] };
      },
    }),

    delete_event: tool({
      description:
        "Permanently delete an event. Use when the user explicitly says delete/remove, OR when an event was created in error (e.g. it should have been a task instead).",
      inputSchema: z.object({ event_id: z.string() }),
      execute: async ({ event_id }) => {
        const { error } = await supabase.from("events").delete().eq("id", event_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, event_id };
      },
    }),

    create_goal: tool({
      description:
        "Create a new goal inside a category. Goals are concrete things the user is trying to achieve in this area of life. Title should be short and outcome-oriented ('Land 10 customers by Q2', 'Hit 200kg deadlift'). Set target_date if the user mentioned a deadline.",
      inputSchema: z.object({
        category_id: z.string(),
        title: z.string(),
        description: z.string().optional(),
        target_date: z
          .string()
          .optional()
          .describe("Optional target deadline, ISO 8601 with timezone offset."),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("goals")
          .insert({
            user_id: userId,
            category_id: input.category_id,
            title: input.title,
            description: input.description ?? null,
            target_date: input.target_date ?? null,
          })
          .select("id, title")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id, title: data.title };
      },
    }),

    update_goal: tool({
      description:
        "Update an existing goal. Use status='done' when the user achieves it (also stamps completed_at). Use status='archived' when the user drops it.",
      inputSchema: z.object({
        goal_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        target_date: z.string().nullable().optional(),
        status: z.enum(["active", "done", "archived"]).optional(),
        category_id: z
          .string()
          .optional()
          .describe("Re-route the goal to a different category if the user corrects you."),
      }),
      execute: async ({ goal_id, ...rest }) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) patch[k] = v;
        }
        if (Object.keys(patch).length === 0) {
          return { ok: false, error: "Nothing to update." };
        }
        if (patch.status === "done") {
          patch.completed_at = new Date().toISOString();
        }
        const { data, error } = await supabase
          .from("goals")
          .update(patch)
          .eq("id", goal_id)
          .select("id")
          .single();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "Goal not found." };
        return { ok: true, id: data.id };
      },
    }),

    list_goals: tool({
      description:
        "Fetch goals, optionally filtered. Active goals are already in <user_context>; use this when you need done/archived goals for history, or all goals across statuses.",
      inputSchema: z.object({
        category_id: z.string().optional(),
        status: z.enum(["active", "done", "archived"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        let q = supabase
          .from("goals")
          .select(
            "id, category_id, title, description, target_date, status, completed_at, created_at"
          )
          .order("created_at", { ascending: true })
          .limit(input.limit ?? 50);
        if (input.category_id) q = q.eq("category_id", input.category_id);
        if (input.status) q = q.eq("status", input.status);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, goals: data ?? [] };
      },
    }),

    fetch_product_info: tool({
      description:
        "Fetch a product's title, description, price, and image from a URL. Call this BEFORE create_wishlist_item whenever the user pastes a URL. The result echoes the `url` you fetched — pass that EXACT url field straight into create_wishlist_item's url parameter. Don't call for non-product URLs (search results, homepages).",
      inputSchema: z.object({
        url: z.string().describe("Full http(s) URL to fetch."),
      }),
      execute: async ({ url }) => {
        const result = await fetchProductInfo(url);
        if (!result.ok) {
          // Echo url even on failure so the AI still has it to pass to
          // create_wishlist_item.
          return { ok: false, error: result.error, url };
        }
        return { ok: true, url, ...result.info };
      },
    }),

    create_wishlist_item: tool({
      description:
        "Add an item to the user's wishlist (things they want to buy later). Use whenever the user says they want something, asks to save a product, or pastes a URL with intent like 'I want this' or 'add this to my wishlist'. ALWAYS pass `url` if the user shared one — they expect it stored. ALWAYS pass `price` if you have it from fetch_product_info OR the user mentioned one. Title is required; everything else is encouraged.",
      inputSchema: z.object({
        title: z
          .string()
          .describe("Short product name, e.g. 'MacBook Pro 16 inch', 'Nike Pegasus running shoes'."),
        url: z
          .string()
          .optional()
          .describe(
            "Product URL. REQUIRED if the user shared one — never omit it in that case. Leave unset only when the user didn't paste a link."
          ),
        price: z
          .number()
          .optional()
          .describe(
            "Price in EUR. Pass this whenever you know it — from fetch_product_info or because the user mentioned it. Leave unset only if no price is available anywhere."
          ),
        notes: z
          .string()
          .optional()
          .describe("Extra context — color, size, why they want it, etc."),
      }),
      execute: async (input) => {
        // Treat empty string as missing — `?? null` only catches null/undefined.
        const safeUrl =
          input.url && input.url.trim().length > 0 ? input.url.trim() : null;
        const { data, error } = await supabase
          .from("wishlist_items")
          .insert({
            user_id: userId,
            title: input.title,
            url: safeUrl,
            price: input.price ?? null,
            notes: input.notes ?? null,
          })
          .select("id, title, url, price, notes")
          .single();
        if (error) return { ok: false, error: error.message };
        // Bust Next.js's router cache so the next visit to /wishlist re-renders
        // with the just-inserted row. Server actions do this automatically;
        // tool calls run in the chat API route and need it explicit.
        revalidatePath("/wishlist");
        const url_was_saved = data.url !== null && data.url !== "";
        const price_was_saved = data.price !== null;
        // Build the exact confirmation line the AI should use. Including a
        // ready-made reply is the surest way to stop hallucination — the AI
        // just has to repeat it.
        const parts = [`Added **${data.title}** to your wishlist`];
        const tail: string[] = [];
        if (price_was_saved) tail.push(`€${data.price}`);
        if (url_was_saved) tail.push("link saved");
        const reply_to_user =
          tail.length > 0 ? `${parts[0]} — ${tail.join(", ")}.` : `${parts[0]}.`;
        return {
          ok: true,
          id: data.id,
          url_was_saved,
          price_was_saved,
          saved: {
            title: data.title,
            url: data.url,
            price: data.price,
            notes: data.notes,
          },
          reply_to_user,
        };
      },
    }),

    list_events: tool({
      description:
        "Fetch existing events, optionally filtered. Use when the user asks about their schedule or when in planning mode so you can see what's already on the calendar.",
      inputSchema: z.object({
        category_id: z.string().optional(),
        start_after: z.string().optional(),
        start_before: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        let q = supabase
          .from("events")
          .select(
            "id, title, description, location, category_id, start_at, end_at, all_day, recurring, created_at"
          )
          .order("start_at", { ascending: true })
          .limit(input.limit ?? 20);
        if (input.category_id) q = q.eq("category_id", input.category_id);
        if (input.start_after) q = q.gte("start_at", input.start_after);
        if (input.start_before) q = q.lte("start_at", input.start_before);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, events: data ?? [] };
      },
    }),
  };
}
