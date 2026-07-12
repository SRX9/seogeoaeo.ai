import { DEFAULT_HEADERS } from "./fetch-page";
import type { PageSnapshot } from "./types";

/**
 * Site Health probes not covered by the existing analyzers: favicon, brand
 * logo, and og:image validity. Reads the V0.1 `PageSnapshot`; only the
 * reachability probes make a network request (HEAD-like GET, 10s timeout).
 */

const PROBE_TIMEOUT_MS = 10_000;

const resolveUrl = (href: string, base: string): string | null => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

const looksLikeImage = (contentType: string | null, url: string): boolean => {
  if (contentType?.toLowerCase().startsWith("image/")) return true;
  return /\.(?:ico|svg|png|jpe?g|gif|webp|avif)(?:\?|$)/i.test(url);
};

/** Probe a URL and report whether it serves an image. Never throws. */
async function probeImage(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ reachable: boolean; contentType: string | null }> {
  try {
    const res = await fetchImpl(url, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const contentType = res.headers.get("content-type");
    return { reachable: res.status === 200 && looksLikeImage(contentType, url), contentType };
  } catch {
    return { reachable: false, contentType: null };
  }
}

// ── Favicon ─────────────────────────────────────────────────────────────────

export interface FaviconCheck {
  /** href of the first <link rel*="icon">, null when none is declared. */
  declared: string | null;
  reachable: boolean;
  /** The URL actually probed (declared icon or the /favicon.ico fallback). */
  checkedUrl: string | null;
}

const ICON_LINK =
  /<link\b[^>]*\brel\s*=\s*["'](?:shortcut\s+icon|icon|apple-touch-icon)["'][^>]*>/i;

export async function checkFavicon(
  snapshot: PageSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<FaviconCheck> {
  const link = ICON_LINK.exec(snapshot.html)?.[0] ?? null;
  const declared = link ? (/\bhref\s*=\s*["']([^"']+)["']/i.exec(link)?.[1] ?? null) : null;

  const checkedUrl = declared
    ? resolveUrl(declared, snapshot.url)
    : resolveUrl("/favicon.ico", snapshot.url);
  if (!checkedUrl) return { declared, reachable: false, checkedUrl: null };

  const { reachable } = await probeImage(checkedUrl, fetchImpl);
  return { declared, reachable, checkedUrl };
}

// ── og:image ────────────────────────────────────────────────────────────────

export interface OgImageCheck {
  url: string | null;
  /** null when no og:image is declared (nothing to probe). */
  reachable: boolean | null;
  contentType: string | null;
  /** From og:image:width/height meta tags: we don't sniff image bytes. */
  declaredWidth: number | null;
  declaredHeight: number | null;
}

const metaDimension = (value: string | undefined): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export async function checkOgImage(
  snapshot: PageSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<OgImageCheck> {
  const raw = snapshot.meta_tags["og:image"]?.trim();
  const url = raw ? resolveUrl(raw, snapshot.url) : null;
  const dimensions = {
    declaredWidth: metaDimension(snapshot.meta_tags["og:image:width"]),
    declaredHeight: metaDimension(snapshot.meta_tags["og:image:height"]),
  };
  if (!url) return { url: null, reachable: null, contentType: null, ...dimensions };

  const { reachable, contentType } = await probeImage(url, fetchImpl);
  return { url, reachable, contentType, ...dimensions };
}

// ── Logo ────────────────────────────────────────────────────────────────────

export interface LogoCheck {
  source: "schema" | "og_image" | "header_img" | null;
  url: string | null;
}

/** Pull `logo` out of an Organization/LocalBusiness JSON-LD node. */
function schemaLogo(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  // @graph wrappers and arrays both occur in the wild.
  const graph = record["@graph"];
  if (Array.isArray(graph)) {
    for (const child of graph) {
      const found = schemaLogo(child);
      if (found) return found;
    }
  }
  const type = record["@type"];
  const types = (Array.isArray(type) ? type : [type]).filter((t) => typeof t === "string");
  if (types.some((t) => /organization|localbusiness/i.test(t as string))) {
    const logo = record.logo;
    if (typeof logo === "string") return logo;
    if (logo && typeof logo === "object") {
      const url = (logo as Record<string, unknown>).url;
      if (typeof url === "string") return url;
    }
  }
  return null;
}

const HEADER_BLOCK = /<(?:header|nav)\b[\s\S]*?<\/(?:header|nav)>/i;
const LOGO_IMG = /<img\b[^>]*\b(?:src|alt|class)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>/i;

/**
 * Where would Google / an AI assistant get this brand's logo? Prefers the
 * explicit Organization schema declaration, falls back to og:image, then a
 * logo-looking <img> in the header. Pure: no network.
 */
export function detectLogo(snapshot: PageSnapshot): LogoCheck {
  for (const node of snapshot.structured_data) {
    const url = schemaLogo(node);
    if (url) return { source: "schema", url: resolveUrl(url, snapshot.url) ?? url };
  }
  const ogImage = snapshot.meta_tags["og:image"]?.trim();
  if (ogImage) return { source: "og_image", url: resolveUrl(ogImage, snapshot.url) ?? ogImage };

  const header = HEADER_BLOCK.exec(snapshot.html)?.[0] ?? "";
  const img = LOGO_IMG.exec(header) ?? LOGO_IMG.exec(snapshot.html);
  if (img) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(img[0])?.[1];
    if (src) return { source: "header_img", url: resolveUrl(src, snapshot.url) ?? src };
  }
  return { source: null, url: null };
}
