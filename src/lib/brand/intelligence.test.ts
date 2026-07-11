import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cloudflare/kv", () => ({
  kvGetJson: vi.fn().mockResolvedValue(null),
  kvPutJson: vi.fn().mockResolvedValue(undefined),
}));

import { kvPutJson } from "@/lib/cloudflare/kv";
import {
  BRAND_INTELLIGENCE_REFRESH_MS,
  domainFromWebsite,
  normalizeBrandIntelligence,
  pickPrimaryLogo,
  retrieveBrandIntelligence,
} from "@/lib/brand/intelligence";

const savedKey = process.env.CONTEXT_DEV_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONTEXT_DEV_API_KEY = "context-test-key";
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.CONTEXT_DEV_API_KEY;
  else process.env.CONTEXT_DEV_API_KEY = savedKey;
});

describe("brand intelligence", () => {
  it("normalizes domains and rejects non-public hosts", () => {
    expect(domainFromWebsite("https://www.Example.com/path")).toBe("example.com");
    expect(domainFromWebsite("localhost")).toBeNull();
    expect(domainFromWebsite("javascript:alert(1)")).toBeNull();
  });

  it("retains every supported detail and unknown source fields", () => {
    const data = normalizeBrandIntelligence(
      {
        domain: "www.acme.test",
        title: "Acme",
        description: "Analytics for modern teams.",
        slogan: "Know what works",
        colors: [{ hex: "0a84ff", name: "Blue" }, { hex: "not-a-color" }],
        logos: [{ url: "https://cdn.acme.test/logo.png", resolution: { width: 512, height: 512, aspect_ratio: 1 } }],
        backdrops: [{ url: "http://unsafe.test/backdrop.png" }],
        socials: [{ url: "https://linkedin.com/company/acme" }],
        address: { city: "Pune", country_code: "IN" },
        stock: { ticker: "ACME", exchange: "NASDAQ" },
        industries: { eic: ["Software"] },
        links: { pricing: "https://acme.test/pricing", empty: null },
        custom_field: { source: "future-context-field" },
      },
      "acme.test",
    );

    expect(data.colors).toEqual([{ hex: "#0A84FF", name: "Blue" }]);
    expect(data.logos).toHaveLength(1);
    expect(data.backdrops).toEqual([]);
    expect(data.address?.countryCode).toBe("IN");
    expect(data.links).toEqual({ pricing: "https://acme.test/pricing" });
    expect(data.raw.custom_field).toEqual({ source: "future-context-field" });
    expect(data.extra.custom_field).toEqual({ source: "future-context-field" });
  });

  it("calls Context.dev by domain with a 30-day upstream cache window", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          brand: {
            domain: "acme.test",
            title: "Acme",
            logos: [{ url: "https://cdn.acme.test/wide.svg", resolution: { width: 800, height: 200, aspect_ratio: 4 } }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const data = await retrieveBrandIntelligence("https://www.acme.test/about", { fetchImpl });

    expect(data?.title).toBe("Acme");
    const request = fetchImpl.mock.calls[0];
    expect(request[0]).toBe("https://api.context.dev/v1/brand/retrieve");
    expect(JSON.parse(request[1].body)).toEqual({
      type: "by_domain",
      domain: "acme.test",
      maxAgeMs: BRAND_INTELLIGENCE_REFRESH_MS,
    });
    expect(vi.mocked(kvPutJson)).toHaveBeenCalledOnce();
  });

  it("prefers a square logo over a larger wordmark for compact UI", () => {
    expect(
      pickPrimaryLogo([
        {
          url: "https://cdn.test/wordmark.svg",
          colors: [],
          resolution: { width: 1200, height: 200, aspectRatio: 6 },
        },
        {
          url: "https://cdn.test/mark.svg",
          colors: [],
          resolution: { width: 256, height: 256, aspectRatio: 1 },
        },
      ]),
    ).toBe("https://cdn.test/mark.svg");
  });
});
