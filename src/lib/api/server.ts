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

function jsonError(message: string, status = 400, details?: unknown) {
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
    if (error instanceof Error && error.message === "Workspace not found") {
      throw new HttpError(503, "Your workspace is still being prepared. Refresh in a moment.");
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

/**
 * 409 while Claudia's Setup Run is executing for the brand. Manual triggers
 * that overlap her setup steps (research, audits, answer checks, competitor
 * discovery, article generation) call this after {@link requireApiBrand} so a
 * stale tab can't kick off duplicate work mid-setup.
 */
export async function assertNoSetupRunning(brandId: string): Promise<void> {
  const { getSetupRun, isSetupRunStale } = await import("@/lib/jobs/setup-run");
  const run = await getSetupRun(brandId);
  // A stale `running` row means the executor died: don't let a dead run block
  // manual work; the setup-run GET poller's self-heal resumes or finishes it.
  if (run?.status === "running" && !isSetupRunStale(run)) {
    throw new HttpError(
      409,
      "Claudia is still setting up this brand. This will run automatically when setup is done.",
      { code: "SETUP_IN_PROGRESS" },
    );
  }
}

/** Parse a request body with a zod schema, throwing a 400 HttpError on failure. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    // Prefer the first field message so clients show something actionable.
    const first =
      result.error.issues[0]?.message && result.error.issues[0].path.length > 0
        ? `${result.error.issues[0].path.join(".")}: ${result.error.issues[0].message}`
        : result.error.issues[0]?.message;
    throw new HttpError(400, first || "Invalid input", result.error.flatten());
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
