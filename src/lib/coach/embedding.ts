/**
 * Voyage AI embedding helper. Returns a 1024-dim vector for `voyage-3` or null
 * if VOYAGE_API_KEY isn't set — in which case search_memory falls back to
 * keyword (ILIKE) search downstream.
 */
export async function embed(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;
  if (!text.trim()) return null;

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: "voyage-3",
      output_dimension: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Voyage embed failed: ${res.status} ${body}`);
    return null;
  }

  const data: { data?: { embedding?: number[] }[] } = await res.json();
  return data.data?.[0]?.embedding ?? null;
}
