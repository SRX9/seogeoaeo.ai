import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import catalogJson from "./suites/catalog-v1.json";
import releaseJson from "./releases/current.json";
import redTeamJson from "./security/red-team-v1.json";
import rolloutJson from "./rollouts/phase8-v1.json";
import {
  autonomyRolloutEvidenceSchema,
  behaviorReleaseSchema,
  EVAL_SUITE_IDS,
  redTeamProgramSchema,
  suiteCatalogSchema,
} from "./governance.schema";

const root = resolve(__dirname, "../..");

describe("Claudia release governance", () => {
  it("gates behavior releases on all suites and red-team dispositions", () => {
    const catalog = suiteCatalogSchema.parse(catalogJson);
    const release = behaviorReleaseSchema.parse(releaseJson);
    const redTeam = redTeamProgramSchema.parse(redTeamJson);
    const rollout = autonomyRolloutEvidenceSchema.parse(rolloutJson);

    expect([...new Set(catalog.suites.map((suite) => suite.id))].sort()).toEqual(
      [...EVAL_SUITE_IDS].sort(),
    );
    expect([...new Set(release.affectedEvalSuites)].sort()).toEqual(
      [...EVAL_SUITE_IDS].sort(),
    );
    for (const suite of catalog.suites) {
      expect(suite.releaseThreshold, suite.id).toBe(1);
      for (const evidence of suite.evidence) {
        expect(existsSync(resolve(root, evidence)), evidence).toBe(true);
      }
    }

    expect(release.beforeReport).not.toBe(release.afterReport);
    for (const requiredPath of [
      release.beforeReport,
      release.migrationPlan,
      release.rollbackPlan.split("#")[0]!,
      release.requiredSecurityProgram,
    ]) {
      expect(existsSync(resolve(root, requiredPath)), requiredPath).toBe(true);
    }

    expect(redTeam.threats).toHaveLength(13);
    expect(redTeam.threats.every((threat) => threat.outcome === "pass")).toBe(true);
    for (const threat of redTeam.threats) {
      for (const evidence of threat.evidence) {
        expect(existsSync(resolve(root, evidence)), evidence).toBe(true);
      }
    }
    const openSevere = redTeam.findings.filter(
      (finding) =>
        (finding.severity === "high" || finding.severity === "critical") &&
        finding.status === "open",
    );
    expect(openSevere).toEqual([]);
    expect(rollout.stages.map((stage) => stage.stage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rollout.productionAuthorityExpanded).toBe(false);
    expect(rollout.claimPolicy.sotaClaimAllowed).toBe(false);
  });
});
