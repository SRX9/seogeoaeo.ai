import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchPage } from "./fetch-page";

const FIXTURES = path.resolve(__dirname, "../../../test/fixtures/visibility");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
    ...init,
  });
}

function mockFetch(handler: (url: string) => Response): typeof fetch {
  return async (input) => handler(String(input));
}

describe("fetchPage", () => {
  it("parses an SSR page: meta, headings, links, images, JSON-LD", async () => {
    const snap = await fetchPage("https://acme.example/", {
      fetchImpl: mockFetch(() =>
        htmlResponse(fixture("ssr-page.html"), {
          headers: {
            "Content-Type": "text/html",
            "Strict-Transport-Security": "max-age=63072000",
            "X-Frame-Options": "DENY",
          },
        }),
      ),
    });

    expect(snap.status_code).toBe(200);
    expect(snap.title).toBe("Acme Analytics: Product Analytics for SaaS Teams");
    expect(snap.description).toContain("Acme Analytics helps SaaS teams");
    expect(snap.meta_tags["og:title"]).toBe("Acme Analytics");
    expect(snap.canonical).toBe("https://acme.example/");
    expect(snap.h1_tags).toEqual(["Product analytics your whole team can use"]);
    expect(snap.heading_structure).toHaveLength(3);
    expect(snap.heading_structure[1]).toEqual({
      level: 2,
      text: "Dashboards that answer questions",
    });
    // 2 valid JSON-LD blocks; the invalid one lands in errors
    expect(snap.structured_data).toHaveLength(2);
    expect(snap.errors).toContain("Invalid JSON-LD detected");
    // links extracted after nav/footer/header strip, matching the Python port
    expect(snap.internal_links).toEqual([
      { url: "https://acme.example/signup", text: "Start free trial" },
    ]);
    expect(snap.external_links).toEqual([
      { url: "https://github.com/acme/sdk", text: "GitHub SDK" },
    ]);
    expect(snap.images).toHaveLength(2);
    expect(snap.images[0]).toEqual({
      src: "/img/dashboard.png",
      alt: "Acme dashboard screenshot",
      width: "1200",
      height: "800",
      loading: "lazy",
    });
    expect(snap.word_count).toBeGreaterThan(200);
    expect(snap.has_ssr_content).toBe(true);
    expect(snap.security_headers["Strict-Transport-Security"]).toBe("max-age=63072000");
    expect(snap.security_headers["Content-Security-Policy"]).toBeNull();
  });

  it("flags a CSR SPA shell as not server-rendered", async () => {
    const snap = await fetchPage("https://spa.example/", {
      fetchImpl: mockFetch(() => htmlResponse(fixture("csr-shell.html"))),
    });
    expect(snap.has_ssr_content).toBe(false);
    expect(snap.errors.some((e) => e.includes("client-side only rendering"))).toBe(true);
  });

  it("does not flag a content-rich page with an empty framework-style root", async () => {
    const snap = await fetchPage("https://workshop.example/standing-desk-guide/", {
      fetchImpl: mockFetch(() => htmlResponse(fixture("wordpress.html"))),
    });
    expect(snap.word_count).toBeGreaterThan(200);
    expect(snap.has_ssr_content).toBe(true);
  });

  it("static heuristic MISSES an app shell padded with boilerplate (the render check catches it)", async () => {
    // >200 words of skeleton/cookie text in the body keeps the word-count guard
    // from firing even though #root is empty: this is the blind spot the v3
    // rendered-vs-raw comparison (render.ts) exists to close.
    const snap = await fetchPage("https://shell.example/", {
      fetchImpl: mockFetch(() => htmlResponse(fixture("app-shell-boilerplate.html"))),
    });
    expect(snap.word_count).toBeGreaterThan(200);
    expect(snap.has_ssr_content).toBe(true); // heuristic is fooled: render.ts is the fix
  });

  it("records the redirect chain", async () => {
    const snap = await fetchPage("http://acme.example/", {
      fetchImpl: mockFetch((url) => {
        if (url === "http://acme.example/") {
          return new Response(null, {
            status: 301,
            headers: { Location: "https://acme.example/" },
          });
        }
        return htmlResponse(fixture("ssr-page.html"));
      }),
    });
    expect(snap.redirect_chain).toEqual([
      { url: "http://acme.example/", status: 301 },
    ]);
    expect(snap.status_code).toBe(200);
    expect(snap.title).toContain("Acme Analytics");
  });

  it("revalidates a redirect and blocks private destinations", async () => {
    let calls = 0;
    const snap = await fetchPage("https://acme.example/", {
      resolveHostname: async () => ["8.8.8.8"],
      fetchImpl: mockFetch(() => {
        calls += 1;
        return new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/admin" },
        });
      }),
    });
    expect(calls).toBe(1);
    expect(snap.errors[0]).toContain("Blocked crawler destination");
  });

  it("rejects non-http(s) schemes without fetching", async () => {
    const snap = await fetchPage("ftp://acme.example/file");
    expect(snap.status_code).toBeNull();
    expect(snap.errors[0]).toContain("Unsupported URL scheme");
  });

  it("times out and reports the timeout as an error", async () => {
    const never: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    const snap = await fetchPage("https://slow.example/", {
      timeoutMs: 50,
      fetchImpl: never,
    });
    expect(snap.errors[0]).toContain("Timeout after 0.05 seconds");
  });
});
