import { logWarn } from "@/lib/logging/logger";

/** Fail-closed ownership check for records referenced by an internal action. */
export function isTenantScopeMatch(
  request: { workspaceId: string; brandId: string },
  resource: { workspaceId: string; brandId: string } | null | undefined,
): boolean {
  const matches = Boolean(
    resource &&
      resource.workspaceId === request.workspaceId &&
      resource.brandId === request.brandId,
  );
  if (!matches) {
    logWarn("security.cross_tenant_denied", {
      requestWorkspaceId: request.workspaceId,
      requestBrandId: request.brandId,
      resourceWorkspaceId: resource?.workspaceId ?? null,
      resourceBrandId: resource?.brandId ?? null,
    });
  }
  return matches;
}
