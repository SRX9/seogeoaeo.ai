#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function run(command) {
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function patchDynamicRequire(bundlePath) {
  const bundle = readFileSync(bundlePath, "utf8");
  const middlewareManifest = readFileSync(resolve(".next/server/middleware-manifest.json"), "utf8").trim();
  const readableDynamicRequireNeedle = `function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
}`;
  const readablePatchedDynamicRequire = `function(x) {
  if (x === "/.next/server/middleware-manifest.json") return ${middlewareManifest};
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
}`;

  writeFileSync(bundlePath, bundle.replaceAll(readableDynamicRequireNeedle, readablePatchedDynamicRequire));
}

run("pnpm run build:cf");
run("pnpm exec wrangler deploy --dry-run --outdir .wrangler-bundle");
patchDynamicRequire(resolve(".wrangler-bundle/worker.js"));

writeFileSync(
  resolve(".wrangler-bundle/wrangler.jsonc"),
  JSON.stringify(
    {
      name: "seo-ai",
      main: "worker.js",
      no_bundle: true,
      keep_vars: true,
      compatibility_date: "2026-06-05",
      compatibility_flags: ["nodejs_compat"],
      hyperdrive: [{ binding: "HYPERDRIVE", id: "29f7a53988fc495d90086fdd4b1ee859" }],
      routes: [{ pattern: "seogeoaeo.ai", custom_domain: true }],
      triggers: { crons: ["0 9 * * 1"] },
      assets: { directory: "../.open-next/assets", binding: "ASSETS" },
      observability: { enabled: true, head_sampling_rate: 1 },
    },
    null,
    2,
  ),
);

run("pnpm exec wrangler deploy --config .wrangler-bundle/wrangler.jsonc");
