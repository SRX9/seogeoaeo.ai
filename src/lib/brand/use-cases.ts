import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brandUseCases } from "@/lib/db/schema";
import { getBrandProfile, getBrand, type BrandScope } from "@/lib/brand/repository";
import { listArticles } from "@/lib/articles/repository";
import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { extractUseCasesPrompt } from "@/lib/llm/prompts";
import { serperSearch } from "@/lib/research/serper";
import { logInfo, logWarn } from "@/lib/logging/logger";

/**
 * C1 use-case inventory: the jobs buyers hire this product for, and who those
 * buyers are. User-facing in Brand settings from day one — auto-generated at
 * onboarding, human-reviewable, and the seed for every BOFU article the
 * use-case research provider proposes.
 */

export type UseCaseInput = {
  job: string;
  persona: string;
  industry?: string | null;
  evidence?: string | null;
};

const MAX_USE_CASES = 24;

export async function listUseCases(brandId: string, options: { enabledOnly?: boolean } = {}) {
  const conditions = [eq(brandUseCases.brandId, brandId)];
  if (options.enabledOnly) {
    conditions.push(eq(brandUseCases.enabled, true));
  }
  return getDb()
    .select()
    .from(brandUseCases)
    .where(and(...conditions))
    .orderBy(asc(brandUseCases.createdAt));
}

export async function createUseCase(
  scope: BrandScope,
  input: UseCaseInput,
  origin: "generated" | "user" = "user",
) {
  const [row] = await getDb()
    .insert(brandUseCases)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      job: input.job.trim(),
      persona: input.persona.trim(),
      industry: input.industry?.trim() || null,
      evidence: input.evidence?.trim() || null,
      origin,
    })
    .returning();
  return row;
}

/** Edit or enable/disable a row. Any user edit marks it as owned — regeneration
 * will never touch it again. */
export async function updateUseCase(
  brandId: string,
  useCaseId: string,
  patch: Partial<UseCaseInput> & { enabled?: boolean },
) {
  const [row] = await getDb()
    .update(brandUseCases)
    .set({
      ...(patch.job !== undefined ? { job: patch.job.trim() } : {}),
      ...(patch.persona !== undefined ? { persona: patch.persona.trim() } : {}),
      ...(patch.industry !== undefined ? { industry: patch.industry?.trim() || null } : {}),
      ...(patch.evidence !== undefined ? { evidence: patch.evidence?.trim() || null } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      edited: true,
      updatedAt: new Date(),
    })
    .where(and(eq(brandUseCases.brandId, brandId), eq(brandUseCases.id, useCaseId)))
    .returning();
  return row ?? null;
}

function rowKey(job: string, persona: string) {
  return `${job.trim().toLowerCase()}::${persona.trim().toLowerCase()}`;
}

/**
 * Generate (or refresh) the inventory from the brand profile, published
 * articles, and web search — grounded like brand enrichment, never fetching
 * user URLs directly. Additive: new rows are inserted, existing rows (and
 * anything the user edited or wrote) are left exactly as they are.
 */
export async function syncUseCases(scope: BrandScope) {
  if (!getLlmConfig()) {
    return { added: 0, total: 0 };
  }

  const [brand, profile, articles, existing] = await Promise.all([
    getBrand(scope.workspaceId, scope.brandId),
    getBrandProfile(scope.brandId),
    listArticles(scope.brandId),
    listUseCases(scope.brandId),
  ]);
  if (!profile?.productDescription) {
    return { added: 0, total: existing.length };
  }

  // Same grounding pattern as brand enrichment: search results, not direct
  // fetches of user-supplied URLs (no SSRF surface). serperSearch degrades to
  // empty results on its own, so the profile alone is always enough.
  const query = brand?.name
    ? `${brand.name} use cases features`
    : profile.productDescription.slice(0, 60);
  const { organic } = await serperSearch(query, { num: 6 });
  const searchContext = organic
    .slice(0, 6)
    .flatMap((item) =>
      item.title ? [`- ${item.title}: ${(item.snippet ?? "").slice(0, 200)}`] : [],
    )
    .join("\n");

  const prompt = extractUseCasesPrompt(
    {
      name: brand?.name,
      productDescription: profile.productDescription,
      audience: profile.audience,
      website: profile.website,
      seedKeywords: profile.seedKeywords,
    },
    articles.map((article) => article.title),
    searchContext,
  );

  let rows: UseCaseInput[] = [];
  try {
    const { data } = await generateJson<{ useCases?: UseCaseInput[] }>("light", [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    rows = Array.isArray(data?.useCases) ? data.useCases : [];
  } catch (error) {
    logWarn("use_cases.generation_failed", {
      brandId: scope.brandId,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
    return { added: 0, total: existing.length };
  }

  const known = new Set(existing.map((row) => rowKey(row.job, row.persona)));
  const room = Math.max(0, MAX_USE_CASES - existing.length);
  const fresh = rows
    .filter(
      (row) =>
        typeof row.job === "string" &&
        typeof row.persona === "string" &&
        row.job.trim() &&
        row.persona.trim() &&
        !known.has(rowKey(row.job, row.persona)),
    )
    .slice(0, room);

  for (const row of fresh) {
    await createUseCase(scope, row, "generated");
    known.add(rowKey(row.job, row.persona));
  }

  if (fresh.length > 0) {
    logInfo("use_cases.synced", { brandId: scope.brandId, added: fresh.length });
  }
  return { added: fresh.length, total: existing.length + fresh.length };
}
