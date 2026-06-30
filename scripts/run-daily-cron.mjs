#!/usr/bin/env node
// Manually fire the daily content-agent cron against a running server — the same
// request Cloudflare's scheduled handler makes in production, just on demand.
//
//   pnpm cron:daily                 -> POSTs http://localhost:3000/api/cron/daily
//   pnpm cron:daily https://prod    -> target another origin (uses the same CRON_SECRET)
//
// Env is loaded via `node --env-file=.env` (see package.json), so CRON_SECRET
// comes straight from your local .env.

const target = (process.argv[2] || process.env.CRON_TARGET || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is not set. Add it to .env (it's the bearer token the route checks).");
  process.exit(1);
}

const url = `${target}/api/cron/daily`;
console.log(`POST ${url}`);

const started = Date.now();
let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
} catch (error) {
  console.error(`Request failed — is the dev server running? (${error.message})`);
  process.exit(1);
}

const body = await response.text();
console.log(`${response.status} ${response.statusText} (${Date.now() - started}ms)`);

try {
  console.dir(JSON.parse(body), { depth: null, colors: true });
} catch {
  console.log(body);
}

process.exit(response.ok ? 0 : 1);
