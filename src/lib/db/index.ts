import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import * as appSchema from "./schema/app";
import * as agentOsSchema from "./schema/agent-os";
import * as authSchema from "./schema/auth";
import * as brandSchema from "./schema/brand";
import * as contentSchema from "./schema/content";
import * as creditsSchema from "./schema/credits";
import * as groundingSchema from "./schema/grounding";
import * as autonomySchema from "./schema/autonomy";
import * as connectorsSchema from "./schema/connectors";
import * as jobsSchema from "./schema/jobs";
import * as observabilitySchema from "./schema/observability";
import * as publicationsSchema from "./schema/publications";
import * as rateLimitSchema from "./schema/rate-limits";
import * as visibilitySchema from "./schema/visibility";

const schema = {
  ...agentOsSchema,
  ...authSchema,
  ...appSchema,
  ...brandSchema,
  ...connectorsSchema,
  ...contentSchema,
  ...creditsSchema,
  ...groundingSchema,
  ...jobsSchema,
  ...observabilitySchema,
  ...autonomySchema,
  ...publicationsSchema,
  ...rateLimitSchema,
  ...visibilitySchema,
};

type Db = ReturnType<typeof createDb>;

// Next.js can evaluate this module once per route bundle and again after HMR.
// Keep the direct-connection pool process-global so those copies do not each
// consume a PostgreSQL connection. Hyperdrive remains request-scoped below.
const PROCESS_DB_KEY = Symbol.for("seo-ai.process-db");
const processDbCache = globalThis as unknown as Record<symbol, Db | undefined>;
const requestDbs = new WeakMap<object, Db>();

function resolveConnectionString(connectionString?: string) {
  return (
    connectionString ??
    getCloudflareRequestContext()?.env?.HYPERDRIVE?.connectionString ??
    process.env.DATABASE_URL
  );
}

export function createDb(connectionString?: string) {
  const url = resolveConnectionString(connectionString);
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }

  const client = postgres(url, { prepare: false, max: 1 });
  return drizzle(client, { schema });
}

export function getDb(connectionString?: string) {
  const context = connectionString ? undefined : getCloudflareRequestContext();
  const hyperdriveUrl = context?.env?.HYPERDRIVE?.connectionString;
  const requestKey = hyperdriveUrl ? context.ctx : undefined;

  if (requestKey) {
    const requestDb = requestDbs.get(requestKey);
    if (requestDb) {
      return requestDb;
    }

    const db = createDb();
    requestDbs.set(requestKey, db);
    return db;
  }

  if (connectionString) {
    return createDb(connectionString);
  }

  // Hyperdrive is present but no request ctx to scope a client to (code running
  // outside the request's async context). A Hyperdrive-backed client must NOT
  // be process-cached: Hyperdrive reaps idle client connections between
  // requests, and postgres.js queries on the reaped socket fail ("Idle
  // connection closed by Hyperdrive") or hang. A fresh client per call is the
  // safe trade.
  if (hyperdriveUrl) {
    return createDb(hyperdriveUrl);
  }

  processDbCache[PROCESS_DB_KEY] ??= createDb();
  return processDbCache[PROCESS_DB_KEY];
}

export { schema };
