/**
 * End-to-end tests for the weekly automation pipeline.
 *
 * Drives the real `runWeeklyPipelineForWorkspace` (research -> write up to cap ->
 * optional auto-publish) against the in-memory temp store. The research step is
 * mocked to declare how many topics it "created"; the pending topics it would
 * have produced are seeded directly so the writing loop has work to do.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/research/run", async () => (await import("./helpers/memory-store")).researchRun);

import { runWeeklyPipelineForWorkspace } from "@/lib/jobs/weekly";
import {
  countersFor,
  jobsFor,
  publicationsFor,
  research,
  resetStore,
  seedIntegration,
  seedTopic,
  seedWorkspace,
  setCredits,
  store,
} from "./helpers/memory-store";

beforeEach(() => {
  resetStore();
});

describe("weekly pipeline workflow", () => {
  it("runs research then generates an article for each pending, scored topic", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    research.topicsCreated = 3;
    seedTopic({ workspaceId: "ws-1", status: "pending", score: 90, title: "Topic A" });
    seedTopic({ workspaceId: "ws-1", status: "pending", score: 70, title: "Topic B" });
    // Not eligible: unscored topic must be ignored by the writing step.
    seedTopic({ workspaceId: "ws-1", status: "pending", score: null, title: "Unscored" });

    const result = await runWeeklyPipelineForWorkspace("ws-1");

    expect(result).toEqual({ generated: 2, researchTopics: 3, brands: 1 });
    expect(store.articles.size).toBe(2);
    expect([...store.articles.values()].every((a) => a.status === "draft")).toBe(true);

    const job = jobsFor("ws-1", "weekly_pipeline")[0];
    expect(job.status).toBe("completed");
    const metadata = JSON.parse(job.metadataJson ?? "{}");
    expect(metadata.researchTopics).toBe(3);
    expect(metadata.generatedArticleIds).toHaveLength(2);
    expect(metadata.skippedTopicIds).toHaveLength(0);

    // Durable usage counters track the agent's output. REVIEW mode writes but
    // does not publish, so only the generated tally moves.
    expect(countersFor("ws-1")).toEqual({ generated: 2, published: 0 });
  });

  it("processes the highest-scoring topics first", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    // Enough for research (20) + a single article (100), so only the top topic
    // is affordable.
    setCredits("ws-1", 150);
    seedTopic({ workspaceId: "ws-1", status: "pending", score: 10, title: "Low" });
    seedTopic({ workspaceId: "ws-1", status: "pending", score: 99, title: "High" });

    await runWeeklyPipelineForWorkspace("ws-1");

    const [article] = [...store.articles.values()];
    expect(store.articles.size).toBe(1);
    expect(article.topicId).toBe(
      [...store.topics.values()].find((t) => t.title === "High")?.id,
    );
  });

  it("stops generating when credits run out mid-run", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    // Research (20) + one article (100) fits; the second article does not.
    setCredits("ws-1", 150);
    const first = seedTopic({ workspaceId: "ws-1", status: "pending", score: 90, title: "First" });
    const second = seedTopic({ workspaceId: "ws-1", status: "pending", score: 80, title: "Second" });

    const result = await runWeeklyPipelineForWorkspace("ws-1");

    expect(result.generated).toBe(1);
    expect(store.usage.get("ws-1")).toBe(30); // 150 - 20 research - 100 article
    expect(store.topics.get(first.id)?.status).toBe("completed");
    // Credits are checked before generation starts, so the skipped topic is left
    // untouched ("pending") for a future run rather than marked "failed".
    expect(store.topics.get(second.id)?.status).toBe("pending");

    const job = jobsFor("ws-1", "weekly_pipeline")[0];
    const metadata = JSON.parse(job.metadataJson ?? "{}");
    expect(metadata.generatedArticleIds).toHaveLength(1);
    expect(metadata.skippedTopicIds).toContain(second.id);
  });

  it("auto-publishes generated articles in FULL_AUTO mode", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "FULL_AUTO" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });
    seedTopic({ workspaceId: "ws-1", status: "pending", score: 88, title: "Publish me" });

    const result = await runWeeklyPipelineForWorkspace("ws-1");

    expect(result.generated).toBe(1);
    const [article] = [...store.articles.values()];
    expect(article.status).toBe("approved");

    const publications = publicationsFor("ws-1", article.id);
    expect(publications).toHaveLength(1);
    expect(publications[0].status).toBe("published");
    expect(publications[0].externalUrl).toContain(`/api/articles/${article.id}/export`);

    // FULL_AUTO writes and publishes, so both counters advance.
    expect(countersFor("ws-1")).toEqual({ generated: 1, published: 1 });
  });

  it("fails the pipeline job when the research step throws", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    research.fail = true;

    await expect(runWeeklyPipelineForWorkspace("ws-1")).rejects.toThrow("Research step failed");

    const job = jobsFor("ws-1", "weekly_pipeline")[0];
    expect(job.status).toBe("failed");
    expect(store.articles.size).toBe(0);
  });
});
