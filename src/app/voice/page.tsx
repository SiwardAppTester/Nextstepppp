"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, X, AlertCircle, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type VoiceState = "idle" | "active" | "listening" | "thinking" | "speaking";

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
};

export default function VoicePage() {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Refs that survive re-renders.
  const vadRef = useRef<{ start: () => Promise<void>; pause: () => Promise<void>; destroy: () => Promise<void> } | null>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  const speakingRef = useRef(false);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    return () => {
      try { vadRef.current?.destroy(); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
    };
  }, []);

  async function startVoiceMode() {
    setError(null);
    try {
      // Lazy-load VAD — it's heavy and browser-only.
      const { MicVAD, utils } = await import("@ricky0123/vad-web");

      const vad = await MicVAD.new({
        // v5 model is more accurate; legacy is the default but slightly less crisp.
        model: "v5",
        // Don't auto-trigger onSpeechEnd while VAD is paused (e.g. while Coach speaks).
        submitUserSpeechOnPause: false,
        onSpeechStart: () => {
          if (speakingRef.current || mutedRef.current) return;
          setState("listening");
        },
        onVADMisfire: () => {
          // Too-short utterance, ignore. Stay in active state.
          if (!speakingRef.current && !mutedRef.current) setState("active");
        },
        onSpeechEnd: async (audio: Float32Array) => {
          if (speakingRef.current || mutedRef.current) return;
          await handleSpeechEnd(audio, utils.encodeWAV);
        },
      });

      vadRef.current = vad;
      await vad.start();
      setState("active");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")) {
        setError("Microphone permission was blocked. Allow it in your browser to use voice mode.");
      } else {
        setError(`Couldn't start voice mode: ${msg}`);
      }
      setState("idle");
    }
  }

  async function handleSpeechEnd(audio: Float32Array, encodeWAV: (samples: Float32Array) => ArrayBuffer) {
    setState("thinking");
    setReply(null);

    // Pause VAD so we don't transcribe Coach's own voice through the speakers.
    try { await vadRef.current?.pause(); } catch {}
    speakingRef.current = true;

    try {
      const wavBuffer = encodeWAV(audio);
      const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
      const text = (await transcribe(wavBlob)).trim();

      if (!text) {
        // Silence or noise. Resume listening, no UI churn.
        return;
      }

      setTranscript(text);

      // Append user message to the running history.
      const userMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      };
      messagesRef.current = [...messagesRef.current, userMsg];

      const replyText = await streamCoach(messagesRef.current, conversationId, setReply, setConversationId);

      if (replyText.trim()) {
        // Append Coach reply for next turn's context.
        messagesRef.current = [
          ...messagesRef.current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [{ type: "text", text: replyText }],
          },
        ];

        setState("speaking");
        await speak(replyText);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      speakingRef.current = false;
      try {
        if (!mutedRef.current) {
          await vadRef.current?.start();
          setState("active");
        } else {
          setState("idle");
        }
      } catch {
        setState("idle");
      }
    }
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) {
      try { await vadRef.current?.pause(); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
      setState("idle");
    } else {
      try {
        await vadRef.current?.start();
        setState("active");
      } catch {}
    }
  }

  return (
    <div className="ambient-bg relative min-h-dvh" data-voice-state={state}>
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
        <div className="orb mb-12">
          <div className="orb-ring" />
          <div className="orb-ring r2" />
          <div className="orb-core" />
        </div>

        <div className="text-center min-h-[100px] flex flex-col items-center justify-center max-w-xl">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)] mb-2">
            {stateLabel(state, muted, error)}
          </div>

          {(state === "thinking" || state === "speaking") && transcript && (
            <p className="text-[14px] text-[var(--color-text-subtle)] italic mb-2">
              You said: &ldquo;{transcript}&rdquo;
            </p>
          )}

          {(state === "speaking" || state === "thinking") && reply && (
            <p className="text-[18px] leading-relaxed text-[var(--color-text)] font-medium">
              {reply}
            </p>
          )}

          {state === "active" && !error && (
            <p className="text-[14px] text-[var(--color-text-muted)]">
              Listening. Just start talking — no buttons.
            </p>
          )}

          {state === "listening" && !error && (
            <p className="text-[14px] text-[var(--color-accent)] font-medium">
              I&apos;m hearing you…
            </p>
          )}

          {state === "idle" && muted && !error && (
            <p className="text-[14px] text-[var(--color-text-muted)]">
              Voice is paused. Tap the mic to resume.
            </p>
          )}

          {state === "idle" && !muted && !error && (
            <p className="text-[14px] text-[var(--color-text-muted)]">
              Tap the mic to start. After that, just talk — I&apos;ll keep the conversation going.
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 mt-2 text-[13px] text-[var(--color-warning)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          {!vadRef.current ? (
            <button
              onClick={() => void startVoiceMode()}
              aria-label="Start voice mode"
              className={cn(
                "relative flex h-16 w-16 items-center justify-center rounded-full transition-all border",
                "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border-strong)]",
                "hover:border-[var(--color-border-accent)] hover:bg-[var(--color-surface-hover)]"
              )}
            >
              <Mic className="h-6 w-6" strokeWidth={2} />
            </button>
          ) : (
            <button
              onClick={() => void toggleMute()}
              aria-label={muted ? "Resume voice mode" : "Pause voice mode"}
              className={cn(
                "relative flex h-16 w-16 items-center justify-center rounded-full transition-all border",
                muted
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border-strong)] hover:border-[var(--color-border-accent)]"
                  : "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border-transparent shadow-[var(--shadow-button-primary)]"
              )}
            >
              {muted ? <Play className="h-6 w-6" /> : <Pause className="h-6 w-6" />}
              {(state === "listening" || state === "active") && !muted && (
                <span className="absolute inset-0 rounded-full ring-2 ring-[var(--color-accent)] animate-ping opacity-50" />
              )}
            </button>
          )}
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
            {!vadRef.current ? "Tap to start" : muted ? "Tap to resume" : "Tap to pause"}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-[10.5px] text-[var(--color-text-subtle)]">
        Always-on voice agent. Speech detection in your browser, transcription via Groq Whisper, replies streamed from Claude.
      </div>
    </div>
  );
}

// ---------------- helpers ----------------

function stateLabel(state: VoiceState, muted: boolean, err: string | null) {
  if (err) return "Issue";
  if (muted) return "Paused";
  switch (state) {
    case "idle": return "Ready";
    case "active": return "Listening";
    case "listening": return "Hearing you";
    case "thinking": return "Thinking…";
    case "speaking": return "Speaking";
  }
}

async function transcribe(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", new File([blob], "voice.wav", { type: blob.type }));
  const res = await fetch("/api/transcribe", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Transcription failed (HTTP ${res.status})`);
  }
  const { text } = (await res.json()) as { text: string };
  return text;
}

async function streamCoach(
  messages: UIMessage[],
  conversationId: string | null,
  onPartial: (text: string) => void,
  onConversationId: (id: string) => void
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, conversationId }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Coach didn't respond (HTTP ${res.status})`);
  }

  const newId = res.headers.get("X-Conversation-Id");
  if (newId && !conversationId) onConversationId(newId);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === "text-delta" && typeof event.delta === "string") {
          fullText += event.delta;
          onPartial(fullText);
        }
      } catch {}
    }
  }

  return fullText;
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
}
