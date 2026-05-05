"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, MicOff, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

// Web Speech API has no Vercel-AI-SDK type yet; minimal local typing.
type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SREvent = {
  resultIndex: number;
  results: { isFinal: boolean; 0: { transcript: string } }[];
};
type SRConstructor = new () => SR;

declare global {
  interface Window {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  }
}

export default function VoicePage() {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const recogRef = useRef<SR | null>(null);
  const finalRef = useRef("");

  // Detect support on mount
  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(typeof SR === "function");
  }, []);

  function ensureRecog(): SR | null {
    if (recogRef.current) return recogRef.current;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e) => {
      let interim = "";
      let final = finalRef.current;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += piece;
        else interim += piece;
      }
      finalRef.current = final;
      setTranscript(final + interim);
    };

    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setPermError("Microphone permission was blocked. Allow it in your browser to use voice mode.");
      } else if (e.error === "no-speech") {
        setPermError("Didn't catch that. Try tapping the mic again.");
      } else {
        setPermError(`Voice error: ${e.error}`);
      }
      setState("idle");
    };

    r.onend = () => {
      const text = finalRef.current.trim();
      if (!text) {
        setState("idle");
        return;
      }
      void handleResponse(text);
    };

    recogRef.current = r;
    return r;
  }

  async function startListening() {
    setPermError(null);
    setReply(null);
    setTranscript("");
    finalRef.current = "";
    const r = ensureRecog();
    if (!r) return;
    try {
      r.start();
      setState("listening");
    } catch {
      // Already started — abort and restart cleanly.
      r.abort();
      setTimeout(() => r.start(), 50);
      setState("listening");
    }
  }

  function stopListening() {
    recogRef.current?.stop();
  }

  async function handleResponse(userText: string) {
    setState("thinking");
    // TODO Phase 2: POST to /api/chat with userText, stream tool calls + final text.
    // For now: mocked Coach reply.
    await new Promise((r) => setTimeout(r, 900));
    const replyText = mockCoachReply(userText);
    setReply(replyText);
    setState("speaking");
    speak(replyText, () => setState("idle"));
  }

  function speak(text: string, onDone: () => void) {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      utter.pitch = 1.0;
      utter.onend = onDone;
      utter.onerror = onDone;
      window.speechSynthesis.speak(utter);
    } catch {
      onDone();
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      try { recogRef.current?.abort(); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
    };
  }, []);

  return (
    <div className="ambient-bg relative min-h-dvh" data-voice-state={state}>
      {/* Top bar — close + theme toggle */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-5">
        <Link
          href="/chat"
          className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <X className="h-4 w-4" />
          <span>Exit voice</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="voice-stage px-6">
        {/* Orb */}
        <div className="orb mb-12">
          <div className="orb-ring" />
          <div className="orb-ring r2" />
          <div className="orb-core" />
        </div>

        {/* State label */}
        <div className="text-center min-h-[80px] flex flex-col items-center justify-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)] mb-2">
            {stateLabel(state, supported, permError)}
          </div>

          {state === "listening" && transcript && (
            <p className="max-w-xl text-[18px] leading-relaxed text-[var(--color-text)] font-medium">
              {transcript}
            </p>
          )}

          {(state === "speaking" || state === "thinking") && reply && (
            <p className="max-w-xl text-[18px] leading-relaxed text-[var(--color-text-muted)]">
              {reply}
            </p>
          )}

          {state === "idle" && !permError && (
            <p className="max-w-md text-[14px] text-[var(--color-text-muted)]">
              Tap the mic and tell the Coach what you need.
            </p>
          )}

          {permError && (
            <div className="flex items-center gap-2 mt-2 max-w-md text-[13px] text-[var(--color-warning)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{permError}</span>
            </div>
          )}

          {supported === false && (
            <div className="flex items-center gap-2 mt-2 max-w-md text-[13px] text-[var(--color-warning)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Your browser doesn&apos;t support the Web Speech API. Try Chrome or Edge.
              </span>
            </div>
          )}
        </div>

        {/* Mic button */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={() => {
              if (state === "listening") stopListening();
              else if (state === "idle") void startListening();
            }}
            disabled={!supported || state === "thinking" || state === "speaking"}
            aria-label={state === "listening" ? "Stop listening" : "Start listening"}
            className={cn(
              "relative flex h-16 w-16 items-center justify-center rounded-full transition-all",
              "border disabled:opacity-40 disabled:cursor-not-allowed",
              state === "listening"
                ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border-transparent shadow-[var(--shadow-button-primary)] scale-105"
                : "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border-strong)] hover:border-[var(--color-border-accent)] hover:bg-[var(--color-surface-hover)]"
            )}
          >
            {state === "listening" ? (
              <MicOff className="h-6 w-6" strokeWidth={2} />
            ) : (
              <Mic className="h-6 w-6" strokeWidth={2} />
            )}
            {state === "listening" && (
              <span className="absolute inset-0 rounded-full ring-2 ring-[var(--color-accent)] animate-ping" />
            )}
          </button>
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
            {state === "listening" ? "Tap to stop" : "Tap to speak"}
          </div>
        </div>
      </div>

      {/* Disclosure */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[10.5px] text-[var(--color-text-subtle)]">
        Voice mode uses your browser&apos;s built-in speech recognition. The Coach&apos;s responses are mocked until Phase 2.
      </div>
    </div>
  );
}

function stateLabel(state: VoiceState, supported: boolean | null, err: string | null) {
  if (err) return "Issue";
  if (supported === false) return "Unsupported";
  switch (state) {
    case "idle": return "Ready";
    case "listening": return "Listening…";
    case "thinking": return "Thinking…";
    case "speaking": return "Speaking";
  }
}

// Mock Coach reply — replaced with real /api/chat call in Phase 2.
function mockCoachReply(userText: string): string {
  const t = userText.toLowerCase();
  if (t.includes("what should") || t.includes("what now") || t.includes("bored")) {
    return "It's morning, your best deep-work window. You've got 'Draft proposal for Q3 client expansion' in Business 1, priority one. Want to start there?";
  }
  if (t.includes("remind") || t.includes("schedule")) {
    return "Got it. I'll add that as a reminder once Phase 2 is live and the Coach can actually call create_task.";
  }
  if (t.includes("gym") || t.includes("workout") || t.includes("deadlift")) {
    return "Logged. Want me to schedule it for tomorrow morning, or just keep it open?";
  }
  return `Heard you. You said: "${userText}". This is a mocked reply — the real Coach lands in Phase 2.`;
}
