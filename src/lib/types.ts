export type TaskStatus = "todo" | "done";
export type TaskPriority = 1 | 2 | 3 | 4 | 5;

export type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
  context?: string | null;
};

export type Task = {
  id: string;
  category_id: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string | null;
  scheduled_for?: string | null;
  recurring?: string | null;
  reminder_sent?: boolean;
  completed_at?: string | null;
  created_at: string;
};

export type ChatRole = "user" | "assistant" | "tool";

export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text?: string;
  tool_calls?: ToolCall[];
  created_at: string;
};
