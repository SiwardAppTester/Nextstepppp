"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Listens for INSERT/UPDATE/DELETE on tables the Coach can mutate and triggers
 * router.refresh() so server-rendered surfaces (sidebar counts, task list,
 * calendar, etc.) reflect changes made from another surface — primarily the
 * Telegram bridge — without requiring a manual reload.
 *
 * RLS limits broadcasts to rows the current user can see, so an unfiltered
 * subscription is safe in this single-user app. A short debounce coalesces
 * bursts (e.g. a tool loop creating several tasks in quick succession) into
 * one refresh.
 */
const TABLES = ["tasks", "events", "goals", "categories", "wishlist_items"] as const;
const DEBOUNCE_MS = 300;

export function RealtimeRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("app-mutations");

    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
      }, DEBOUNCE_MS);
    };

    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh
      );
    }

    channel.subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
