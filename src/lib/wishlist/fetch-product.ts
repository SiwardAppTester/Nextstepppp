/**
 * Fetches a URL and pulls out product metadata (OpenGraph, structured data,
 * meta tags). No headless browser — only static HTML, so JS-heavy sites give
 * partial data. Strict size + time limits to avoid hanging on huge pages.
 */

const MAX_BYTES = 250_000;
const TIMEOUT_MS = 8_000;

export type ProductInfo = {
  title?: string;
  description?: string;
  image_url?: string;
  site_name?: string;
  price?: number;
  currency?: string;
};

export type FetchResult =
  | { ok: true; info: ProductInfo }
  | { ok: false; error: string };

export async function fetchProductInfo(rawUrl: string): Promise<FetchResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Not a valid URL." };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "Only http/https URLs are supported." };
  }

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't fetch URL.",
    };
  }

  return { ok: true, info: extractMetadata(html, url) };
}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NextStepBot/1.0; +https://nextsteppp.app)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,nl;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("html")) {
      throw new Error("URL didn't return an HTML page.");
    }

    const reader = res.body?.getReader();
    if (!reader) return await res.text();

    const decoder = new TextDecoder("utf-8", { fatal: false });
    let html = "";
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    html += decoder.decode();
    return html;
  } finally {
    clearTimeout(timer);
  }
}

function extractMetadata(html: string, url: URL): ProductInfo {
  const title =
    metaContent(html, ["og:title", "twitter:title"]) ?? pageTitle(html);

  const description = metaContent(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);

  const image_url = metaContent(html, ["og:image", "twitter:image"]);

  const site_name =
    metaContent(html, ["og:site_name"]) ?? url.hostname.replace(/^www\./, "");

  const priceRaw = metaContent(html, [
    "product:price:amount",
    "og:product:price:amount",
    "og:price:amount",
    "twitter:data1",
    "product:sale_price:amount",
    "price",
  ]);
  let price = priceRaw ? parsePrice(priceRaw) : undefined;

  const currency = metaContent(html, [
    "product:price:currency",
    "og:price:currency",
  ]);

  // JSON-LD Product schema is widely supported and often more accurate.
  if (price === undefined) price = extractPriceFromJsonLd(html);

  // Schema.org microdata on a regular tag (Magento / Shopify default).
  if (price === undefined) price = priceFromMicrodata(html);

  // Last-resort fallback: scan the title + description text for a euro/dollar
  // amount. This catches sites that don't expose structured price metadata
  // but show "€2,499" inline. Limited to currency-prefixed amounts to avoid
  // grabbing random numbers like model years.
  if (price === undefined) {
    const haystack = `${title ?? ""}\n${description ?? ""}`;
    price = extractPriceFromText(haystack);
  }

  return {
    title: title ? cleanText(title) : undefined,
    description: description ? cleanText(description) : undefined,
    image_url,
    site_name,
    price,
    currency,
  };
}

function metaContent(html: string, props: string[]): string | undefined {
  for (const p of props) {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // <meta property="og:title" content="..."> — also matches name= and itemprop=.
    const m1 = html.match(
      new RegExp(
        `<meta\\s+(?:[^>]*?\\s)?(?:property|name|itemprop)=["']${escaped}["'][^>]*?\\scontent=["']([^"']*)["'][^>]*>`,
        "i"
      )
    );
    if (m1?.[1]) return decodeEntities(m1[1]);
    // <meta content="..." property="og:title"> — content before key.
    const m2 = html.match(
      new RegExp(
        `<meta\\s+(?:[^>]*?\\s)?content=["']([^"']*)["'][^>]*?\\s(?:property|name|itemprop)=["']${escaped}["'][^>]*>`,
        "i"
      )
    );
    if (m2?.[1]) return decodeEntities(m2[1]);
  }
  return undefined;
}

/**
 * Some shops (especially Magento / Shopify defaults) expose price as
 * Schema.org microdata on a regular tag rather than a meta element:
 *   <span itemprop="price" content="29.99">€ 29,99</span>
 *   <meta itemprop="price" content="29.99">
 * The first form isn't matched by metaContent (which only looks at <meta>)
 * so we add a parallel scanner here.
 */
function priceFromMicrodata(html: string): number | undefined {
  // Form 1: any tag with itemprop="price" and content="..." attribute.
  const m1 = html.match(
    /<[a-z]+[^>]*\sitemprop=["']price["'][^>]*\scontent=["']([^"']+)["']/i
  );
  if (m1?.[1]) {
    const p = parsePrice(decodeEntities(m1[1]));
    if (p !== undefined) return p;
  }
  const m1Reverse = html.match(
    /<[a-z]+[^>]*\scontent=["']([^"']+)["'][^>]*\sitemprop=["']price["']/i
  );
  if (m1Reverse?.[1]) {
    const p = parsePrice(decodeEntities(m1Reverse[1]));
    if (p !== undefined) return p;
  }
  // Form 2: itemprop="price" with the price in the inner text.
  const m2 = html.match(
    /<[a-z]+[^>]*\sitemprop=["']price["'][^>]*>([^<]+)</i
  );
  if (m2?.[1]) {
    const p = parsePrice(decodeEntities(m2[1]));
    if (p !== undefined) return p;
  }
  return undefined;
}

function pageTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1]) : undefined;
}

function parsePrice(raw: string): number | undefined {
  // Strip currency symbols, keep digits + separators.
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return undefined;
  // Heuristic: if both `.` and `,` appear, last one is decimal separator.
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized = cleaned;
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // EU style: 1.234,56
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US style: 1,234.56
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    normalized = cleaned.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractPriceFromJsonLd(html: string): number | undefined {
  const blocks = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!blocks) return undefined;
  for (const block of blocks) {
    const inner = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    try {
      const json = JSON.parse(inner);
      const price = pickPrice(json);
      if (price !== undefined) return price;
    } catch {
      // skip malformed json
    }
  }
  return undefined;
}

function pickPrice(node: unknown): number | undefined {
  if (!node) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const p = pickPrice(child);
      if (p !== undefined) return p;
    }
    return undefined;
  }
  if (typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  // @graph wraps multiple entities, e.g. Schema.org pages with both Product
  // and Organization. Recurse into it.
  if (obj["@graph"] !== undefined) {
    const p = pickPrice(obj["@graph"]);
    if (p !== undefined) return p;
  }
  if (obj.offers !== undefined) {
    const p = pickPrice(obj.offers);
    if (p !== undefined) return p;
  }
  if (obj.priceSpecification !== undefined) {
    const p = pickPrice(obj.priceSpecification);
    if (p !== undefined) return p;
  }
  if (obj.price !== undefined) {
    const parsed = parsePrice(String(obj.price));
    if (parsed !== undefined) return parsed;
  }
  // AggregateOffer uses lowPrice / highPrice.
  if (obj.lowPrice !== undefined) {
    const parsed = parsePrice(String(obj.lowPrice));
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/**
 * Last-resort price extraction from free text. Matches euro/dollar amounts
 * that are clearly tagged as prices (currency prefix or suffix). Avoids
 * grabbing unrelated numbers (years, SKUs, ratings).
 */
function extractPriceFromText(text: string): number | undefined {
  if (!text) return undefined;
  // €2.499,00  €2499  € 2,499.00  EUR 999  $1,299.99  1299 EUR  2.499,00 EUR
  const patterns = [
    /(?:€|EUR|eur)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/,
    /([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:€|EUR|eur)/,
    /(?:\$|USD|usd)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const parsed = parsePrice(m[1]);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
