"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WishlistStatus } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function addWishlistItem(input: {
  title: string;
  url?: string;
  price?: number | null;
  notes?: string;
}) {
  const { supabase, user } = await requireUser();
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Title can't be empty." };

  const url = input.url?.trim() || null;
  const notes = input.notes?.trim() || null;
  const price = input.price ?? null;

  const { error } = await supabase.from("wishlist_items").insert({
    user_id: user.id,
    title,
    url,
    price,
    notes,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/wishlist");
  return { ok: true as const };
}

export async function updateWishlistItem(
  id: string,
  patch: { title?: string; url?: string | null; price?: number | null; notes?: string | null }
) {
  const { supabase } = await requireUser();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) return { ok: false as const, error: "Title can't be empty." };
    update.title = trimmed;
  }
  if (patch.url !== undefined) update.url = patch.url?.trim() || null;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  if (Object.keys(update).length === 0) {
    return { ok: false as const, error: "Nothing to update." };
  }

  const { error } = await supabase.from("wishlist_items").update(update).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/wishlist");
  return { ok: true as const };
}

export async function setWishlistStatus(id: string, status: WishlistStatus) {
  const { supabase } = await requireUser();
  const update: Record<string, unknown> = { status };
  if (status === "bought") update.bought_at = new Date().toISOString();
  else update.bought_at = null;

  const { error } = await supabase.from("wishlist_items").update(update).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/wishlist");
  return { ok: true as const };
}

export async function deleteWishlistItem(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("wishlist_items").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/wishlist");
  return { ok: true as const };
}
