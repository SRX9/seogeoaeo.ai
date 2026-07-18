import { PostHog } from "posthog-node";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (!projectToken) {
  throw new Error("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN must be configured");
}

export const posthogServer = new PostHog(projectToken, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
  enableExceptionAutocapture: true,
});

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, boolean | number | string | undefined>,
) {
  posthogServer.capture({ distinctId, event, properties });
  await posthogServer.flush();
}
