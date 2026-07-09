// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

// Maps each cron expression in wrangler.jsonc to the internal route it should
// hit. Keep this table in sync with scripts/build-cloudflare.mjs cronRoutes.
const CRON_ROUTES: Record<string, string> = {
  "0 8 * * *": "/api/cron/daily",
  "0 9 * * *": "/api/cron/visibility",
  "0 10 * * 1": "/api/cron/digest",
};

export default {
  fetch: handler.fetch,

  async scheduled(event, env, ctx) {
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error("CRON_SECRET is not configured");
      return;
    }

    const path = CRON_ROUTES[event.cron];
    if (!path) {
      // No silent fallback: an unmapped expression means wrangler.jsonc and
      // this table are out of sync — surface it instead of re-running daily.
      console.error("No cron route mapped for expression", event.cron);
      return;
    }

    await handler.fetch(
      new Request(`https://cron.internal${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      }),
      env,
      ctx,
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-ignore `.open-next/worker.js` is generated at build time
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
