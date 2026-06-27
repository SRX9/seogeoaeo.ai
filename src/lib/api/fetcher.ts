/**
 * Thin client-side fetch wrapper used by every React Query hook and mutation.
 * Talks directly to the app's /api routes and throws a typed error on failure
 * so callers can surface a message via toast.
 */
/** Generic, user-safe fallback shown whenever we don't have a friendly message. */
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  /**
   * True only when {@link message} came from the API's `error` field — i.e. a
   * message the server intends to show the user. False for transport-level
   * fallbacks (non-JSON body, raw HTTP status) which must never be displayed.
   */
  userFacing: boolean;

  constructor(message: string, status: number, details?: unknown, userFacing = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.userFacing = userFacing;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      credentials: "same-origin",
    });
  } catch {
    // Network / CORS / offline failures throw a raw browser error ("Failed to
    // fetch"). Normalize to a friendly, non-user-facing ApiError.
    throw new ApiError(GENERIC_ERROR_MESSAGE, 0);
  }

  const raw = await res.text();
  const data = raw ? safeJson(raw) : null;

  if (!res.ok) {
    const serverMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : null;
    // Only the server's own `error` string is safe to show. Never surface
    // statusText or a raw response body to the user.
    throw new ApiError(serverMessage ?? GENERIC_ERROR_MESSAGE, res.status, data, Boolean(serverMessage));
  }

  return data as T;
}

/**
 * Resolve a user-safe message from any thrown value. Returns the server's
 * intended message for an {@link ApiError}, otherwise the caller's contextual
 * fallback — so raw network/auth/runtime errors are never shown to the user.
 */
export function getErrorMessage(error: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string {
  if (error instanceof ApiError && error.userFacing && error.message) {
    return error.message;
  }
  return fallback;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const apiGet = <T>(path: string) => request<T>(path);

export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiPatch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiPut = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiDelete = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) });
