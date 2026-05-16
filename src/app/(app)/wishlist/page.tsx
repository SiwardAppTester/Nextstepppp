import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { WishlistView } from "./wishlist-view";
import type { WishlistItem } from "@/lib/types";

export default function WishlistPage() {
  return (
    <Suspense fallback={<WishlistSkeleton />}>
      <WishlistContent />
    </Suspense>
  );
}

async function WishlistContent() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("wishlist_items")
    .select("id, title, url, price, notes, status, bought_at, created_at")
    .order("created_at", { ascending: false });

  return <WishlistView items={(items ?? []) as WishlistItem[]} />;
}

function WishlistSkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar crumbs={[{ label: "Wishlist" }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[680px] space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <Skeleton className="h-5 w-5 rounded-[5px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
