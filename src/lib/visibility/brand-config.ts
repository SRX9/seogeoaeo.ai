import type { ReportBrand } from "./report-pdf";

/**
 * V7.4: white-label config (optional agency tier). A workspace brand config
 * deep-merged over defaults, fed into the V6.1 report + V6.2 PDF. Port of
 * white-label/brand_config.py `load_brand()` (deep-merge over defaults).
 */

export interface BrandConfig {
  name: string;
  contact: { email: string | null; phone: string | null; website: string | null };
  colors: { primary: string; accent: string };
  logo: string | null;
}

export const DEFAULT_BRAND: BrandConfig = {
  name: "Visibility Report",
  contact: { email: null, phone: null, website: null },
  colors: { primary: "#0f172a", accent: "#ff6b57" },
  logo: null,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const out = { ...base } as T;
  for (const key of Object.keys(override) as (keyof T)[]) {
    const value = override[key];
    if (value == null) continue;
    out[key] =
      typeof value === "object" && !Array.isArray(value) && typeof base[key] === "object"
        ? deepMerge(base[key], value as DeepPartial<T[keyof T]>)
        : (value as T[keyof T]);
  }
  return out;
}

/** Merge a workspace's white-label overrides over the defaults. */
export function loadBrand(overrides?: DeepPartial<BrandConfig>): BrandConfig {
  return deepMerge(DEFAULT_BRAND, overrides);
}

/** Adapt a BrandConfig to the report/PDF brand shape. */
export function toReportBrand(config: BrandConfig): ReportBrand {
  return { name: config.name, primary: config.colors.primary, logo: config.logo ?? undefined };
}
