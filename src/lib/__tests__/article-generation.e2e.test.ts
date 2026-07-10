/**
 * End-to-end tests for the article generation + publishing workflow.
 *
 * The real orchestration (`generateArticleFromTopic`, `publishArticleToDestinations`)
 * runs unchanged; only the data/IO seams are swapped for an in-memory temp store
 * (see ./helpers/memory-store). Each `vi.mock` factory returns the matching mock
 * object from that singleton store, so seeding in the test body and reading back
 * in the orchestration share the same live data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => (await import("./helpers/memory-store")).dbMock);
vi.mock("@/lib/articles/repository", async () => (await import("./helpers/memory-store")).articlesRepo);
vi.mock("@/lib/brand/repository", async () => (await import("./helpers/memory-store")).brandRepo);
vi.mock("@/lib/jobs/repository", async () => (await import("./helpers/memory-store")).jobsRepo);
vi.mock("@/lib/usage/credits", async () => (await import("./helpers/memory-store")).creditsRepo);
vi.mock("@/lib/workspace", async () => (await import("./helpers/memory-store")).workspaceRepo);
vi.mock("@/lib/llm/client", async () => (await import("./helpers/memory-store")).llmClient);
vi.mock("@/lib/integrations/repository", async () => (await import("./helpers/memory-store")).integrationsRepo);
vi.mock("@/lib/publishing/repository", async () => (await import("./helpers/memory-store")).publishingRepo);
vi.mock("@/lib/billing/access", async () => (await import("./helpers/memory-store")).billingAccess);
vi.mock("@/lib/agent/memory", async () => (await import("./helpers/memory-store")).agentMemoryRepo);
vi.mock("@/lib/agent/events", async () => (await import("./helpers/memory-store")).agentEventsRepo);

import { generateArticleFromTopic } from "@/lib/articles/generate";
import { publishArticleToDestinations } from "@/lib/publishing/publish";
import {
  jobsFor,
  llm,
  publicationsFor,
  resetStore,
  seedArticle,
  seedIntegration,
  seedTopic,
  seedWorkspace,
  setCredits,
  store,
} from "./helpers/memory-store";

// In tests a workspace has a single brand whose id equals the workspace id.
const scope = { workspaceId: "ws-1", brandId: "ws-1" };

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("article generation workflow", () => {
  it("REVIEW mode generates a draft, completes the topic and job, and does not publish", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    const topic = seedTopic({ workspaceId: "ws-1", title: "Automating SEO" });

    const { article, trace } = await generateArticleFromTopic(scope,topic.id);

    expect(article.status).toBe("draft");
    expect(article.bodyMarkdown).toContain("# Final Article");
    expect(article.bodyMarkdown).toContain("SEO-polished body content.");
    expect(store.topics.get(topic.id)?.status).toBe("completed");

    const jobs = jobsFor("ws-1", "writing");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("completed");

    // Started at 1000, generating one article costs 100 credits.
    expect(store.usage.get("ws-1")).toBe(900);
    expect(publicationsFor("ws-1", article.id)).toHaveLength(0);

    expect(trace).toEqual({
      summaryModel: "model-light",
      outlineModel: "model-heavy",
      draftModel: "model-heavy",
      seoEditModel: "model-heavy",
      metadataModel: "model-light",
      shape: "direct-answer", // "Automating SEO" has no tutorial/comparison cue
      rewritePasses: 0, // the fixture body is lint-clean
    });
  });

  it("FULL_AUTO mode generates an approved article and auto-publishes to enabled destinations", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "FULL_AUTO" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });
    const topic = seedTopic({ workspaceId: "ws-1" });

    const { article } = await generateArticleFromTopic(scope,topic.id, {
      origin: "https://app.test",
    });

    expect(article.status).toBe("approved");

    const publications = publicationsFor("ws-1", article.id);
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      provider: "markdown_export",
      status: "published",
      externalUrl: `https://app.test/api/articles/${article.id}/export`,
      attemptCount: 1,
    });
    expect(publications[0].publishedAt).toBeInstanceOf(Date);
  });

  it("FULL_AUTO succeeds even when there are no enabled destinations (publish error is swallowed)", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "FULL_AUTO" });
    const topic = seedTopic({ workspaceId: "ws-1" });

    const { article } = await generateArticleFromTopic(scope,topic.id, {
      origin: "https://app.test",
    });

    expect(article.status).toBe("approved");
    expect(publicationsFor("ws-1", article.id)).toHaveLength(0);
    expect(jobsFor("ws-1", "writing")[0].status).toBe("completed");
  });

  it("rewrites a sloppy draft once and still auto-publishes when the fix lands", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "FULL_AUTO" });
    const topic = seedTopic({ workspaceId: "ws-1", title: "Automating SEO" });
    const clean = llm.textResponses[3];
    // Call 4 (SEO edit) returns slop; call 5 (the targeted rewrite) fixes it.
    llm.textResponses[3] =
      "# Final Article\n\nIn today's fast-paced digital landscape, let's dive in and delve into SEO.";
    llm.textResponses[4] = clean;

    const { article, trace } = await generateArticleFromTopic(scope, topic.id, {
      origin: "https://app.test",
    });

    expect(trace?.rewritePasses).toBe(1);
    expect(article.status).toBe("approved");
    expect(article.bodyMarkdown).toContain("SEO-polished body content.");
    const gates = JSON.parse(article.gateResultsJson ?? "[]");
    expect(gates).toContainEqual(
      expect.objectContaining({ gate: "style-lint", passed: true }),
    );
  });

  it("holds a persistently sloppy draft for review instead of publishing, even in FULL_AUTO", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "FULL_AUTO" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });
    const topic = seedTopic({ workspaceId: "ws-1", title: "Automating SEO" });
    const slop =
      "# Final Article\n\nIn today's fast-paced digital landscape, let's dive in and delve into SEO.";
    // The SEO edit and both rewrite passes all return the same slop.
    llm.textResponses[3] = slop;
    llm.textResponses[4] = slop;
    llm.textResponses[5] = slop;

    const { article, trace } = await generateArticleFromTopic(scope, topic.id, {
      origin: "https://app.test",
    });

    expect(trace?.rewritePasses).toBe(2);
    expect(article.status).toBe("draft"); // gate failure overrides FULL_AUTO
    expect(publicationsFor("ws-1", article.id)).toHaveLength(0);
    const gates = JSON.parse(article.gateResultsJson ?? "[]");
    expect(gates).toContainEqual(
      expect.objectContaining({ gate: "style-lint", passed: false }),
    );
  });

  it("throws when the topic does not exist", async () => {
    seedWorkspace({ id: "ws-1" });

    await expect(generateArticleFromTopic(scope,"missing")).rejects.toThrow(
      "Topic not found",
    );
    expect(jobsFor("ws-1")).toHaveLength(0);
  });

  it("is idempotent — returns the existing article without re-running the LLM", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    const topic = seedTopic({ workspaceId: "ws-1" });
    const existing = seedArticle({ workspaceId: "ws-1", topicId: topic.id, title: "Already written" });
    llm.failTextOnCall = 1; // would throw if the LLM were invoked

    const { article, trace } = await generateArticleFromTopic(scope,topic.id);

    expect(article.id).toBe(existing.id);
    expect(trace).toBeNull();
    expect(llm.textCalls).toBe(0);
    expect(jobsFor("ws-1")).toHaveLength(0);
    // Idempotent re-run charges nothing — balance stays at the seeded 1000.
    expect(store.usage.get("ws-1") ?? 0).toBe(1000);
  });

  it("enforces the credit balance before doing any work", async () => {
    seedWorkspace({ id: "ws-1" });
    const topic = seedTopic({ workspaceId: "ws-1" });
    setCredits("ws-1", 50); // below the 100-credit article cost

    await expect(
      generateArticleFromTopic(scope,topic.id),
    ).rejects.toMatchObject({ name: "InsufficientCreditsError" });

    expect(store.topics.get(topic.id)?.status).toBe("pending");
    expect(jobsFor("ws-1")).toHaveLength(0);
    expect(store.usage.get("ws-1")).toBe(50);
    expect(store.articles.size).toBe(0);
    expect(llm.textCalls).toBe(0);
  });

  it("marks the topic and job failed when the LLM fails mid-pipeline", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    const topic = seedTopic({ workspaceId: "ws-1" });
    llm.failTextOnCall = 3; // fail on the draft step

    await expect(generateArticleFromTopic(scope,topic.id)).rejects.toThrow(
      "generateText failed on call 3",
    );

    expect(store.topics.get(topic.id)?.status).toBe("failed");
    const jobs = jobsFor("ws-1", "writing");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("failed");
    expect(store.articles.size).toBe(0);
    // A failed generation must not charge credits — balance unchanged.
    expect(store.usage.get("ws-1") ?? 0).toBe(1000);
  });

  it("accumulates token usage across every model call", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    const topic = seedTopic({ workspaceId: "ws-1" });

    await generateArticleFromTopic(scope,topic.id);

    const job = jobsFor("ws-1", "writing")[0];
    const metadata = JSON.parse(job.metadataJson ?? "{}");
    // 4 text calls * 30 tokens + 1 json call * 10 tokens = 130, across 5 calls.
    expect(metadata.tokenUsage.totalTokens).toBe(130);
    expect(metadata.tokenUsage.calls).toBe(5);
    expect(metadata.tokenUsage.byModel["model-heavy"]).toBe(90);
    expect(metadata.tokenUsage.byModel["model-light"]).toBe(40);
  });

  it("falls back to the topic title and a derived slug when metadata is incomplete", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    const topic = seedTopic({ workspaceId: "ws-1", title: "My Great Topic Title" });
    llm.metadata = { title: "", slug: "", metaDescription: "Desc", tags: [] };

    const { article } = await generateArticleFromTopic(scope,topic.id);

    expect(article.title).toBe("My Great Topic Title");
    expect(article.slug).toBe("my-great-topic-title");
  });

  it("skipCreditCheck bypasses the credit assert and spend", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    const topic = seedTopic({ workspaceId: "ws-1" });
    setCredits("ws-1", 50); // below cost, but the check is skipped

    const { article } = await generateArticleFromTopic(scope,topic.id, { skipCreditCheck: true });

    expect(article.status).toBe("draft");
    expect(store.usage.get("ws-1")).toBe(50); // unchanged
  });
});

describe("publishing workflow", () => {
  it("publishes an approved article to every enabled destination", async () => {
    seedWorkspace({ id: "ws-1" });
    const article = seedArticle({ workspaceId: "ws-1", status: "approved" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });
    seedIntegration("ws-1", {
      provider: "webhook",
      enabled: true,
      config: { webhookUrl: "https://hooks.test/post" },
      apiKey: "secret-token",
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await publishArticleToDestinations(scope,article.id, "https://app.test");

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.result.ok)).toBe(true);

    const publications = publicationsFor("ws-1", article.id);
    expect(publications).toHaveLength(2);
    expect(publications.every((p) => p.status === "published")).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.test/post",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer secret-token" }),
      }),
    );
  });

  it("refuses to publish a non-approved article", async () => {
    seedWorkspace({ id: "ws-1" });
    const article = seedArticle({ workspaceId: "ws-1", status: "draft" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });

    await expect(publishArticleToDestinations(scope,article.id, "https://app.test")).rejects.toThrow(
      "Only approved articles can be published",
    );
  });

  it("records a failed publication when a destination errors, without throwing", async () => {
    seedWorkspace({ id: "ws-1" });
    const article = seedArticle({ workspaceId: "ws-1", status: "approved" });
    seedIntegration("ws-1", {
      provider: "webhook",
      enabled: true,
      config: { webhookUrl: "https://hooks.test/post" },
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await publishArticleToDestinations(scope,article.id, "https://app.test");

    expect(results).toHaveLength(1);
    expect(results[0].result.ok).toBe(false);

    const [publication] = publicationsFor("ws-1", article.id);
    expect(publication.status).toBe("failed");
    expect(publication.errorMessage).toContain("500");
    expect(publication.attemptCount).toBe(1);
  });

  it("increments the attempt count when re-publishing changed content", async () => {
    seedWorkspace({ id: "ws-1" });
    const article = seedArticle({ workspaceId: "ws-1", status: "approved" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });

    await publishArticleToDestinations(scope,article.id, "https://app.test");
    // Simulate an edit so the content fingerprint changes between publishes.
    article.bodyMarkdown = "# Body\n\nEdited content.";
    await publishArticleToDestinations(scope,article.id, "https://app.test");

    const [publication] = publicationsFor("ws-1", article.id);
    expect(publication.attemptCount).toBe(2);
    expect(publication.status).toBe("published");
  });

  it("skips a destination when content is unchanged since the last publish", async () => {
    seedWorkspace({ id: "ws-1" });
    const article = seedArticle({ workspaceId: "ws-1", status: "approved" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });

    await publishArticleToDestinations(scope,article.id, "https://app.test");
    const second = await publishArticleToDestinations(scope,article.id, "https://app.test");

    expect(second).toHaveLength(1);
    expect(second[0].result.skipped).toBe(true);
    expect(second[0].result.ok).toBe(true);

    // The skipped re-publish must not bump the attempt count.
    const [publication] = publicationsFor("ws-1", article.id);
    expect(publication.attemptCount).toBe(1);
    expect(publication.status).toBe("published");
  });

  it("throws when there are no enabled destinations", async () => {
    seedWorkspace({ id: "ws-1" });
    const article = seedArticle({ workspaceId: "ws-1", status: "approved" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: false });

    await expect(publishArticleToDestinations(scope,article.id, "https://app.test")).rejects.toThrow(
      "No enabled publishing destinations",
    );
  });
});
