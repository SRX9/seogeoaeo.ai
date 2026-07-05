/**
 * End-to-end tests for the daily content agent.
 *
 * The agent now runs as a Cloudflare Workflow whose steps call the decomposed
 * pipeline functions (`planDailyForBrand` -> `researchForDaily` -> per-article
 * `generateArticleFromTopic` -> `settleDailyForBrand`). `runDaily` below composes
 * them exactly as `DailyBrandWorkflow.run` does, so these tests exercise the real
 * step logic against the in-memory store. Research is mocked (it declares how many
 * topics it "created" without seeding them — pending topics are seeded directly),
 * and the out-of-credits email is mocked so we can assert it fires on pause.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => (await import("./helpers/memory-store")).dbMock);
vi.mock("@/lib/articles/repository", async () => (await import("./helpers/memory-store")).articlesRepo);
vi.mock("@/lib/brand/repository", async () => (await import("./helpers/memory-store")).brandRepo);
vi.mock("@/lib/jobs/repository", async () => (await import("./helpers/memory-store")).jobsRepo);
vi.mock("@/lib/jobs/daily-repository", async () => (await import("./helpers/memory-store")).dailyRepo);
vi.mock("@/lib/usage/credits", async () => (await import("./helpers/memory-store")).creditsRepo);
vi.mock("@/lib/workspace", async () => (await import("./helpers/memory-store")).workspaceRepo);
vi.mock("@/lib/llm/client", async () => (await import("./helpers/memory-store")).llmClient);
vi.mock("@/lib/integrations/repository", async () => (await import("./helpers/memory-store")).integrationsRepo);
vi.mock("@/lib/publishing/repository", async () => (await import("./helpers/memory-store")).publishingRepo);
vi.mock("@/lib/billing/access", async () => (await import("./helpers/memory-store")).billingAccess);
vi.mock("@/lib/research/run", async () => (await import("./helpers/memory-store")).researchRun);
vi.mock("@/lib/email/notify", async () => (await import("./helpers/memory-store")).emailNotify);
// Traffic proof is a best-effort, unmetered side effect of settle; stub it so the
// content-run assertions aren't coupled to the GSC/GA4 sync (which hits its own seam).
vi.mock("@/lib/integrations/google-traffic", () => ({ syncTrafficForBrand: vi.fn(async () => []) }));

import { generateArticleFromTopic } from "@/lib/articles/generate";
import { planDailyForBrand, researchForDaily, settleDailyForBrand } from "@/lib/jobs/daily";
import { InsufficientCreditsError } from "@/lib/usage/credits";
import { getUtcDayKey } from "@/lib/workspace/settings";
import {
  dailyRunFor,
  email,
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

const BRAND = { id: "ws-1", name: "Test Brand" };
const today = () => getUtcDayKey();

/** Compose the decomposed steps the way `DailyBrandWorkflow.run` does. */
async function runDaily(planId: string) {
  const scope = { workspaceId: "ws-1", brandId: BRAND.id };
  const runDate = today();

  const plan = await planDailyForBrand(scope, planId, runDate);
  if (plan.skip) {
    return { generated: 0, researchTopics: 0, status: plan.skipStatus };
  }

  let targets = plan.topicIds;
  let researchTopics = 0;
  if (plan.needsResearch) {
    const result = await researchForDaily(scope, plan.budget, `daily-${BRAND.id}-${runDate}`);
    researchTopics = result.researchTopics;
    targets = result.topicIds;
  }

  const writeTargets = targets.slice(0, plan.budget);
  const hadTargets = writeTargets.length > 0;
  let generated = 0;
  let outOfCredits = false;
  for (const topicId of writeTargets) {
    try {
      await generateArticleFromTopic(scope, topicId, {});
      generated += 1;
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        outOfCredits = true;
        break;
      }
      // A single article failing shouldn't sink the day — skip it.
    }
  }

  const status = await settleDailyForBrand(scope, runDate, {
    cap: plan.cap,
    writtenToday: plan.writtenToday,
    priorResearched: plan.priorResearched,
    generated,
    researchTopics,
    hadTargets,
    outOfCredits,
    brandName: BRAND.name,
  });

  return { generated, researchTopics, status };
}

function pendingTopics() {
  return [...store.topics.values()].filter((t) => t.status === "pending");
}

function seedScoredTopics(count: number) {
  for (let i = 0; i < count; i++) {
    seedTopic({ workspaceId: "ws-1", status: "pending", score: 50 + i, title: `Topic ${i}` });
  }
}

