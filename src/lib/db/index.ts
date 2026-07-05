import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import * as appSchema from "./schema/app";
import * as authSchema from "./schema/auth";
import * as brandSchema from "./schema/brand";
import * as contentSchema from "./schema/content";
import * as creditsSchema from "./schema/credits";
import * as jobsSchema from "./schema/jobs";
import * as publicationsSchema from "./schema/publications";
import * as rateLimitSchema from "./schema/rate-limits";
import * as visibilitySchema from "./schema/visibility";

const schema = {
  ...authSchema,
  ...appSchema,
  ...brandSchema,
  ...contentSchema,
  ...creditsSchema,
  ...jobsSchema,
  ...publicationsSchema,
  ...rateLimitSchema,
  ...visibilitySchema,
};

type Db = ReturnType<typeof createDb>;

let cached: Db | null = null;
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
  const requestKey = context?.env?.HYPERDRIVE?.connectionString ? context.ctx : undefined;

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

  if (!cached) {
    cached = createDb();
  }
  return cached;
}

export { schema };
