import { describe, expect, it, vi } from "vitest";
import { buildFixArtifact } from "./fix-artifact";
import { buildFixPrompt } from "./fix-prompt";
import type { PsiResult } from "./pagespeed";
import { buildSiteHealth, type SiteHealthInput } from "./site-health";
import type { LlmsTxtResult, PageSnapshot, RobotsResult } from "./types";

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
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
    word_count: 0,
    text_content: "",
    internal_links: [],
    external_links: [],
    images: [],
    structured_data: [],
    has_ssr_content: true,
    security_headers: {},
    errors: [],
    html: "<html><body></body></html>",
    ...overrides,
  };
}

function robots(overrides: Partial<RobotsResult> = {}): RobotsResult {
  return {
    url: "https://acme.example/robots.txt",
    exists: true,
    content: "",
    agent_rules: {},
    ai_crawler_status: {},
    sitemaps: ["https://acme.example/sitemap.xml"],
    errors: [],
    ...overrides,
  };
}

function llms(exists = false): LlmsTxtResult {
  return {
    llms_txt: { url: "https://acme.example/llms.txt", exists, content: exists ? "# Acme\n> Products\n## Docs\n- [Guide](https://acme.example/guide)" : "" },
    llms_full_txt: { url: "https://acme.example/llms-full.txt", exists: false, content: "" },
    errors: [],
  };
}

function psi(overrides: Partial<PsiResult> = {}): PsiResult {
  return {
    strategy: "mobile",
    fetchedAt: new Date().toISOString(),
    scores: { performance: 95, accessibility: 96, bestPractices: 100, seo: 92 },
    fieldData: {
      lcpMs: 1800,
      inpMs: 120,
      cls: 0.02,
      ratings: { lcp: "FAST", inp: "FAST", cls: "FAST" },
    },
    lab: { lcpMs: 1900, cls: 0.01, tbtMs: 50 },
    opportunities: [],
    ...overrides,
  };
}

/** fetchImpl that serves every probe (favicon, og:image) a live image. */
const imageFetch = vi.fn(
  async () => new Response("", { status: 200, headers: { "content-type": "image/png" } }),
) as unknown as typeof fetch;

/** fetchImpl where nothing resolves — every probe 404s. */
const brokenFetch = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;

function input(overrides: Partial<SiteHealthInput> = {}): SiteHealthInput {
  return {
    homepage: snapshot(),
    robots: robots(),
    llms: llms(),
    sitemapPageCount: 12,
    psi: null,
    fetchImpl: imageFetch,
    ...overrides,
  };
}

