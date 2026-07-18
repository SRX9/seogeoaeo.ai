import {
  configureObjectiveRequestSchema,
  configurePrimaryObjective,
  ensurePrimaryObjective,
  getPrimaryObjective,
  objectiveMetricSchema,
  toAgentMissionView,
} from "@/lib/agent/objectives";
import { measureObjectiveMetric } from "@/lib/agent/objective-measurements";
import {
  getObjectiveReplanStatus,
  reconcileObjectiveReplan,
} from "@/lib/agent/objective-replan";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";

async function liveMeasurement(
  scope: Parameters<typeof measureObjectiveMetric>[0],
  metric: string | null,
) {
  const parsed = objectiveMetricSchema.safeParse(metric);
  return parsed.success ? measureObjectiveMetric(scope, parsed.data) : null;
}

export async function GET() {
  return handleApi(async () => {
    const { brand, scope } = await requireApiBrand();
    let mission = await ensurePrimaryObjective(scope, brand.name);
    if (!mission) throw new HttpError(404, "Objective not found");
    let [replan, measurement] = await Promise.all([
      getObjectiveReplanStatus(scope, {
        missionId: mission.id,
        definitionVersion: mission.definitionVersion,
      }),
      liveMeasurement(scope, mission.metric),
    ]);
    if (replan.status === "superseded") {
      const current = await getPrimaryObjective(scope);
      if (current) {
        mission = current;
        [replan, measurement] = await Promise.all([
          getObjectiveReplanStatus(scope, {
            missionId: current.id,
            definitionVersion: current.definitionVersion,
          }),
          liveMeasurement(scope, current.metric),
        ]);
      }
    }
    return jsonOk({
      objective: toAgentMissionView(mission, measurement),
      measurement,
      replanStatus: replan.status,
      replanPending: replan.status === "pending",
      replanError: replan.error,
    });
  });
}

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { brand, scope } = await requireApiBrand();
    const body = parseBody(configureObjectiveRequestSchema, await readJson(request));
    const existing = await ensurePrimaryObjective(scope, brand.name);
    if (!existing) throw new HttpError(404, "Objective not found");

    const result = await configurePrimaryObjective(
      scope,
      body.expectedVersion,
      body.definition,
    );
    if (!result.ok) {
      if (result.reason === "not_found") throw new HttpError(404, "Objective not found");
      if (result.reason === "archived") {
        throw new HttpError(409, "Archived objectives cannot be changed");
      }
      throw new HttpError(409, "Objective changed in another session", {
        currentVersion: result.currentVersion ?? null,
      });
    }

    const [replan, measurement] = await Promise.all([
      reconcileObjectiveReplan(scope, {
        missionId: result.mission.id,
        definitionVersion: result.mission.definitionVersion,
      }),
      liveMeasurement(scope, result.mission.metric),
    ]);
    if (replan.status === "superseded") {
      const current = await getPrimaryObjective(scope);
      throw new HttpError(409, "Objective changed in another session", {
        currentVersion: current?.definitionVersion ?? null,
      });
    }

    return jsonOk({
      objective: toAgentMissionView(result.mission, measurement),
      measurement,
      planDiff: replan.planDiff,
      replanStatus: replan.status,
      replanPending: replan.status === "pending",
      replanError: replan.error,
    });
  });
}
