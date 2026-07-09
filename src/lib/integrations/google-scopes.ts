/** Google OAuth scopes for traffic proof (GSC + GA4). Client-safe constants only. */

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Requested on demand via authClient.linkSocial when the user clicks Connect. */
export const GOOGLE_TRAFFIC_SCOPES = [GSC_SCOPE, GA4_SCOPE] as const;
