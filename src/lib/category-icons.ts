// Shared icon set + color palette used wherever categories render
// (sidebar, settings, category detail, the icon/color picker). Keep all
// three in sync by importing from here rather than redefining locally —
// otherwise a category that picks "Heart" will appear correctly on the
// detail page but show the fallback icon in the sidebar.

import {
  User,
  Home,
  Briefcase,
  Rocket,
  Dumbbell,
  Heart,
  Star,
  BookOpen,
  Music,
  Plane,
  Coffee,
  Code,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  User,
  Home,
  Briefcase,
  Rocket,
  Dumbbell,
  Heart,
  Star,
  BookOpen,
  Music,
  Plane,
  Coffee,
  Code,
};

// Ordered list — picker renders in this order.
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICON_MAP);

export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return User;
  return CATEGORY_ICON_MAP[name] ?? User;
}

// Curated palette. Values picked to read well on both light and dark themes
// and to stay distinguishable when desaturated for the icon-tile background.
export const CATEGORY_COLORS = [
  "#60a5fa", // blue
  "#818cf8", // indigo
  "#a78bfa", // violet
  "#e879f9", // fuchsia
  "#f472b6", // pink
  "#fb7185", // rose
  "#fb923c", // orange
  "#facc15", // yellow
  "#a3e635", // lime
  "#34d399", // emerald
  "#22d3ee", // cyan
  "#94a3b8", // slate
];
