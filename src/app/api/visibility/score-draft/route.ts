import { z } from "zod";
import { getApiContext, handleApi, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { scoreDraft } from "@/lib/visibility/score-draft";

/**
 * V7.1: live draft scoring. Deterministic citability + readability (+ optional
 * AI-content), identical to the audit modules. Cheap and debounced client-side.
 */
const schema = z.object({
  markdown: z.string().max(200_000),
  deep: z.boolean().optional(),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    await getApiContext(); // auth
    const { markdown, deep } = parseBody(schema, await readJson(request));
    return jsonOk(scoreDraft(markdown, { deep }));
  });
}
