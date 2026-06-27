// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  async scheduled(_event, env, ctx) {
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error("CRON_SECRET is not configured");
      return;
    }

    await handler.fetch(
      new Request("https://cron.internal/api/cron/weekly", {
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
