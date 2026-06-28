#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// `VAR=value command` does not work in Windows PowerShell. Keep Cloudflare
// builds cross-platform while avoiding real production secrets at build time.
const buildTimeDefaults = {
  DATABASE_URL: "postgresql://ci:ci@localhost:5432/seo_ai",
  BETTER_AUTH_SECRET: "ci-build-secret-minimum-32-characters",
  BETTER_AUTH_URL: "https://seo-ai.example.com",
  ENCRYPTION_KEY: "ci-encryption-key-32-characters-long",
  CRON_SECRET: "ci-cron-secret-minimum-32-characters",
};

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => entry[1] !== undefined),
);
for (const [key, value] of Object.entries(buildTimeDefaults)) {
  env[key] ||= value;
}

const result = spawnSync("pnpm exec opennextjs-cloudflare build", {
  env,
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

const workerPath = resolve(".open-next/worker.js");
let worker = readFileSync(workerPath, "utf8");

if (!worker.includes("defaultServerHandler")) {
  worker = worker.replace(
    'import { handler as middlewareHandler } from "./middleware/handler.mjs";',
    'import { handler as middlewareHandler } from "./middleware/handler.mjs";\n//@ts-expect-error: Will be resolved by wrangler build\nimport { handler as defaultServerHandler } from "./server-functions/default/handler.mjs";',
  );

  worker = worker.replace(
    '            // @ts-expect-error: resolved by wrangler build\n            const { handler } = await import("./server-functions/default/handler.mjs");\n            return handler(reqOrResp, env, ctx, request.signal);',
    "            return defaultServerHandler(reqOrResp, env, ctx, request.signal);",
  );
}

if (!worker.includes("async scheduled(")) {
  const fetchEnd = "    },\n};";
  const scheduledHandler = `    },
    async scheduled(_event, env, _ctx) {
        const secret = env.CRON_SECRET;
        const origin = env.BETTER_AUTH_URL;
        if (!secret || !origin) {
            console.error("CRON_SECRET or BETTER_AUTH_URL is not configured");
            return;
        }

        const response = await fetch(new URL("/api/cron/weekly", origin), {
            method: "POST",
            headers: { Authorization: \`Bearer \${secret}\` },
        });

        if (!response.ok) {
            console.error("Weekly cron failed", response.status, await response.text());
        }
    },
};`;

  if (!worker.includes(fetchEnd)) {
    console.error("Unable to patch .open-next/worker.js with the scheduled handler.");
    process.exit(1);
  }

  worker = worker.replace(fetchEnd, scheduledHandler);
}

writeFileSync(workerPath, worker);

const middlewareManifest = readFileSync(resolve(".next/server/middleware-manifest.json"), "utf8").trim();
const compactDynamicRequireNeedle =
  "function(x){if(typeof require<\"u\")return require.apply(this,arguments);throw Error('Dynamic require of \"'+x+'\" is not supported')}";
const readableDynamicRequireNeedle = `function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
}`;

for (const serverBundlePath of [
  resolve(".open-next/server-functions/default/handler.mjs"),
  resolve(".open-next/server-functions/default/index.mjs"),
]) {
  if (!existsSync(serverBundlePath)) {
    continue;
  }

  const serverBundle = readFileSync(serverBundlePath, "utf8");
  const compactPatchedDynamicRequire = `function(x){if(x==="/.next/server/middleware-manifest.json")return ${middlewareManifest};if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+x+'" is not supported')}`;
  const readablePatchedDynamicRequire = `function(x) {
  if (x === "/.next/server/middleware-manifest.json") return ${middlewareManifest};
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
}`;

  writeFileSync(
    serverBundlePath,
    serverBundle
      .replace(compactDynamicRequireNeedle, compactPatchedDynamicRequire)
      .replace(readableDynamicRequireNeedle, readablePatchedDynamicRequire),
  );
}

process.exit(0);
