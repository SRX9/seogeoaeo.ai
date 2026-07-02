import { getCloudflareRequestContext } from "./context";

/**
 * JSON get/put over the `CACHE` KV binding. Returns misses when the binding
 * is unavailable (e.g. plain `next dev`) so callers degrade to uncached.
 */

function getCache(): KvCacheBinding | null {
  return getCloudflareRequestContext()?.env?.CACHE ?? null;
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const cache = getCache();
  if (!cache) return null;
  try {
    return await cache.get<T>(key, "json");
  } catch (error) {
    console.error("[kv] get failed", key, error);
    return null;
  }
}

export async function kvPutJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const cache = getCache();
  if (!cache) return;
  try {
    await cache.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch (error) {
    console.error("[kv] put failed", key, error);
  }
}
