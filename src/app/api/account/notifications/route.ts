import { z } from "zod";
import { getApiContext, handleApi, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { setOwnerEmailPreferences } from "@/lib/workspace";

/** Update Claudia's owner-scoped email preferences. */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const preferences = parseBody(
      z
        .object({
          milestoneEmailsEnabled: z.boolean().optional(),
          reviewEmailsEnabled: z.boolean().optional(),
          dailySummaryEmailsEnabled: z.boolean().optional(),
          creditEmailsEnabled: z.boolean().optional(),
        })
        .refine((value) => Object.values(value).some((item) => item !== undefined), {
          message: "Nothing to update",
        }),
      await readJson(request),
    );
    const {
      creditEmailsEnabled,
      milestoneEmailsEnabled,
      reviewEmailsEnabled,
      dailySummaryEmailsEnabled,
    } = preferences;
    await setOwnerEmailPreferences(workspace.id, {
      ...(creditEmailsEnabled === undefined ? {} : { creditEmailsEnabled }),
      ...(milestoneEmailsEnabled === undefined ? {} : { milestoneEmailsEnabled }),
      ...(reviewEmailsEnabled === undefined ? {} : { reviewEmailsEnabled }),
      ...(dailySummaryEmailsEnabled === undefined ? {} : { dailySummaryEmailsEnabled }),
    });
    return jsonOk(preferences);
  });
}
