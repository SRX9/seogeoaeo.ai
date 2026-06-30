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

// Parse wrangler.jsonc. It's JSON today, but the .jsonc extension allows
// comments, so strip block comments and line-leading `//` comments first
// (leaving inline `https://` inside string values untouched).
function readWranglerConfig(path) {
  const raw = readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(raw);
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

// Derive the deploy config from the canonical wrangler.jsonc so bindings
// (send_email/EMAIL, hyperdrive), routes, and cron triggers can never drift
// from what `preview:cf` and `cf-typegen` see. We only override the
// path-related fields, which differ because here we deploy the pre-bundled
// worker out of .wrangler-bundle with `no_bundle`.
const canonical = readWranglerConfig(resolve("wrangler.jsonc"));
delete canonical.$schema;

const deployConfig = {
  ...canonical,
  main: "worker.js",
  no_bundle: true,
  assets: { ...canonical.assets, directory: "../.open-next/assets" },
};

writeFileSync(resolve(".wrangler-bundle/wrangler.jsonc"), JSON.stringify(deployConfig, null, 2));

run("pnpm exec wrangler deploy --config .wrangler-bundle/wrangler.jsonc");
