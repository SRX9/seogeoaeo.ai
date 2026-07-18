import { PostHog } from "posthog-node";

// Lazy-initialized so a missing token degrades to a no-op instead of throwing
// at module load, which would break `next build` page-data collection for any
// route that imports this module.
let client: PostHog | null | undefined;

function getPosthogServer(): PostHog | null {
  if (client !== undefined) return client;
  const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!projectToken) {
    console.warn(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not configured; server analytics disabled",
    );
    client = null;
    return client;
  }
  client = new PostHog(projectToken, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
  return client;
}

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, boolean | number | string | undefined>,
) {
  const posthog = getPosthogServer();
  if (!posthog) return;
  posthog.capture({ distinctId, event, properties });
  await posthog.flush();
}
