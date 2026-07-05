import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "../types";
import { type EnrichFn, enrichSchemaFixes } from "./enrich";
import type { SchemaFix } from "./generate";

function snapshot(text: string): PageSnapshot {
  return {
    url: "https://acme.example/",
    status_code: 200,
    redirect_chain: [],
    headers: {},
    meta_tags: {},
    title: null,
    description: null,
    canonical: null,
    h1_tags: [],
    heading_structure: [],
    word_count: text.split(/\s+/).length,
    text_content: text,
    internal_links: [],
    external_links: [],
    images: [],
    structured_data: [],
    has_ssr_content: true,
    security_headers: {},
    errors: [],
    html: "",
  };
}

const gen = (data: unknown): EnrichFn => async () => ({ data });

const orgFix = (): SchemaFix[] => [
  {
    schema: "Organization",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme Analytics",
      description: "[REPLACE: one-sentence company description]",
      url: "https://acme.example",
    },
  },
];

const PAGE =
  "Acme Analytics is a product analytics platform that helps engineering teams track activation, retention, and conversion across their product.";

describe("enrichSchemaFixes", () => {
  it("fills a placeholder with grounded content from the page", async () => {
    const out = await enrichSchemaFixes(orgFix(), snapshot(PAGE), {
      generate: gen({
        fills: [{ path: "0", value: "Acme Analytics is a product analytics platform for engineering teams." }],
      }),
    });
    const desc = (out[0].jsonLd as { description: string }).description;
    expect(desc).not.toContain("[REPLACE:");
    expect(desc).toContain("product analytics");
  });

  it("rejects an ungrounded fill (hallucinated facts) and keeps the placeholder", async () => {
    const out = await enrichSchemaFixes(orgFix(), snapshot(PAGE), {
      generate: gen({
        fills: [{ path: "0", value: "The world's leading blockchain gaming metaverse studio since 1998." }],
      }),
    });
    expect((out[0].jsonLd as { description: string }).description).toContain("[REPLACE:");
  });

  it("never touches non-placeholder values", async () => {
    const out = await enrichSchemaFixes(orgFix(), snapshot(PAGE), {
      generate: gen({ fills: [{ path: "0", value: "Acme Analytics is a product analytics platform for teams." }] }),
    });
    expect((out[0].jsonLd as { name: string }).name).toBe("Acme Analytics");
  });

  it("returns the input unchanged when the LLM output does not validate", async () => {
    const input = orgFix();
    const out = await enrichSchemaFixes(input, snapshot(PAGE), { generate: gen({ garbage: true }) });
    expect(out).toEqual(input);
  });

  it("returns the input unchanged when the generator throws", async () => {
    const input = orgFix();
    const out = await enrichSchemaFixes(input, snapshot(PAGE), {
      generate: async () => {
        throw new Error("LLM down");
      },
    });
    expect(out).toEqual(input);
  });

  it("makes no LLM call when there are no extractable placeholders", async () => {
    let called = false;
    const noPlaceholders: SchemaFix[] = [{ schema: "WebSite", jsonLd: { "@type": "WebSite", name: "Acme" } }];
    const out = await enrichSchemaFixes(noPlaceholders, snapshot(PAGE), {
      generate: async () => {
        called = true;
        return { data: { fills: [] } };
      },
    });
    expect(called).toBe(false);
    expect(out).toEqual(noPlaceholders);
  });
});
