"use client";

import { useState, useMemo, useTransition, useRef } from "react";
import { Plus, Search, ChevronDown, X } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { TaskRow } from "@/components/task-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Task, Category, TaskStatus } from "@/lib/types";
import { createTask, toggleTaskStatus, deleteTask } from "./actions";

const statusFilters: { id: TaskStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "todo", label: "Todo" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
  { id: "blocked", label: "Blocked" },
];

type Props = {
  initialTasks: Task[];
  categories: Category[];
  initialCategoryFilter: string;
};

export function TasksView({ initialTasks, categories, initialCategoryFilter }: Props) {
  const [activeStatus, setActiveStatus] = useState<TaskStatus | "all">("all");
  const [activeCategory, setActiveCategory] = useState<string>(initialCategoryFilter);
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    return initialTasks.filter((t) => {
      if (activeStatus !== "all" && t.status !== activeStatus) return false;
      if (activeCategory !== "all" && t.category_id !== activeCategory) return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [initialTasks, activeStatus, activeCategory, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: initialTasks.length };
    for (const t of initialTasks) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [initialTasks]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <Topbar
        crumbs={[{ label: "Tasks" }]}
        right={
          <Button size="sm" variant="primary" onClick={() => setShowNew((s) => !s)}>
            {showNew ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showNew ? "Cancel" : "New task"}
          </Button>
        }
      />

      {showNew && (
        <NewTaskRow
          categories={categories}
          defaultCategoryId={activeCategory !== "all" ? activeCategory : null}
          onClose={() => setShowNew(false)}
        />
      )}

      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/60 backdrop-blur-sm px-6 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
            <Input
              placeholder="Search tasks…"
              className="pl-9 h-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
            {statusFilters.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveStatus(f.id)}
                className={cn(
                  "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all",
                  activeStatus === f.id
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text)] shadow-[0_0_0_1px_var(--color-border-strong)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                )}
              >
                {f.label}
                <span className="ml-1.5 text-[10px] tabular-nums text-[var(--color-text-subtle)]">
                  {counts[f.id] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <CategoryDropdown
            value={activeCategory}
            onChange={setActiveCategory}
            categories={categories}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[820px] space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
              <div className="text-[14px] text-[var(--color-text-muted)] mb-1">
                {initialTasks.length === 0 ? "No tasks yet." : "No tasks match these filters."}
              </div>
              {initialTasks.length === 0 && (
                <div className="text-[12px] text-[var(--color-text-subtle)]">
                  Click <span className="text-[var(--color-text)]">New task</span> to add one,
                  or just tell the Coach in chat.
                </div>
              )}
            </div>
          )}
          {filtered.map((t) => (
            <InteractiveTaskRow key={t.id} task={t} categories={categories} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InteractiveTaskRow({ task, categories }: { task: Task; categories: Category[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("relative", pending && "opacity-50 pointer-events-none")}>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => startTransition(() => void toggleTaskStatus(task.id, task.status))}
        title={task.status === "done" ? "Mark not done" : "Mark done"}
      >
        <TaskRow task={task} categories={categories} />
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete "${task.title}"?`)) {
            startTransition(() => void deleteTask(task.id));
          }
        }}
        title="Delete task"
        aria-label="Delete task"
        className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function NewTaskRow({
  categories,
  defaultCategoryId,
  onClose,
}: {
  categories: Category[];
  defaultCategoryId: string | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createTask(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      onClose();
    });
  }

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 backdrop-blur-sm px-6 py-3.5">
      <form ref={formRef} action={onSubmit} className="mx-auto flex max-w-[820px] items-center gap-2">
        <Input
          name="title"
          placeholder="What needs to happen?"
          autoFocus
          required
          className="flex-1"
        />
        <select
          name="category_id"
          defaultValue={defaultCategoryId ?? ""}
          className={cn(
            "appearance-none cursor-pointer h-10 rounded-[10px] border bg-[var(--color-surface)] px-3 text-[13px]",
            "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-border-strong)]",
            "focus:outline-none focus:border-[var(--color-border-accent)]"
          )}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue="3"
          className={cn(
            "appearance-none cursor-pointer h-10 rounded-[10px] border bg-[var(--color-surface)] px-3 text-[13px]",
            "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-border-strong)]",
            "focus:outline-none focus:border-[var(--color-border-accent)]"
          )}
        >
          <option value="1">P1 — High</option>
          <option value="2">P2</option>
          <option value="3">P3 — Default</option>
          <option value="4">P4</option>
          <option value="5">P5 — Low</option>
        </select>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
      {error && (
        <div className="mx-auto mt-2 max-w-[820px] text-[12px] text-[var(--color-danger)]">
          {error}
        </div>
      )}
    </div>
  );
}

function CategoryDropdown({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
}) {
  const selected = value === "all" ? null : categories.find((c) => c.id === value);
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "appearance-none cursor-pointer h-9 rounded-[10px] border bg-[var(--color-surface)] pl-8 pr-8 text-[12.5px] font-medium",
          "border-[var(--color-border)] text-[var(--color-text)]",
          "hover:border-[var(--color-border-strong)] focus:outline-none focus:border-[var(--color-border-accent)]",
          "transition-colors"
        )}
      >
        <option value="all">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full"
        style={{
          backgroundColor: selected?.color ?? "var(--color-text-subtle)",
          boxShadow: selected ? `0 0 6px ${selected.color}` : undefined,
        }}
      />
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]"
        strokeWidth={2}
      />
    </div>
  );
}