describe("buildSiteHealth", () => {
  it("maps meta-audit checks to pass/warn/fail and embeds findings on failures", async () => {
    const { snapshot: health } = await buildSiteHealth(input());
    const title = health.checks.find((c) => c.id === "meta.title");
    expect(title?.status).toBe("fail");
    expect(title?.finding?.title).toBe("Missing <title> tag");

    const good = await buildSiteHealth(
      input({
        homepage: snapshot({
          title: "Acme Analytics — product analytics for busy dev teams",
          html: '<html lang="en"><body><p>hello</p></body></html>',
        }),
      }),
    );
    const goodTitle = good.snapshot.checks.find((c) => c.id === "meta.title");
    expect(goodTitle?.status).toBe("pass");
    expect(goodTitle?.finding).toBeUndefined();
  });

  it("summary counts match the checks and pass rows never embed findings", async () => {
    const { snapshot: health } = await buildSiteHealth(input());
    const counted = { pass: 0, warn: 0, fail: 0 };
    for (const c of health.checks) {
      counted[c.status]++;
      if (c.status === "pass") expect(c.finding).toBeUndefined();
    }
    expect(health.summary).toEqual(counted);
  });

  it("uses real PSI data when available and returns performance findings with stable titles", async () => {
    const slowPsi = psi({
      scores: { performance: 38, accessibility: 96, bestPractices: 100, seo: 92 },
      fieldData: {
        lcpMs: 5200,
        inpMs: 640,
        cls: 0.02,
        ratings: { lcp: "SLOW", inp: "AVERAGE", cls: "FAST" },
      },
      opportunities: [
        { id: "render-blocking-resources", title: "Eliminate render-blocking resources", savingsMs: 1200 },
      ],
    });
    const { snapshot: health, findings } = await buildSiteHealth(input({ psi: slowPsi }));

    expect(health.psiAvailable).toBe(true);
    expect(health.scores?.performance).toBe(38);
    expect(health.checks.find((c) => c.id === "psi.performance")?.status).toBe("fail");
    expect(health.checks.find((c) => c.id === "psi.lcp_field")?.status).toBe("fail");
    expect(health.checks.find((c) => c.id === "psi.inp_field")?.status).toBe("warn");
    expect(health.checks.find((c) => c.id === "psi.cls_field")?.status).toBe("pass");

    const perfFinding = findings.find((f) => f.title === "Mobile page speed is below Google's bar");
    expect(perfFinding?.severity).toBe("high");
    expect(perfFinding?.fix_payload).toMatchObject({ kind: "psi_perf", score: 38 });
    expect(findings.some((f) => f.title === "Largest Contentful Paint fails Core Web Vitals")).toBe(true);

    // Titles stay identical across runs with different measurements (dedup key).
    const rerun = await buildSiteHealth(
      input({ psi: psi({ scores: { performance: 44, accessibility: 96, bestPractices: 100, seo: 92 } }) }),
    );
    const rerunTitle = rerun.findings.find((f) => f.category === "performance")?.title;
    expect(rerunTitle).toBe("Mobile page speed is below Google's bar");
  });

  it("falls back to the static CWV estimate without PSI and returns no performance findings", async () => {
    const { snapshot: health, findings } = await buildSiteHealth(input({ psi: null }));
    expect(health.psiAvailable).toBe(false);
    expect(health.scores).toBeNull();
    const estimate = health.checks.find((c) => c.id === "cwv.lcp_estimate");
    expect(estimate?.detail).toContain("static estimate");
    expect(findings.some((f) => f.category === "performance")).toBe(false);
  });

  it("flags missing favicon with a paste-ready payload and passes when it loads", async () => {
    const broken = await buildSiteHealth(input({ fetchImpl: brokenFetch }));
    const failed = broken.snapshot.checks.find((c) => c.id === "social.favicon");
    expect(failed?.status).toBe("fail");
    expect(failed?.finding?.fix_payload).toMatchObject({ kind: "meta_tag", tag: "icon" });
    expect(broken.findings.some((f) => f.category === "favicon")).toBe(true);

    const ok = await buildSiteHealth(input());
    expect(ok.snapshot.checks.find((c) => c.id === "social.favicon")?.status).toBe("pass");
  });

  it("probes og:image reachability and flags brand logo state", async () => {
    const page = snapshot({ meta_tags: { "og:image": "/og.png" } });
    const ok = await buildSiteHealth(input({ homepage: page }));
    expect(ok.snapshot.checks.find((c) => c.id === "social.og_image_reachable")?.status).toBe("pass");
    // og:image exists but no Organization schema → logo is only guessable.
    expect(ok.snapshot.checks.find((c) => c.id === "social.logo")?.status).toBe("warn");

    const broken = await buildSiteHealth(input({ homepage: page, fetchImpl: brokenFetch }));
    expect(broken.snapshot.checks.find((c) => c.id === "social.og_image_reachable")?.status).toBe("fail");
    expect(broken.findings.some((f) => f.title === "Social share image does not load")).toBe(true);

    const withSchema = await buildSiteHealth(
      input({
        homepage: snapshot({
          structured_data: [
            { "@type": "Organization", name: "Acme", logo: "https://acme.example/logo.png" },
          ],
        }),
      }),
    );
    expect(withSchema.snapshot.checks.find((c) => c.id === "social.logo")?.status).toBe("pass");
    expect(withSchema.findings.some((f) => f.category === "brand_assets")).toBe(false);
  });

  it("fails an empty referenced sitemap and reports blocked AI crawlers", async () => {
    const { snapshot: health, findings } = await buildSiteHealth(
      input({
        sitemapPageCount: 0,
        robots: robots({ ai_crawler_status: { GPTBot: "BLOCKED", ClaudeBot: "ALLOWED" } }),
      }),
    );
    expect(health.checks.find((c) => c.id === "crawlers.sitemap_pages")?.status).toBe("fail");
    expect(findings.some((f) => f.category === "sitemap")).toBe(true);

    const aiAccess = health.checks.find((c) => c.id === "crawlers.ai_access");
    expect(aiAccess?.status).toBe("fail");
    expect(aiAccess?.detail).toContain("GPTBot");
    expect(aiAccess?.finding).toBeDefined();
  });

  it("reports llms.txt and structured data state with embedded (not returned) findings", async () => {
    const { snapshot: health, findings } = await buildSiteHealth(input());
    const llmsCheck = health.checks.find((c) => c.id === "ai.llms_txt");
    expect(llmsCheck?.status).toBe("fail");
    expect(llmsCheck?.finding?.title).toBe("Missing llms.txt");
    // Embedded only — llms/schema queue rows are owned by their analyzers/tools.
    expect(findings.some((f) => f.category === "llms_txt")).toBe(false);

    const schemaCheck = health.checks.find((c) => c.id === "schema.present");
    expect(schemaCheck?.status).toBe("fail");
    expect(schemaCheck?.finding).toBeDefined();
    expect(findings.some((f) => f.category === "schema")).toBe(false);
  });
});

describe("psi_perf fix artifact + prompt", () => {
  const payload = {
    kind: "psi_perf",
    score: 38,
    opportunities: [
      {
        id: "render-blocking-resources",
        title: "Eliminate render-blocking resources",
        displayValue: "Potential savings of 1,200 ms",
      },
      { id: "unsized-images", title: "Unsized images", savingsMs: 300 },
    ],
  };

  it("renders the opportunity list as a snippet", () => {
    const artifact = buildFixArtifact(payload);
    expect(artifact.kind).toBe("psi_perf");
    expect(artifact.content).toBe(
      "- Eliminate render-blocking resources (Potential savings of 1,200 ms)\n- Unsized images (~300ms savings)",
    );
  });

  it("builds a prompt embedding the measured issues and a placement hint", () => {
    const prompt = buildFixPrompt(
      {
        pillar: "seo",
        category: "performance",
        severity: "high",
        title: "Mobile page speed is below Google's bar",
        recommendation: "Lighthouse scores your page 38/100.",
        fixPayload: payload,
      },
      "https://acme.example",
    );
    expect(prompt).toContain("Eliminate render-blocking resources");
    expect(prompt).toContain("page-level performance fixes");
    expect(prompt).toContain("Website: https://acme.example");
  });

  it("emits an icon link for the favicon payload", () => {
    const artifact = buildFixArtifact({ kind: "meta_tag", tag: "icon", suggested: "/favicon.ico" });
    expect(artifact.content).toBe('<link rel="icon" href="/favicon.ico" sizes="any" />');
  });
});
