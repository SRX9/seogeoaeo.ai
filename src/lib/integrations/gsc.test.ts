import { describe, expect, it, vi } from "vitest";
import { fetchGscQueries } from "./gsc";

const gscResponse = (rows: unknown[]) =>
  new Response(JSON.stringify({ rows }), { status: 200 });

describe("fetchGscQueries", () => {
  it("requests query+page dimensions over a 28-day window and parses rows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      gscResponse([
        { keys: ["best invoicing", "https://example.com/a"], clicks: 12.4, impressions: 480.9, position: 14.2 },
        { keys: ["", "https://example.com/b"], clicks: 1, impressions: 10, position: 5 }, // dropped: no query
      ]),
    );

    const rows = await fetchGscQueries("https://example.com/", "token", { fetchImpl });

    expect(rows).toEqual([
      { query: "best invoicing", page: "https://example.com/a", clicks: 12, impressions: 481, position: 14.2 },
    ]);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("searchAnalytics/query");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.dimensions).toEqual(["query", "page"]);
    const windowDays =
      (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / 86_400_000;
    expect(windowDays).toBe(27); // start = 28 days ago, end = yesterday
  });

  it("throws on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(fetchGscQueries("https://example.com/", "token", { fetchImpl })).rejects.toThrow(
      "403",
    );
  });
});
