export type BrandColor = {
  hex: string;
  name: string | null;
};

export type BrandAsset = {
  url: string;
  colors: BrandColor[];
  resolution: {
    width: number | null;
    height: number | null;
    aspectRatio: number | null;
  } | null;
};

export type BrandIntelligenceData = {
  domain: string;
  title: string | null;
  description: string | null;
  slogan: string | null;
  colors: BrandColor[];
  logos: BrandAsset[];
  backdrops: BrandAsset[];
  socials: Array<{ url: string }>;
  address: {
    street: string | null;
    city: string | null;
    country: string | null;
    countryCode: string | null;
    stateProvince: string | null;
    stateCode: string | null;
    postalCode: string | null;
  } | null;
  stock: { ticker: string | null; exchange: string | null } | null;
  isNsfw: boolean | null;
  email: string | null;
  phone: string | null;
  industries: Record<string, unknown> | null;
  links: Record<string, string>;
  /** Exact validated source object, retained so no provider detail is discarded. */
  raw: Record<string, unknown>;
  /** New Context.dev fields are retained here until first-class UI support is added. */
  extra: Record<string, unknown>;
};

export type BrandIdentitySummary = {
  title: string | null;
  description: string | null;
  slogan: string | null;
  domain: string;
  logoUrl: string | null;
  backdropUrl: string | null;
  colors: BrandColor[];
  refreshedAt: string;
  nextRefreshAt: string;
};
