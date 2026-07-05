import { z } from "zod";
import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { createUseCase, listUseCases, syncUseCases } from "@/lib/brand/use-cases";

const useCaseSchema = z.object({
  job: z.string().min(3).max(200),
  persona: z.string().min(2).max(200),
  industry: z.string().max(200).optional(),
  evidence: z.string().max(500).optional(),
});

/** List the active brand's use-case inventory. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const useCases = await listUseCases(brand.id);
    return jsonOk({ useCases });
  });
}

/** Add a use case the user wrote themselves. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const data = parseBody(useCaseSchema, await readJson(request));
    const useCase = await createUseCase(scope, data, "user");
    return jsonOk({ useCase }, { status: 201 });
  });
}

/** Regenerate the inventory from the current profile. Additive — user rows and
 * edits are never touched. */
export async function PUT() {
  return handleApi(async () => {
    const { scope, brand } = await requireApiBrand();
    const result = await syncUseCases(scope);
    const useCases = await listUseCases(brand.id);
    return jsonOk({ ...result, useCases });
  });
}
