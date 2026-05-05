"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, ArrowRight, Lock, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";

const URL_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "This email isn't authorized to sign in.",
};

// useSearchParams forces a Suspense boundary in production builds — Next.js bails
// out of static prerendering when it sees the hook. Outer wrapper provides the boundary.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const urlError = params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? URL_ERROR_MESSAGES[urlError] ?? "Something went wrong." : null
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@") || !password) {
      setError("Email and password required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Sign-in failed.");
        return;
      }
      // Server set the session cookies. Hard-navigate so the proxy picks them up.
      window.location.href = "/chat";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-6">
      <div className="relative w-full max-w-[400px]">
        <div
          aria-hidden
          className="absolute -inset-px rounded-2xl pointer-events-none"
          style={{
            background: "var(--gradient-login-rim)",
            filter: "blur(0.5px)",
          }}
        />

        <div className="relative float-card p-8 rounded-2xl">
          <div className="flex items-center gap-2.5 mb-7">
            <BrandMark size="md" />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold tracking-tight">Nextsteppp</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
                Single user · Sign in
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight mb-1.5">Welcome back, Sief.</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mb-7">
            Sign in with your owner email and password.
          </p>

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
                Email
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
            </label>

            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-subtle)] mb-1.5">
                Password
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
                <Input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 pr-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </label>

            {error && (
              <div className="text-[12px] text-[var(--color-danger)]">{error}</div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-7 flex items-center gap-2 text-[11px] text-[var(--color-text-subtle)]">
            <Lock className="h-3 w-3" />
            <span>Only the configured owner email can sign in.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
