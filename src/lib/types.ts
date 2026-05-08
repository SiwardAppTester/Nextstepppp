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

export type CalendarEvent = {
  id: string;
  category_id: string | null;
  goal_id?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at?: string | null;
  all_day: boolean;
  recurring?: string | null;
  created_at: string;
};

export type GoalStatus = "active" | "done" | "archived";

export type Goal = {
  id: string;
  category_id: string;
  title: string;
  description?: string | null;
  target_date?: string | null;
  status: GoalStatus;
  completed_at?: string | null;
  created_at: string;
};

export type BankAccount = {
  id: string;
  iban: string;
  nickname: string;
  description: string | null;
  bank_name: string | null;
  color: string;
  currency: string;
  created_at: string;
};

export type FinanceStatement = {
  id: string;
  account_id: string;
  filename: string | null;
  period_start: string | null;
  period_end: string | null;
  transaction_count: number;
  uploaded_at: string;
};

export type Pocket = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_archived: boolean;
  created_at: string;
  group_name: string | null;
};

export type RentalCheck = {
  id: string;
  account_id: string;
  name: string;
  expected_amount: number;
  counterparty_iban: string;
  start_date: string | null; // ISO date "YYYY-MM-DD" — null means always active
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type WishlistStatus = "open" | "bought" | "discarded";

export type WishlistItem = {
  id: string;
  title: string;
  url: string | null;
  price: number | null;
  notes: string | null;
  status: WishlistStatus;
  bought_at: string | null;
  created_at: string;
};

export type Shortcut = {
  id: string;
  label: string;
  url: string;
  position: number;
  created_at: string;
};

export type GmailAccount = {
  id: string;
  email: string;
  unread_count: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
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
