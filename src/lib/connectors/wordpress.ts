import { z } from "zod";
import { fingerprintConnectorState } from "@/lib/connectors/protocol";
import {
  ConnectorAdapterError,
  type ConnectorAdapter,
  type ConnectorContext,
  type ConnectorDiffEntry,
  type ConnectorVerification,
} from "@/lib/connectors/types";

export type WordPressArticleMetaConfig = {
  siteUrl?: string;
  username?: string;
};

export type WordPressArticleMetaSecrets = {
  wordpress_application_password?: string;
};

export type WordPressArticleMetaDesiredState = {
  slug?: string;
  excerpt?: string;
};

export type WordPressArticleMetaField = keyof WordPressArticleMetaDesiredState;

export type WordPressArticleMetaState = {
  protocol: "claudia-wordpress-mutation-v1";
  pluginVersion: "1.0.0";
  id: number;
  link: string;
  modifiedGmt: string;
  revision: string;
  slug: string;
  excerpt: string;
  status: "publish";
};

const wordpressRawStateSchema = z
  .object({
    protocol: z.literal("claudia-wordpress-mutation-v1"),
    plugin_version: z.literal("1.0.0"),
    id: z.number().int().positive(),
    link: z.string().url().regex(/^https?:\/\//i),
    modified_gmt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    slug: z.string(),
    excerpt: z.string(),
    status: z.literal("publish"),
  })
  .strict();

export type WordPressArticleMetaRawState = z.infer<typeof wordpressRawStateSchema>;

const wordpressDesiredStateSchema = z
  .object({
    slug: z.string().trim().min(1).optional(),
    excerpt: z.string().optional(),
  })
  .strict()
  .refine((value) => value.slug !== undefined || value.excerpt !== undefined, {
    message: "At least one metadata field is required",
  });

type WordPressContext = ConnectorContext<
  WordPressArticleMetaConfig,
  WordPressArticleMetaSecrets
>;

const MUTATION_PROTOCOL = "claudia-wordpress-mutation-v1" as const;
const FIELD_ORDER: readonly WordPressArticleMetaField[] = ["slug", "excerpt"];

function invalidConfiguration(message: string): never {
  throw new ConnectorAdapterError(message, "invalid_configuration", false);
}

function invalidMutation(message: string): never {
  throw new ConnectorAdapterError(message, "invalid_mutation", false);
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!address.includes(":")) return false;
  const mappedIpv4 = address.startsWith("::ffff:")
    ? address
        .slice("::ffff:".length)
        .split(":")
        .map((part) => Number.parseInt(part, 16))
    : [];
  const mappedIpv4IsPrivate =
    mappedIpv4.length === 2 &&
    mappedIpv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff) &&
    isPrivateIpv4(
      `${mappedIpv4[0]! >> 8}.${mappedIpv4[0]! & 0xff}.${mappedIpv4[1]! >> 8}.${
        mappedIpv4[1]! & 0xff
      }`,
    );
  return (
    address === "::" ||
    address === "::1" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    /^fe[89ab]/.test(address) ||
    address.startsWith("ff") ||
    address.startsWith("2001:db8:") ||
    mappedIpv4IsPrivate
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    [".localhost", ".local", ".internal", ".home", ".lan", ".localdomain"].some(
      (suffix) => normalized.endsWith(suffix),
    ) ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  );
}

