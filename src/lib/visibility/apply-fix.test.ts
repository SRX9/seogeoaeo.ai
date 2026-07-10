import { describe, expect, it } from "vitest";
import { buildFixArtifact } from "./apply-fix";

describe("buildFixArtifact", () => {
  it("wraps a schema fix as a copy-paste <script> snippet", () => {
    const a = buildFixArtifact({ kind: "schema", schema: "Organization", jsonLd: { "@type": "Organization", name: "Acme" } });
    expect(a.mode).toBe("snippet");
    expect(a.content).toContain('application/ld+json');
    expect(a.content).toContain('"@type": "Organization"');
    expect(a.instructions.toLowerCase()).toContain("paste");
    expect(a.instructions.toLowerCase()).not.toContain("insert it for you");
  });

  it("emits llms.txt and robots.txt as downloadable files", () => {
    const llms = buildFixArtifact({ kind: "llms_txt", llms_txt: "# Acme\n> desc" });
    expect(llms.mode).toBe("file");
    expect(llms.filename).toBe("llms.txt");
    expect(llms.content).toContain("# Acme");

    const robots = buildFixArtifact({ kind: "robots_txt", content: "User-agent: *\nAllow: /" });
    expect(robots.filename).toBe("robots.txt");
  });

  it("applies an answer-block rewrite directly", () => {
    const a = buildFixArtifact({ kind: "answer_block", rewrite: "A better, citable answer." });
    expect(a.mode).toBe("apply");
    expect(a.content).toBe("A better, citable answer.");
  });

  it("builds meta tag snippets from a suggested value", () => {
    expect(buildFixArtifact({ kind: "meta_tag", tag: "title", suggested: "Great title" }).content).toBe("<title>Great title</title>");
    const og = buildFixArtifact({ kind: "meta_tags", suggested: { "og:title": "T", "og:type": "website" } });
    expect(og.content).toContain('property="og:title"');
  });

  it("falls back to guidance for non-mechanical fixes", () => {
    expect(buildFixArtifact({ kind: "answer_gap" }).mode).toBe("snippet");
    expect(buildFixArtifact(null).content).toBe("");
  });
});
