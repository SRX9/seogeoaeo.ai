import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getOnboardingSteps } from "@/lib/onboarding/status";

/** Onboarding checklist steps for the dashboard, loaded independently. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const steps = await getOnboardingSteps(brand.id);
    return jsonOk({ steps });
  });
}
