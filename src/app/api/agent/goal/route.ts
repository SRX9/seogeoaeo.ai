import { z } from "zod";
import {
  configurePrimaryObjective,
  ensurePrimaryObjective,
  objectiveMetricSchema,
  toAgentMissionView,
} from "@/lib/agent/objectives";
import { measureObjectiveMetric } from "@/lib/agent/objective-measurements";
import { reconcileObjectiveReplan } from "@/lib/agent/objective-replan";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import { FIRST_OUTCOME_IDS } from "@/lib/onboarding/first-outcome";
import { buildGoalDefinition, toGoalView } from "@/lib/settings/goal";

const selectGoalSchema = z.object({ goalId: z.enum(FIRST_OUTCOME_IDS) }).strict();

export async function GET() {
  return handleApi(async () => {
    const { brand, scope } = await requireApiBrand();
    const mission = await ensurePrimaryObjective(scope, brand.name);
    if (!mission) throw new HttpError(404, "Goal not found");
    const metric = objectiveMetricSchema.safeParse(mission.metric);
    const measurement = metric.success
      ? await measureObjectiveMetric(scope, metric.data)
      : null;
    return jsonOk({ goal: toGoalView(toAgentMissionView(mission, measurement), brand.name) });
  });
}

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { brand, scope } = await requireApiBrand();
    const { goalId } = parseBody(selectGoalSchema, await readJson(request));
    const mission = await ensurePrimaryObjective(scope, brand.name);
    if (!mission) throw new HttpError(404, "Goal not found");

    const metric = buildGoalDefinition({
      goalId,
      brandName: brand.name,
      mission: toAgentMissionView(mission, null),
      measurement: null,
    }).metric;
    const measurement = await measureObjectiveMetric(scope, metric);
    const definition = buildGoalDefinition({
      goalId,
      brandName: brand.name,
      mission: toAgentMissionView(mission, measurement),
      measurement,
    });
    const result = await configurePrimaryObjective(
      scope,
      mission.definitionVersion,
      definition,
    );
    if (!result.ok) {
      if (result.reason === "not_found") throw new HttpError(404, "Goal not found");
      if (result.reason === "archived") throw new HttpError(409, "Archived goals cannot be changed");
      throw new HttpError(409, "Goal changed in another session");
    }

    await reconcileObjectiveReplan(scope, {
      missionId: result.mission.id,
      definitionVersion: result.mission.definitionVersion,
    });
    return jsonOk({
      goal: toGoalView(toAgentMissionView(result.mission, measurement), brand.name),
    });
  });
}
