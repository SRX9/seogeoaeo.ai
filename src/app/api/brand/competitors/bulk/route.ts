import { handleApi, HttpError, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { CompetitorLimitError, createCompetitors } from "@/lib/brand/repository";
import { competitorBulkSchema } from "@/lib/brand/schemas";

/** Insert the competitors the user picked from the AI-discovery checklist. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const { competitors } = parseBody(competitorBulkSchema, await readJson(request));
    try {
      const created = await createCompetitors(scope, competitors);
      return jsonOk({ competitors: created }, { status: 201 });
    } catch (error) {
      if (error instanceof CompetitorLimitError) {
        throw new HttpError(409, error.message, { code: "CAP_REACHED" });
      }
      throw error;
    }
  });
}
