import { redirect } from "next/navigation";

export default function RootPage() {
  // TODO: Replace with real auth check once Supabase is wired.
  // Signed in → /chat. Signed out → /login.
  redirect("/chat");
}
