import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveBrandContext } from "@/lib/brand/context";

/**
 * Server-side helpers for the /api route handlers. Routes stay thin: resolve the
 * authenticated workspace/brand context, call the existing repositories, and
 * return JSON. Errors map to status codes via {@link HttpError}.
 */
export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data ?? { ok: true }, init);
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(details ? { error: message, details } : { error: message }, { status });
}

/** Resolve workspace + subscription + active brand for an authenticated request. */
export async function getApiContext() {
  try {
    return await getActiveBrandContext();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      throw new HttpError(401, "Unauthenticated");
    }
    throw error;
  }
}

/** Like {@link getApiContext} but requires a selected brand (404 otherwise). */
export async function requireApiBrand() {
  const ctx = await getApiContext();
  if (!ctx.brand) {
    throw new HttpError(404, "No brand selected", { code: "NO_BRAND" });
  }
  return { ...ctx, scope: { workspaceId: ctx.workspace.id, brandId: ctx.brand.id } };
}

/** Parse a request body with a zod schema, throwing a 400 HttpError on failure. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, "Invalid input", result.error.flatten());
  }
  return result.data;
}

/** Wrap a route handler so HttpError / unexpected errors become JSON responses. */
export async function handleApi(fn: () => Promise<NextResponse | Response>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status, error.details);
    }
    console.error("[api] unhandled error", error);
    return jsonError("Something went wrong", 500);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
