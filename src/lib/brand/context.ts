import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getBillingContext } from "@/lib/billing/access";
import { listBrands } from "@/lib/brand/repository";

const ACTIVE_BRAND_COOKIE = "active_brand_id";

type BrandRow = Awaited<ReturnType<typeof listBrands>>[number];

function pickActiveBrand(brandList: BrandRow[], cookieId: string | undefined) {
  if (cookieId) {
    const match = brandList.find((brand) => brand.id === cookieId);
    if (match) return match;
  }
  return brandList[0] ?? null;
}

/**
 * Resolve the workspace, subscription, and the currently selected brand.
 * Never redirects: use for read-only contexts like the app shell.
 */
export async function getActiveBrandContext() {
  const ctx = await getBillingContext();
  const brandList = await listBrands(ctx.workspace.id);
  const cookieId = (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
  const brand = pickActiveBrand(brandList, cookieId);
  return { ...ctx, brands: brandList, brand };
}

/**
 * Require a workspace with at least one brand and a selected brand. Redirects to
 * onboarding when the workspace has no brand yet.
 *
 * This does NOT require an active subscription: the whole app is browsable on
 * the free tier. Generating articles is gated separately at the action level so
 * users without a plan still see their data and a clear upgrade path.
 */
export async function requireBrand() {
  const ctx = await getBillingContext();
  const brandList = await listBrands(ctx.workspace.id);
  if (brandList.length === 0) {
    redirect("/onboarding");
  }
  const cookieId = (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
  const brand = pickActiveBrand(brandList, cookieId);
  if (!brand) {
    redirect("/onboarding");
  }
  return {
    ...ctx,
    brands: brandList,
    brand,
    scope: { workspaceId: ctx.workspace.id, brandId: brand.id },
  };
}

export async function setActiveBrandCookie(brandId: string) {
  (await cookies()).set(ACTIVE_BRAND_COOKIE, brandId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
