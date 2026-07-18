import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const reportDir = resolve(here, "reports");
const rawPath = resolve(reportDir, ".vitest-baseline.json");
const reportPath = resolve(reportDir, "baseline-v3.json");
const vitestCli = resolve(root, "node_modules/vitest/vitest.mjs");

mkdirSync(reportDir, { recursive: true });
const run = spawnSync(
  process.execPath,
  [
    vitestCli,
    "run",
    "--config=evals/claudia/vitest.config.ts",
    "--reporter=json",
    `--outputFile=${rawPath}`,
  ],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

let results = null;
try {
  results = JSON.parse(readFileSync(rawPath, "utf8"));
} catch {
  results = { error: run.stderr || run.stdout || "Eval runner did not produce JSON." };
}

let commit = "unavailable";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch {
  // A source archive may not include Git metadata.
}

const catalog = JSON.parse(readFileSync(resolve(here, "suites/catalog-v1.json"), "utf8"));
const release = JSON.parse(readFileSync(resolve(here, "releases/current.json"), "utf8"));

const report = {
  reportVersion: "claudia-eval-report-v3",
  scenarioVersion: "claudia-eval-scenario-v1",
  scenarioVersions: [
    "claudia-eval-scenario-v1",
    "claudia-grounding-eval-v1",
    "claudia-kernel-eval-v1",
    "claudia-memory-learning-eval-v1",
    "claudia-autonomy-rollout-v1",
  ],
  suiteCatalogVersion: catalog.version,
  suites: catalog.suites.map(({ id, datasetVersion, grader, releaseThreshold }) => ({
    id,
    datasetVersion,
    grader,
    releaseThreshold,
  })),
  releaseKey: release.releaseKey,
  componentVersions: release.componentVersions,
  capturedAt: new Date().toISOString(),
  promptVersion: process.env.CLAUDIA_PROMPT_VERSION ?? release.componentVersions.prompts,
  model: process.env.LLM_HEAVY_MODEL ?? "not-configured",
  toolSchemaVersion: process.env.CLAUDIA_TOOL_SCHEMA_VERSION ?? release.componentVersions.toolSchemas,
  policyVersion: process.env.CLAUDIA_POLICY_VERSION ?? release.componentVersions.deterministicPolicy,
  codeCommit: commit,
  passed: run.status === 0,
  results,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
rmSync(rawPath, { force: true });
process.stdout.write(`Claudia baseline written to ${reportPath} (${report.passed ? "pass" : "fail"}).\n`);

if (process.argv.includes("--enforce") && run.status !== 0) {
  process.exit(run.status ?? 1);
}
