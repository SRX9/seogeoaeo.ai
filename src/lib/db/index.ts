import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import * as schema from "./schema";

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
