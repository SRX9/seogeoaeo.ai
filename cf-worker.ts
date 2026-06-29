// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

// Maps each cron expression in wrangler.jsonc to the internal route it should
// hit. `event.cron` tells us exactly which schedule fired, so adding a new cron
// is just a new entry here plus the expression in wrangler.jsonc.
const CRON_ROUTES: Record<string, string> = {
  "0 8 * * *": "/api/cron/daily",
};

export default {
  fetch: handler.fetch,

  async scheduled(event, env, ctx) {
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error("CRON_SECRET is not configured");
      return;
    }

    const path = CRON_ROUTES[event.cron] ?? "/api/cron/daily";

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
