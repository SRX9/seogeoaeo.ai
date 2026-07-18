import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (projectToken) {
  posthog.init(projectToken, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
} else {
  console.warn(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not configured; client analytics disabled",
  );
}
