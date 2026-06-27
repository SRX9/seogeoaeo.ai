import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import { CompetitorLimitError, createCompetitor, listCompetitors } from "@/lib/brand/repository";
import { competitorSchema } from "@/lib/brand/schemas";

/** List the active brand's competitors. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const competitors = await listCompetitors(brand.id);
    return jsonOk({ competitors });
  });
}

/** Add a competitor to the active brand. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const data = parseBody(competitorSchema, await readJson(request));
    try {
      const competitor = await createCompetitor(scope, data);
      return jsonOk({ competitor }, { status: 201 });
    } catch (error) {
      if (error instanceof CompetitorLimitError) {
        throw new HttpError(409, error.message, { code: "CAP_REACHED" });
      }
      throw error;
    }
  });
}
