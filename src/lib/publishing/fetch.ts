/**
 * Network wrapper for publishing adapters: never throw on transport failure;
 * always surface `{ ok: false, error }` so multi-destination publish can continue.
 */

export type PublishFetchOk = { ok: true; response: Response };
export type PublishFetchErr = { ok: false; error: string };
export type PublishFetchResult = PublishFetchOk | PublishFetchErr;

export async function publishFetch(
  label: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<PublishFetchResult> {
  try {
    const response = await fetch(input, init);
    return { ok: true, response };
  } catch (error) {
    return {
      ok: false,
      error: `${label} request failed: ${error instanceof Error ? error.message : "network error"}`,
    };
  }
}
