import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Forwards an audio blob to Groq's Whisper API and returns the transcript.
 *
 * Works around Chrome's `SpeechRecognition` network-flake (it sends to Google
 * cloud servers behind the scenes). Whisper runs server-side, so the user's
 * browser only ever talks to our origin — no Google dependency, plus this
 * works on Safari/Firefox where Web Speech is missing.
 */
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // Auth — same gate as /api/chat. Don't let randoms burn our Groq tokens.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 500 });

  let audio: File | null = null;
  try {
    const formData = await req.formData();
    const f = formData.get("file");
    if (f instanceof File) audio = f;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "No audio uploaded" }, { status: 400 });
  }

  // Forward to Groq's OpenAI-compatible audio endpoint.
  const groqForm = new FormData();
  groqForm.append("file", audio, audio.name || "audio.webm");
  groqForm.append("model", "whisper-large-v3-turbo");
  // Optional: prompt biases the transcription toward likely vocabulary.
  // groqForm.append("prompt", "Coach, gym, deadlift, business, dentist");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: groqForm,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Groq returned ${res.status}: ${detail.slice(0, 200)}` },
      { status: 500 }
    );
  }

  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: (data.text ?? "").trim() });
}
