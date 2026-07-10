/**
 * Shared tag normalization for publishing destinations (Dev.to, Hashnode, …).
 * SEO metadata often produces multi-word tags that remote APIs reject.
 */

/** Lowercase slug: alphanumeric + hyphens, no leading/trailing hyphens. */
export function slugifyTag(raw: string, maxLen?: number): string {
  let tag = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (maxLen != null && maxLen > 0) tag = tag.slice(0, maxLen);
  return tag;
}

/** Unique slugs, first-seen order, capped. */
export function normalizeTagSlugs(
  tags: string[],
  opts: { max: number; maxLen?: number },
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = slugifyTag(raw, opts.maxLen);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= opts.max) break;
  }
  return out;
}

/** Unique `{ slug, name }` tags preserving original display name. */
export function normalizeNamedTags(
  tags: string[],
  opts: { max: number },
): { slug: string; name: string }[] {
  const seen = new Set<string>();
  const out: { slug: string; name: string }[] = [];
  for (const raw of tags) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugifyTag(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name });
    if (out.length >= opts.max) break;
  }
  return out;
}
