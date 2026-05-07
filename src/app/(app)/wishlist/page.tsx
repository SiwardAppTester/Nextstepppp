import { createClient } from "@/lib/supabase/server";
import { WishlistView } from "./wishlist-view";
import type { WishlistItem } from "@/lib/types";

export default async function WishlistPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("wishlist_items")
    .select("id, title, url, price, notes, status, bought_at, created_at")
    .order("created_at", { ascending: false });

  return <WishlistView items={(items ?? []) as WishlistItem[]} />;
}
