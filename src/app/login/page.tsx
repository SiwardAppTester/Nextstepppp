"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, ArrowRight, Lock, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";

const URL_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "The sign-in link was incomplete. Try requesting a new one.",
  auth_failed: "That sign-in link expired or was already used. Try again.",
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
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [devLoggingIn, setDevLoggingIn] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? URL_ERROR_MESSAGES[urlError] ?? "Something went wrong." : null
  );

  // Show the dev sign-in shortcut only on localhost. Useless in prod anyway —
  // the API itself is gated by NODE_ENV.
  useEffect(() => {
    setIsDev(
      typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1")
    );
  }, []);

  async function devSignIn() {
    setError(null);
    setDevLoggingIn(true);
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Dev sign-in failed.");
        return;
      }
      // Server set the session cookies. Hard-navigate so the proxy picks them up.
      window.location.href = "/chat";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dev sign-in failed.");
    } finally {
      setDevLoggingIn(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError("That doesn't look like an email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't send the magic link.");
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-6">
      {/* Floating glow card */}
      <div className="relative w-full max-w-[400px]">
        {/* outer glow ring */}
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
                Single user · Magic link
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight mb-1.5">Welcome back, Sief.</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mb-7">
            Enter your owner email. We'll send you a sign-in link — no passwords.
          </p>

          {submitted ? (
            <div className="rounded-xl border border-[var(--color-border-accent)] bg-[var(--color-accent-soft)] p-4 text-[13px]">
              <div className="flex items-center gap-2 text-[var(--color-accent)] font-medium mb-1">
                <Mail className="h-3.5 w-3.5" />
                Check your inbox
              </div>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                A magic link was sent to <span className="text-[var(--color-text)]">{email}</span>.
                Click it to sign in. (Wired up in Phase 1.)
              </p>
            </div>
          ) : (
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
                {submitting ? "Sending…" : "Send magic link"}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          )}

          {isDev && !submitted && (
            <>
              <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
                <span className="h-px flex-1 bg-[var(--color-border)]" />
                <span>Local dev</span>
                <span className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={devSignIn}
                disabled={devLoggingIn}
              >
                <Zap className="h-3.5 w-3.5" />
                {devLoggingIn ? "Signing in…" : "Sign in as owner (skip email)"}
              </Button>
              <p className="mt-2 text-[11px] text-[var(--color-text-subtle)]">
                Only available on localhost. Generates a magic link via the
                service-role admin API and follows it without sending any email.
              </p>
            </>
          )}

          <div className="mt-7 flex items-center gap-2 text-[11px] text-[var(--color-text-subtle)]">
            <Lock className="h-3 w-3" />
            <span>Only the configured owner email can sign in.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
