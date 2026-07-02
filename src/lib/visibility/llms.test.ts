import { describe, expect, it } from "vitest";
import { fetchLlmsTxt, generateLlmsTxt, validateLlmsTxt } from "./llms";

describe("fetchLlmsTxt", () => {
  it("records existence + raw content for both files", async () => {
    const result = await fetchLlmsTxt("https://acme.example/page", {
      fetchImpl: async (input) =>
        String(input).endsWith("/llms.txt")
          ? new Response("# Acme\n> Product analytics", { status: 200 })
          : new Response("nope", { status: 404 }),
    });
    expect(result.llms_txt).toEqual({
      url: "https://acme.example/llms.txt",
      exists: true,
      content: "# Acme\n> Product analytics",
    });
    expect(result.llms_full_txt.exists).toBe(false);
    expect(result.llms_full_txt.content).toBe("");
    expect(result.errors).toEqual([]);
  });

  it("collects fetch errors without throwing", async () => {
    const result = await fetchLlmsTxt("https://acme.example/", {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(result.llms_txt.exists).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("network down");
  });
});

const VALID_LLMS = `# Acme
> Product analytics for developers

## Main Pages
- [Pricing](https://acme.example/pricing)
- [Features](https://acme.example/features)
- [Docs](https://acme.example/docs)

## Resources & Blog
- [Blog](https://acme.example/blog)
- [Guides](https://acme.example/guides)

## Company
- [About](https://acme.example/about)
- [Contact](https://acme.example/contact)
- [Careers](https://acme.example/careers)
- [Press](https://acme.example/press)
- [Partners](https://acme.example/partners)
`;

function llmsFetch(llmsBody: string | null, fullExists = false): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.endsWith("/llms.txt")) {
      return llmsBody === null
        ? new Response("nope", { status: 404 })
        : new Response(llmsBody, { status: 200 });
    }
    return new Response(fullExists ? "full" : "nope", { status: fullExists ? 200 : 404 });
  };
}

describe("validateLlmsTxt", () => {
  it("validates a well-formed file and scores the 70 band", async () => {
    const result = await validateLlmsTxt("https://acme.example/", {
      fetchImpl: llmsFetch(VALID_LLMS),
    });
    expect(result.format_valid).toBe(true);
    expect(result.section_count).toBe(3);
    expect(result.link_count).toBe(10);
    expect(result.issues).toEqual([]);
    expect(result.score).toBe(70);
    // covers Contact + about → only completeness suggestions remain none
    expect(result.suggestions).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("scores 90 when comprehensive and llms-full.txt exists", async () => {
    const result = await validateLlmsTxt("https://acme.example/", {
      fetchImpl: llmsFetch(VALID_LLMS, true),
    });
    expect(result.full_version.exists).toBe(true);
    expect(result.score).toBe(90);
  });

  it("scores 30 and flags each missing element when malformed", async () => {
    const result = await validateLlmsTxt("https://acme.example/", {
      fetchImpl: llmsFetch("just some text\nno structure here"),
    });
    expect(result.format_valid).toBe(false);
    expect(result.score).toBe(30);
    expect(result.issues).toEqual([
      "Missing title (should start with '# Site Name')",
      "Missing description (use '> Brief description')",
      "No sections found (use '## Section Name')",
      "No page links found (use '- [Page Title](url): Description')",
    ]);
    expect(result.findings[0]?.title).toBe("llms.txt is malformed");
  });

  it("scores 50 for valid but minimal content, with suggestions", async () => {
    const minimal = "# Acme\n> Analytics\n\n## Links\n- [Pricing](https://acme.example/pricing)\n";
    const result = await validateLlmsTxt("https://acme.example/", {
      fetchImpl: llmsFetch(minimal),
    });
    expect(result.format_valid).toBe(true);
    expect(result.score).toBe(50);
    expect(result.suggestions).toContain("Consider adding more key pages (aim for 10-20)");
    expect(result.suggestions).toContain("Add more sections to organize content types");
  });

  it("scores 0 with a high-severity finding when absent", async () => {
    const result = await validateLlmsTxt("https://acme.example/", {
      fetchImpl: llmsFetch(null),
    });
    expect(result.exists).toBe(false);
    expect(result.score).toBe(0);
    expect(result.findings[0]).toMatchObject({ severity: "high", title: "No llms.txt found" });
  });
});

const HOMEPAGE_HTML = `<!doctype html><html><head>
<title>Acme | Product Analytics</title>
<meta name="description" content="Product analytics for developers.">
</head><body>
<a href="/pricing">Pricing</a>
<a href="/blog">Blog</a>
<a href="/about">About us</a>
<a href="/help">Help center</a>
<a href="/customers">Customers</a>
<a href="https://twitter.com/acme">Twitter</a>
<a href="/logo.png">Logo</a>
<a href="/pricing">Pricing again</a>
</body></html>`;

describe("generateLlmsTxt", () => {
  it("buckets pages, skips assets/cross-origin/dupes, and emits both files", async () => {
    const result = await generateLlmsTxt("https://acme.example/", {
      homepageHtml: HOMEPAGE_HTML,
      fetchImpl: async () =>
        new Response('<head><meta name="description" content="Page desc."></head>', {
          status: 200,
        }),
    });
    expect(result.sections).toMatchObject({
      "Products & Services": 1,
      "Resources & Blog": 1,
      Company: 1,
      Support: 1,
      "Main Pages": 1, // /customers
    });
    expect(result.pages_analyzed).toBe(5);
    expect(result.llms_txt).toContain("# Acme");
    expect(result.llms_txt).toContain("> Product analytics for developers.");
    expect(result.llms_txt).toContain("- [Pricing](https://acme.example/pricing)");
    expect(result.llms_txt).not.toContain("twitter.com");
    expect(result.llms_txt).not.toContain("logo.png");
    expect(result.llms_txt).toContain("## Contact");
    // full version carries fetched per-page descriptions
    expect(result.llms_full_txt).toContain("(https://acme.example/pricing): Page desc.");
    expect(result.finding?.fix_payload).toMatchObject({ kind: "llms_txt" });
  });

  it("skips per-page fetches when includeFull is false", async () => {
    let fetches = 0;
    const result = await generateLlmsTxt("https://acme.example/", {
      homepageHtml: HOMEPAGE_HTML,
      includeFull: false,
      fetchImpl: async () => {
        fetches++;
        return new Response("", { status: 200 });
      },
    });
    expect(fetches).toBe(0);
    expect(result.llms_full_txt).toContain("- [Pricing](https://acme.example/pricing)");
    expect(result.llms_full_txt).not.toContain("Page desc.");
  });
});
