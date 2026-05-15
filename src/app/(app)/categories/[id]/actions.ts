"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_ICON_MAP, CATEGORY_COLORS } from "@/lib/category-icons";

export async function updateCategoryAppearance(
  id: string,
  patch: { icon?: string; color?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Defensive validation — only check what's actually being changed. The
  // existing icon/color on a row may be outside our curated set (e.g. the
  // Coach created the category with values it picked freely); we don't want
  // to block updating one field just because the other is non-curated.
  const update: { icon?: string; color?: string } = {};
  if (patch.icon !== undefined) {
    if (!CATEGORY_ICON_MAP[patch.icon]) {
      return { ok: false, error: `unknown icon: ${patch.icon}` };
    }
    update.icon = patch.icon;
  }
  if (patch.color !== undefined) {
    if (!CATEGORY_COLORS.includes(patch.color)) {
      return { ok: false, error: `unknown color: ${patch.color}` };
    }
    update.color = patch.color;
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, error: "nothing to update" };
  }

  // .select() so we can detect zero-rows-updated (RLS filtered the row out
  // because user_id doesn't match the session). Without this we'd return
  // ok:true even when nothing happened, and the UI would silently revert.
  const { data, error } = await supabase
    .from("categories")
    .update(update)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "not allowed (this category belongs to another user)" };
  }

  // The sidebar (mounted in the app layout) shows the category icon and
  // color too, so revalidate the layout in addition to the detail page.
  revalidatePath(`/categories/${id}`);
  revalidatePath("/(app)", "layout");
  return { ok: true };
}
