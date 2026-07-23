/** Google OAuth scope for Search Console traffic proof. Client-safe constants only. */

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** Requested on demand via authClient.linkSocial when the user clicks Connect. */
export const GOOGLE_TRAFFIC_SCOPES = [GSC_SCOPE] as const;
