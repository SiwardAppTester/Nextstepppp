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

    update_user_profile: tool({
      description:
        "Update the user's cross-cutting profile — durable facts about who they are that don't fit a single category: preferences, work style, values, key people across their life, recurring habits, ambitions that span categories. Read the existing profile from <user_context>, integrate the new fact naturally while preserving everything important, and return the FULL updated profile string. Consolidate older info if the profile grows past ~1500 characters. Pair with the category-specific update_category_context — facts about ONE category go there, cross-cutting facts go here.",
      inputSchema: z.object({
        new_profile: z.string(),
        change_summary: z
          .string()
          .describe("Short human-readable note about what changed."),
      }),
      execute: async ({ new_profile, change_summary }) => {
        const { error } = await supabase.from("user_settings").upsert(
          {
            user_id: userId,
            profile: new_profile,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (error) return { ok: false, error: error.message };
        return { ok: true, change_summary };
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

    delete_category: tool({
      description:
        "Permanently delete a category. Tasks, events, and goals linked to it are NOT cascaded — they're orphaned with category_id set to null. Destructive: only call after the user explicitly confirms (don't act on a single 'remove' if the category has any tasks/events/goals attached).",
      inputSchema: z.object({ category_id: z.string() }),
      execute: async ({ category_id }) => {
        const { error } = await supabase
          .from("categories")
          .delete()
          .eq("id", category_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, category_id };
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

    list_wishlist_items: tool({
      description:
        "List the user's wishlist items, newest first. Defaults to status='open' (still want to buy). Pass status='bought' for purchase history or 'discarded' for items the user dropped.",
      inputSchema: z.object({
        status: z
          .enum(["open", "bought", "discarded"])
          .optional()
          .describe("Filter by status. Defaults to 'open'."),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        const { data, error } = await supabase
          .from("wishlist_items")
          .select(
            "id, title, url, price, notes, status, bought_at, created_at"
          )
          .eq("status", input.status ?? "open")
          .order("created_at", { ascending: false })
          .limit(input.limit ?? 30);
        if (error) return { ok: false, error: error.message };
        return { ok: true, items: data ?? [] };
      },
    }),

    update_wishlist_item: tool({
      description:
        "Update fields on an existing wishlist item: title, url, price, or notes. To change status (bought / discarded / re-open), use set_wishlist_status instead.",
      inputSchema: z.object({
        item_id: z.string(),
        title: z.string().optional(),
        url: z.string().nullable().optional(),
        price: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async ({ item_id, ...rest }) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) patch[k] = v;
        }
        if (Object.keys(patch).length === 0) {
          return { ok: false, error: "Nothing to update." };
        }
        const { data, error } = await supabase
          .from("wishlist_items")
          .update(patch)
          .eq("id", item_id)
          .select("id")
          .single();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "Wishlist item not found." };
        revalidatePath("/wishlist");
        return { ok: true, id: data.id };
      },
    }),

    set_wishlist_status: tool({
      description:
        "Change a wishlist item's status. 'bought' = user purchased it (stamps bought_at). 'discarded' = no longer wanted (keeps the row for history). 'open' = reactivate. Use when the user says 'I got the X', 'bought it', 'not interested anymore', etc.",
      inputSchema: z.object({
        item_id: z.string(),
        status: z.enum(["open", "bought", "discarded"]),
      }),
      execute: async ({ item_id, status }) => {
        const patch = {
          status,
          bought_at: status === "bought" ? new Date().toISOString() : null,
        };
        const { data, error } = await supabase
          .from("wishlist_items")
          .update(patch)
          .eq("id", item_id)
          .select("id")
          .single();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: "Wishlist item not found." };
        revalidatePath("/wishlist");
        return { ok: true, id: data.id, status };
      },
    }),

    delete_wishlist_item: tool({
      description:
        "Permanently delete a wishlist item. Destructive: only call when the user explicitly says delete/remove. For 'I bought it' use set_wishlist_status (status='bought') instead — that preserves the row as history.",
      inputSchema: z.object({ item_id: z.string() }),
      execute: async ({ item_id }) => {
        const { error } = await supabase
          .from("wishlist_items")
          .delete()
          .eq("id", item_id);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/wishlist");
        return { ok: true, item_id };
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

    // =====================================================================
    // Finance — read-only. Spending/income data lives in `transactions`,
    // bucketed by `finance_pockets`. Statements upload from /finance.
    // user_id filtering is explicit (in addition to RLS) so these tools
    // stay correct when called from the Telegram path with the admin client.
    // =====================================================================

    list_pockets: tool({
      description:
        "List the user's finance pockets (spending/income buckets like 'Groceries', 'Rent income', 'Subscriptions'). Call this before summarize_finances or list_transactions when the user asks about a specific category of spending so you can find the matching pocket id.",
      inputSchema: z.object({
        include_archived: z.boolean().optional(),
      }),
      execute: async ({ include_archived }) => {
        let q = supabase
          .from("finance_pockets")
          .select("id, name, description, group_name, color, is_archived")
          .eq("user_id", userId)
          .order("group_name", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true });
        if (!include_archived) q = q.eq("is_archived", false);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, pockets: data ?? [] };
      },
    }),

    list_bank_accounts: tool({
      description:
        "List the user's bank accounts with their currency and most recent balance (from the latest transaction). Use when the user asks 'what's my balance' or wants an overview of their accounts.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: accounts, error } = await supabase
          .from("bank_accounts")
          .select("id, nickname, bank_name, iban, currency, color, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });
        if (error) return { ok: false, error: error.message };

        // For each account fetch the most recent transaction's balance_after.
        // Small N (handful of accounts), so individual queries are fine.
        const enriched = await Promise.all(
          (accounts ?? []).map(async (acc) => {
            const { data: latest } = await supabase
              .from("transactions")
              .select("balance_after, txn_date")
              .eq("user_id", userId)
              .eq("account_id", acc.id)
              .order("txn_date", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            return {
              ...acc,
              latest_balance: latest?.balance_after ?? null,
              latest_txn_date: latest?.txn_date ?? null,
            };
          })
        );
        return { ok: true, accounts: enriched };
      },
    }),

    summarize_finances: tool({
      description:
        "Summarize income / expenses / net for a date range. Optionally narrow by bank account (account_id) and/or pocket (pocket_id), and break totals down by pocket or pocket group. Dates are ISO YYYY-MM-DD. For per-account questions ('how much did I spend from my ING personal account'), call list_bank_accounts first to resolve the name/nickname to an account_id.",
      inputSchema: z.object({
        start_date: z.string().describe("Inclusive start, ISO YYYY-MM-DD."),
        end_date: z.string().describe("Inclusive end, ISO YYYY-MM-DD."),
        group_by: z
          .enum(["none", "pocket", "pocket_group"])
          .optional()
          .describe("How to break down totals. Default 'none' = totals only."),
        pocket_id: z.string().optional().describe("Limit to a specific pocket."),
        account_id: z
          .string()
          .optional()
          .describe(
            "Limit to a specific bank account. Resolve via list_bank_accounts first when the user names an account."
          ),
      }),
      execute: async ({
        start_date,
        end_date,
        group_by = "none",
        pocket_id,
        account_id,
      }) => {
        let q = supabase
          .from("transactions")
          .select(
            "amount, direction, pocket_id, finance_pockets:pocket_id (name, group_name)"
          )
          .eq("user_id", userId)
          .gte("txn_date", start_date)
          .lte("txn_date", end_date);
        if (pocket_id) q = q.eq("pocket_id", pocket_id);
        if (account_id) q = q.eq("account_id", account_id);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };

        type Row = {
          amount: number;
          direction: "in" | "out";
          pocket_id: string | null;
          finance_pockets: { name: string | null; group_name: string | null } | null;
        };
        const rows = (data ?? []) as unknown as Row[];

        let total_in = 0;
        let total_out = 0;
        const groups = new Map<
          string,
          { key: string; total_in: number; total_out: number; txn_count: number }
        >();

        for (const r of rows) {
          const amt = Number(r.amount);
          if (r.direction === "in") total_in += amt;
          else total_out += Math.abs(amt);

          if (group_by !== "none") {
            const key =
              group_by === "pocket"
                ? r.finance_pockets?.name ?? "(uncategorized)"
                : r.finance_pockets?.group_name ?? "(uncategorized)";
            const g =
              groups.get(key) ?? { key, total_in: 0, total_out: 0, txn_count: 0 };
            if (r.direction === "in") g.total_in += amt;
            else g.total_out += Math.abs(amt);
            g.txn_count += 1;
            groups.set(key, g);
          }
        }

        const round = (n: number) => Math.round(n * 100) / 100;
        return {
          ok: true,
          range: { start_date, end_date },
          total_in: round(total_in),
          total_out: round(total_out),
          net: round(total_in - total_out),
          txn_count: rows.length,
          breakdown:
            group_by === "none"
              ? null
              : [...groups.values()]
                  .map((g) => ({
                    [group_by === "pocket" ? "pocket" : "group"]: g.key,
                    total_in: round(g.total_in),
                    total_out: round(g.total_out),
                    net: round(g.total_in - g.total_out),
                    txn_count: g.txn_count,
                  }))
                  .sort(
                    (a, b) =>
                      Math.abs(b.total_out) + Math.abs(b.total_in) -
                      (Math.abs(a.total_out) + Math.abs(a.total_in))
                  ),
        };
      },
    }),

    list_transactions: tool({
      description:
        "List individual transactions in a date range, optionally filtered by bank account, direction, pocket, or amount. Use for 'show me my biggest expenses', 'what did I buy last week', 'list my recurring subscriptions', 'transactions from my ING account this month'. For account-scoped queries, call list_bank_accounts first to resolve the name to an account_id. Returns at most `limit` rows (default 20, max 100), sorted newest first.",
      inputSchema: z.object({
        start_date: z.string().optional().describe("Inclusive ISO YYYY-MM-DD."),
        end_date: z.string().optional().describe("Inclusive ISO YYYY-MM-DD."),
        direction: z
          .enum(["in", "out"])
          .optional()
          .describe("'in' = income, 'out' = expenses. Omit for both."),
        pocket_id: z.string().optional(),
        account_id: z
          .string()
          .optional()
          .describe(
            "Limit to a specific bank account. Resolve via list_bank_accounts first when the user names an account."
          ),
        min_amount: z
          .number()
          .optional()
          .describe("Filter to txns with abs(amount) >= this."),
        is_recurring: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        sort_by: z
          .enum(["date_desc", "amount_desc"])
          .optional()
          .describe("Default 'date_desc'. Use 'amount_desc' for biggest-first."),
      }),
      execute: async (input) => {
        const limit = input.limit ?? 20;
        let q = supabase
          .from("transactions")
          .select(
            "id, txn_date, amount, direction, clean_counterparty, raw_counterparty, description, pocket_id, account_id, is_recurring, finance_pockets:pocket_id (name, group_name)"
          )
          .eq("user_id", userId)
          .limit(limit);

        if (input.start_date) q = q.gte("txn_date", input.start_date);
        if (input.end_date) q = q.lte("txn_date", input.end_date);
        if (input.direction) q = q.eq("direction", input.direction);
        if (input.pocket_id) q = q.eq("pocket_id", input.pocket_id);
        if (input.account_id) q = q.eq("account_id", input.account_id);
        if (input.is_recurring !== undefined)
          q = q.eq("is_recurring", input.is_recurring);

        if (input.sort_by === "amount_desc") {
          // Sorting by absolute value isn't directly possible in PostgREST, so
          // we fetch a wider window and sort in-memory. Ceiling at 500 rows
          // keeps memory bounded.
          q = q.order("txn_date", { ascending: false }).limit(500);
        } else {
          q = q.order("txn_date", { ascending: false });
        }

        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };

        let rows = data ?? [];
        if (input.min_amount !== undefined) {
          const min = input.min_amount;
          rows = rows.filter((r) => Math.abs(Number(r.amount)) >= min);
        }
        if (input.sort_by === "amount_desc") {
          rows = [...rows]
            .sort(
              (a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))
            )
            .slice(0, limit);
        }

        return { ok: true, transactions: rows };
      },
    }),

    update_settings: tool({
      // Cache breakpoint lives on the LAST tool in this object. Anthropic
      // caches system prompt + every preceding tool definition up to and
      // including this marker, at ~10% of normal input cost within the
      // 5-min TTL. Move this breakpoint if you reorder.
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      description:
        "Update user settings. Only currently exposed: auto_confirm. When ON, the Coach skips 'should I add this?' check-ins on routine captures. Use when the user says 'turn on auto-confirm', 'enable save-first mode', 'stop asking me before adding things', etc. Changes apply on the next turn (the current turn's <user_context> already reflects the old value).",
      inputSchema: z.object({
        auto_confirm: z.boolean().optional(),
      }),
      execute: async ({ auto_confirm }) => {
        if (auto_confirm === undefined) {
          return { ok: false, error: "Nothing to update." };
        }
        const { error } = await supabase.from("user_settings").upsert(
          {
            user_id: userId,
            auto_confirm,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (error) return { ok: false, error: error.message };
        revalidatePath("/settings");
        return { ok: true, auto_confirm };
      },
    }),
  };
}
