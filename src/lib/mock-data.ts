import type { Category, Task, ChatMessage } from "./types";

export const mockCategories: Category[] = [
  { id: "cat-personal", name: "Personal", color: "#4DA8FF", icon: "User", context: "Personal life, errands, family." },
  { id: "cat-home", name: "Home", color: "#7C82FF", icon: "Home", context: "Apartment, maintenance, household." },
  { id: "cat-biz1", name: "Business 1", color: "#00D4B8", icon: "Briefcase", context: "Primary business venture." },
  { id: "cat-biz2", name: "Business 2", color: "#FF8E4D", icon: "Rocket", context: "Side venture — SaaS in development." },
  { id: "cat-gym", name: "Gym", color: "#F2545B", icon: "Dumbbell", context: "Strength training, mobility, cardio." },
];

const now = new Date();
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000).toISOString();

export const mockTasks: Task[] = [
  {
    id: "t1",
    category_id: "cat-biz1",
    title: "Draft proposal for Q3 client expansion",
    description: "Outline scope, pricing tiers, and timeline. Reference last quarter's growth deck.",
    status: "todo",
    priority: 1,
    due_date: days(2),
    scheduled_for: hours(2),
    created_at: days(-1),
  },
  {
    id: "t2",
    category_id: "cat-gym",
    title: "Hit a deadlift PR",
    status: "doing",
    priority: 2,
    scheduled_for: days(1),
    recurring: "weekly:mon,wed,fri",
    created_at: days(-3),
  },
  {
    id: "t3",
    category_id: "cat-biz2",
    title: "Land first 10 dental practice waitlist signups",
    description: "Cold outreach + waitlist landing page tweaks.",
    status: "todo",
    priority: 1,
    due_date: days(7),
    created_at: days(-5),
  },
  {
    id: "t4",
    category_id: "cat-personal",
    title: "Call the dentist about cleaning",
    status: "todo",
    priority: 3,
    scheduled_for: days(1),
    created_at: days(-1),
  },
  {
    id: "t5",
    category_id: "cat-home",
    title: "Order replacement filter for the AC",
    status: "todo",
    priority: 4,
    due_date: days(5),
    created_at: days(-2),
  },
  {
    id: "t6",
    category_id: "cat-biz1",
    title: "Review last week's KPIs",
    status: "done",
    priority: 3,
    completed_at: days(-1),
    created_at: days(-7),
  },
  {
    id: "t7",
    category_id: "cat-gym",
    title: "Mobility flow — 20 min",
    status: "blocked",
    priority: 4,
    scheduled_for: days(0),
    created_at: days(-1),
  },
];

export const mockMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    text: "I have an hour, what should I work on?",
    created_at: hours(-2),
  },
  {
    id: "m2",
    role: "assistant",
    tool_calls: [
      { name: "list_tasks", input: { status: "todo" } },
      { name: "search_memory", input: { query: "energy preferences time of day" } },
    ],
    text: "It's morning — your best deep-work window. You've got **'Draft proposal for Q3 client expansion'** in Business 1, priority 1, due in two days. Want to start there, or push to something quicker?",
    created_at: hours(-2),
  },
  {
    id: "m3",
    role: "user",
    text: "Let's do that. Block 50 minutes for it.",
    created_at: hours(-1),
  },
  {
    id: "m4",
    role: "assistant",
    tool_calls: [{ name: "schedule_reminder", input: { task_id: "t1", when: "in 50 minutes" } }],
    text: "Done — I'll nudge you in 50 to wrap up.",
    created_at: hours(-1),
  },
];

export function categoryById(id: string | null | undefined): Category | undefined {
  if (!id) return undefined;
  return mockCategories.find((c) => c.id === id);
}