/** Normalize a configured public HTTPS site root without ever carrying credentials. */
export function normalizeWordPressSiteUrl(siteUrl: string): string {
  let url: URL;
  try {
    url = new URL(siteUrl.trim());
  } catch {
    return invalidConfiguration("WordPress site URL is invalid");
  }

  if (url.protocol !== "https:") {
    return invalidConfiguration("WordPress application passwords require HTTPS");
  }
  if (url.port && url.port !== "443") {
    return invalidConfiguration("WordPress site URL must use the standard HTTPS port");
  }
  if (url.username || url.password) {
    return invalidConfiguration("WordPress site URL must not contain credentials");
  }
  if (isPrivateHostname(url.hostname)) {
    return invalidConfiguration("WordPress site URL must use a public host");
  }

  const wpJsonIndex = url.pathname.search(/\/wp-json(?:\/|$)/i);
  const basePath = (wpJsonIndex >= 0 ? url.pathname.slice(0, wpJsonIndex) : url.pathname)
    .replace(/\/+$/, "");
  url.pathname = basePath || "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/** Non-secret identity used to bind certification evidence to one installation. */
export async function fingerprintWordPressIntegration(input: {
  integrationId: string;
  siteUrl: string;
  username: string;
  adapterVersion: string;
}) {
  const endpointOrigin = normalizeWordPressSiteUrl(input.siteUrl);
  const fingerprint = await fingerprintConnectorState({
    integrationId: input.integrationId,
    endpointOrigin,
    username: input.username.trim(),
    adapterVersion: input.adapterVersion,
  });
  return { endpointOrigin, fingerprint };
}

function encodeBasicCredentials(username: string, applicationPassword: string): string {
  const bytes = new TextEncoder().encode(`${username}:${applicationPassword}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function validatedRequest(context: WordPressContext) {
  const siteUrl = context.config.siteUrl?.trim();
  const username = context.config.username?.trim();
  const applicationPassword = context.secrets.wordpress_application_password
    ?.replace(/\s+/g, "")
    .trim();

  if (!siteUrl) invalidConfiguration("WordPress site URL is required");
  if (!username) invalidConfiguration("WordPress username is required");
  if (!applicationPassword) {
    invalidConfiguration("WordPress application password is required");
  }
  if (!/^\d+$/.test(context.remoteResourceId) || Number(context.remoteResourceId) < 1) {
    invalidConfiguration("WordPress remote resource ID must be a positive integer");
  }
  if (!/^[\x21-\x7e]{1,200}$/.test(context.idempotencyKey)) {
    invalidConfiguration("Connector idempotency key must be safe ASCII text");
  }

  const base = normalizeWordPressSiteUrl(siteUrl);
  const endpoint = `${base}/wp-json/claudia/v1/posts/${encodeURIComponent(
    context.remoteResourceId,
  )}/metadata`;
  return {
    endpoint,
    authorization: `Basic ${encodeBasicCredentials(username, applicationPassword)}`,
  };
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function throwForResponse(response: Response): never {
  if (response.status === 401 || response.status === 403) {
    throw new ConnectorAdapterError(
      "WordPress authentication was rejected or revoked",
      "authentication_revoked",
      false,
      response.status,
    );
  }
  if (response.status === 429) {
    throw new ConnectorAdapterError(
      "WordPress rate limit reached",
      "rate_limited",
      true,
      response.status,
      parseRetryAfter(response),
    );
  }
  if (response.status === 409) {
    throw new ConnectorAdapterError(
      "WordPress rejected a stale connector revision",
      "revision_conflict",
      false,
      response.status,
    );
  }
  if (response.status >= 500) {
    throw new ConnectorAdapterError(
      "WordPress is temporarily unavailable",
      "provider_unavailable",
      true,
      response.status,
    );
  }
  throw new ConnectorAdapterError(
    `WordPress rejected the request (${response.status})`,
    "request_rejected",
    false,
    response.status,
  );
}

async function parseWordPressResponse(response: Response): Promise<WordPressArticleMetaRawState> {
  if (!response.ok) throwForResponse(response);
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ConnectorAdapterError(
      "WordPress returned an unexpected content type",
      "schema_drift",
      false,
      response.status,
    );
  }

  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch {
    throw new ConnectorAdapterError(
      "WordPress returned malformed JSON",
      "schema_drift",
      false,
      response.status,
    );
  }

  const parsed = wordpressRawStateSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ConnectorAdapterError(
      "WordPress response no longer matches the certified schema",
      "schema_drift",
      false,
      response.status,
    );
  }
  return parsed.data;
}

async function authenticatedFetch(
  context: WordPressContext,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  idempotencyKey = context.idempotencyKey,
): Promise<WordPressArticleMetaRawState> {
  const request = validatedRequest(context);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: request.authorization,
  };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = idempotencyKey;
  }

  let response: Response;
  try {
    response = await context.fetch(
      request.endpoint,
      {
        method,
        headers,
        redirect: "manual",
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  } catch {
    throw new ConnectorAdapterError(
      "WordPress network request failed",
      "network_error",
      true,
    );
  }
  return parseWordPressResponse(response);
}

function validateDiff(
  diff: readonly ConnectorDiffEntry<WordPressArticleMetaField>[],
): void {
  const seen = new Set<WordPressArticleMetaField>();
  for (const entry of diff) {
    if (!FIELD_ORDER.includes(entry.field)) invalidMutation("Unsupported WordPress metadata field");
    if (seen.has(entry.field)) invalidMutation("Duplicate WordPress metadata field");
    if (entry.before === entry.after) invalidMutation("WordPress metadata diff contains no change");
    if (entry.field === "slug" && !entry.after.trim()) {
      invalidMutation("WordPress slug cannot be empty");
    }
    seen.add(entry.field);
  }
}

function normalize(raw: WordPressArticleMetaRawState): WordPressArticleMetaState {
  return {
    protocol: raw.protocol,
    pluginVersion: raw.plugin_version,
    id: raw.id,
    link: raw.link,
    modifiedGmt: raw.modified_gmt,
    revision: raw.revision,
    slug: raw.slug,
    excerpt: raw.excerpt,
    status: raw.status,
  };
}

function verify(
  diff: readonly ConnectorDiffEntry<WordPressArticleMetaField>[],
  actual: WordPressArticleMetaState,
): ConnectorVerification<WordPressArticleMetaField> {
  validateDiff(diff);
  const unexpected = diff.flatMap((entry) => {
    const value = actual[entry.field];
    return value === entry.after
      ? []
      : [{ field: entry.field, expected: entry.after, actual: value }];
  });
  return unexpected.length === 0 ? { ok: true } : { ok: false, unexpected };
}

async function write(
  context: WordPressContext,
  diff: readonly ConnectorDiffEntry<WordPressArticleMetaField>[],
): Promise<WordPressArticleMetaState> {
  validateDiff(diff);
  if (diff.length === 0) return normalize(await authenticatedFetch(context, "GET"));
  if (!context.expectedRevision?.match(/^[a-f0-9]{64}$/)) {
    invalidConfiguration("A certified WordPress revision is required");
  }

  const changes: Partial<
    Record<WordPressArticleMetaField, { before: string; after: string }>
  > = {};
  for (const entry of diff) {
    changes[entry.field] = { before: entry.before, after: entry.after };
  }
  return normalize(
    await authenticatedFetch(context, "POST", {
      protocol: MUTATION_PROTOCOL,
      operation: "apply",
      expected_revision: context.expectedRevision,
      idempotency_key: context.idempotencyKey,
      changes,
    }),
  );
}

export const wordpressArticleMetaUpdateAdapter: ConnectorAdapter<
  WordPressArticleMetaConfig,
  WordPressArticleMetaSecrets,
  WordPressArticleMetaRawState,
  WordPressArticleMetaState,
  WordPressArticleMetaDesiredState,
  WordPressArticleMetaField
> = {
  provider: "wordpress",
  capability: "article.meta.update",
  version: "wordpress-companion-v1",

  read(context) {
    return authenticatedFetch(context, "GET");
  },

  normalize,

  constructDiff(current, desired) {
    const parsed = wordpressDesiredStateSchema.safeParse(desired);
    if (!parsed.success) invalidMutation("WordPress metadata change is invalid or empty");

    return FIELD_ORDER.flatMap((field) => {
      const after = parsed.data[field];
      if (after === undefined || current[field] === after) return [];
      return [{ field, before: current[field], after }];
    });
  },

  write,

  verify,

  async rollback(context, diff) {
    validateDiff(diff);
    const current = normalize(await authenticatedFetch(context, "GET"));
    if (diff.length === 0) return { status: "reverted", state: current };

    const safeToRollback = verify(diff, current);
    if (!safeToRollback.ok) {
      return {
        status: "manual_recovery_required",
        reason: "remote_drift",
        wrote: false,
        state: current,
        unexpected: safeToRollback.unexpected,
      };
    }

    const reverse = diff.map((entry) => ({
      field: entry.field,
      before: entry.after,
      after: entry.before,
    }));
    const rollbackIdempotencyKey = `${context.idempotencyKey}:rollback`;
    const changes = Object.fromEntries(
      reverse.map((entry) => [
        entry.field,
        { before: entry.before, after: entry.after },
      ]),
    );
    await authenticatedFetch(
      context,
      "POST",
      {
        protocol: MUTATION_PROTOCOL,
        operation: "rollback",
        expected_revision: current.revision,
        idempotency_key: rollbackIdempotencyKey,
        changes,
      },
      rollbackIdempotencyKey,
    );
    const restored = normalize(await authenticatedFetch(context, "GET"));
    const verified = verify(reverse, restored);
    if (!verified.ok) {
      return {
        status: "manual_recovery_required",
        reason: "rollback_verification_failed",
        wrote: true,
        state: restored,
        unexpected: verified.unexpected,
      };
    }
    return { status: "reverted", state: restored };
  },
};
