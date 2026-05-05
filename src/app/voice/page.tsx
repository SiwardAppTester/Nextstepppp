"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, MicOff, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

export default function VoicePage() {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permError, setPermError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop(); } catch {}
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
    };
  }, []);

  async function startListening() {
    setPermError(null);
    setReply(null);
    setTranscript("");
    audioChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")) {
        setPermError("Microphone permission was blocked. Allow it in your browser to use voice mode.");
      } else {
        setPermError(`Couldn't access microphone: ${msg}`);
      }
      return;
    }

    streamRef.current = stream;

    // Pick a mime type the browser supports — Chrome prefers webm/opus, Safari mp4.
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });

      if (blob.size === 0) {
        setPermError("Didn't catch any audio — try again.");
        setState("idle");
        return;
      }

      setState("thinking");
      try {
        const text = await transcribe(blob);
        if (!text) {
          setPermError("Didn't catch any speech — try again.");
          setState("idle");
          return;
        }
        setTranscript(text);
        await handleResponse(text);
      } catch (err) {
        setPermError(err instanceof Error ? err.message : "Voice mode failed");
        setState("idle");
      }
    };

    try {
      recorder.start();
      setState("listening");
    } catch {
      setPermError("Couldn't start recording — try again.");
      setState("idle");
    }
  }

  function stopListening() {
    try { mediaRecorderRef.current?.stop(); } catch {}
  }

  async function transcribe(blob: Blob): Promise<string> {
    const formData = new FormData();
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    formData.append("file", new File([blob], `voice.${ext}`, { type: blob.type }));
    const res = await fetch("/api/transcribe", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Transcription failed (HTTP ${res.status})`);
    }
    const { text } = (await res.json()) as { text: string };
    return text;
  }

  async function handleResponse(userText: string) {
    setReply(null);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: userText }],
          },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Coach didn't respond (HTTP ${res.status})`);
    }

    // Parse the AI SDK SSE stream — accumulate text-delta events into the
    // final reply. Tool calls happen invisibly; voice mode speaks only the
    // final assistant text.
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
            setReply(fullText);
          }
        } catch {
          // Skip malformed lines silently.
        }
      }
    }

    if (!fullText.trim()) {
      setReply("(Coach replied with no text — try asking again.)");
      setState("idle");
      return;
    }

    setState("speaking");
    speak(fullText, () => setState("idle"));
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

        <div className="text-center min-h-[80px] flex flex-col items-center justify-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)] mb-2">
            {stateLabel(state, supported, permError)}
          </div>

          {state === "listening" && (
            <p className="max-w-xl text-[14px] text-[var(--color-text-muted)] italic">
              Recording… tap to stop.
            </p>
          )}

          {(state === "thinking" || state === "speaking") && transcript && (
            <p className="max-w-xl text-[14px] text-[var(--color-text-subtle)] italic mb-2">
              You said: &ldquo;{transcript}&rdquo;
            </p>
          )}

          {(state === "speaking" || state === "thinking") && reply && (
            <p className="max-w-xl text-[18px] leading-relaxed text-[var(--color-text)] font-medium">
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
                Your browser doesn&apos;t support audio recording. Try Chrome, Edge, or Safari.
              </span>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={() => {
              if (state === "listening") stopListening();
              else if (state === "idle") void startListening();
            }}
            disabled={!supported || state === "thinking" || state === "speaking"}
            aria-label={state === "listening" ? "Stop recording" : "Start recording"}
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

      <div className="absolute bottom-4 left-0 right-0 text-center text-[10.5px] text-[var(--color-text-subtle)]">
        Audio recorded in your browser, transcribed by Groq Whisper, replies streamed from Claude.
      </div>
    </div>
  );
}

function stateLabel(state: VoiceState, supported: boolean | null, err: string | null) {
  if (err) return "Issue";
  if (supported === false) return "Unsupported";
  switch (state) {
    case "idle": return "Ready";
    case "listening": return "Recording…";
    case "thinking": return "Thinking…";
    case "speaking": return "Speaking";
  }
}