beforeEach(() => {
  resetStore();
});

describe("daily content agent", () => {
  it("writes up to the plan's daily cap and no more", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    setCredits("ws-1", 5000);
    seedScoredTopics(15); // queue larger than the cap

    const result = await runDaily("scale"); // cap 10

    expect(result.generated).toBe(10);
    expect(result.status).toBe("active");
    expect(store.articles.size).toBe(10);
    expect(pendingTopics()).toHaveLength(5);
    // Queue already covered the budget, so no research run was needed.
    expect(research.calls).toBe(0);
    expect(email.sent).toHaveLength(0);

    const run = dailyRunFor("ws-1", today());
    expect(run?.articlesWritten).toBe(10);
    expect(run?.status).toBe("active");
  });

  it("pauses and emails the owner when credits run out mid-day", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    setCredits("ws-1", 250); // two articles' worth
    seedScoredTopics(10);

    const result = await runDaily("scale"); // cap 10

    expect(result.generated).toBe(2);
    expect(result.status).toBe("paused_no_credits");
    expect(store.articles.size).toBe(2);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ workspaceId: "ws-1", brandName: "Test Brand" });
    expect(dailyRunFor("ws-1", today())?.status).toBe("paused_no_credits");
  });

  it("auto-researches once when the queue is below the day's budget", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    setCredits("ws-1", 5000);
    seedScoredTopics(6); // fewer than the cap of 10

    const result = await runDaily("scale"); // cap 10

    expect(research.calls).toBe(1); // topped up exactly once
    expect(result.generated).toBe(6); // wrote what was genuinely available
    expect(result.status).toBe("active");
    expect(email.sent).toHaveLength(0);
  });

  it("never forces topics — an empty queue research can't fill writes nothing", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    setCredits("ws-1", 5000);
    // No topics seeded; mocked research returns 0 new topics.
    research.topicsCreated = 0;

    const result = await runDaily("indie"); // cap 1

    expect(research.calls).toBe(1);
    expect(result.generated).toBe(0);
    expect(result.status).toBe("no_topics");
    expect(store.articles.size).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("is idempotent within a day — a re-fired cron respects the cap", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    setCredits("ws-1", 5000);
    seedScoredTopics(2);

    const first = await runDaily("indie"); // cap 1
    expect(first.generated).toBe(1);
    expect(store.articles.size).toBe(1);

    const second = await runDaily("indie");
    expect(second.generated).toBe(0);
    expect(second.status).toBe("idle");
    expect(store.articles.size).toBe(1); // no second article the same day
  });

  it("a retried article write neither double-writes nor double-charges", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    setCredits("ws-1", 5000);
    const topic = seedTopic({ workspaceId: "ws-1", status: "pending", score: 80, title: "Retry me" });
    const scope = { workspaceId: "ws-1", brandId: BRAND.id };

    await generateArticleFromTopic(scope, topic.id, {});
    const balanceAfterFirst = store.usage.get("ws-1");
    expect(store.articles.size).toBe(1);

    // Simulate a Workflow step retry: same topic again.
    await generateArticleFromTopic(scope, topic.id, {});
    expect(store.articles.size).toBe(1); // guarded by getArticleByTopic
    expect(store.usage.get("ws-1")).toBe(balanceAfterFirst); // not charged twice
  });

  it("skips plans with no daily allowance (free/unsubscribed) without a job", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "REVIEW" });
    setCredits("ws-1", 5000);
    seedScoredTopics(3);

    const result = await runDaily("free"); // cap 0

    expect(result.status).toBe("idle");
    expect(result.generated).toBe(0);
    expect(store.articles.size).toBe(0);
    expect(jobsFor("ws-1", "daily_pipeline")).toHaveLength(0);
  });

  it("auto-publishes the day's articles in FULL_AUTO mode", async () => {
    seedWorkspace({ id: "ws-1", autonomyMode: "FULL_AUTO" });
    seedIntegration("ws-1", { provider: "markdown_export", enabled: true });
    setCredits("ws-1", 5000);
    seedScoredTopics(1);

    const result = await runDaily("indie"); // cap 1

    expect(result.generated).toBe(1);
    const [article] = [...store.articles.values()];
    expect(article.status).toBe("approved");
    const publications = publicationsFor("ws-1", article.id);
    expect(publications).toHaveLength(1);
    expect(publications[0].status).toBe("published");
  });
});
