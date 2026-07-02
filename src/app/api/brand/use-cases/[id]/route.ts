import { z } from "zod";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import { updateUseCase } from "@/lib/brand/use-cases";

type RouteProps = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  job: z.string().min(3).max(200).optional(),
  persona: z.string().min(2).max(200).optional(),
  industry: z.string().max(200).optional(),
  evidence: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
});

/** Edit or enable/disable a use case. Edits mark the row user-owned. */
export async function PATCH(request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const [{ id }, { brand }, body] = await Promise.all([
      params,
      requireApiBrand(),
      readJson(request),
    ]);
    const data = parseBody(patchSchema, body);
    const useCase = await updateUseCase(brand.id, id, data);
    if (!useCase) {
      throw new HttpError(404, "Use case not found");
    }
    return jsonOk({ useCase });
  });
}
