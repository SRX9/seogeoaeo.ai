import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof createDb>;

let cached: Db | null = null;

function resolveConnectionString(connectionString?: string) {
  return connectionString ?? process.env.DATABASE_URL;
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
  if (!cached) {
    cached = createDb(connectionString);
  }
  return cached;
}

export { schema };
