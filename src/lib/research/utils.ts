export function extractXmlValues(xml: string, tag: string) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const values: string[] = [];
  let match = pattern.exec(xml);
  while (match) {
    const value = match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (value) {
      values.push(value);
    }
    match = pattern.exec(xml);
  }
  return values;
}

export async function fetchText(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "seogeoaeo.ai Research Bot/1.0" },
    });
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function uniqueByTitle<T extends { title?: string | null }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title?.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildSeedQueries(context: {
  seedKeywords?: string | null;
  productDescription?: string | null;
  audience?: string | null;
}) {
  const queries = new Set<string>();
  if (context.seedKeywords) {
    for (const keyword of context.seedKeywords.split(",")) {
      const trimmed = keyword.trim();
      if (trimmed) {
        queries.add(trimmed);
        queries.add(`how to ${trimmed}`);
        queries.add(`${trimmed} for beginners`);
        queries.add(`best ${trimmed} tools`);
      }
    }
  }
  if (context.productDescription) {
    queries.add(context.productDescription.slice(0, 80));
  }
  if (context.audience) {
    queries.add(`${context.audience} content ideas`);
  }
  return [...queries].slice(0, 8);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
