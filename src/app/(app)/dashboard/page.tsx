"use client";

import { buttonVariants } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Table } from "@heroui/react/table";
import Link from "next/link";
import { useMemo } from "react";
import { DashboardKpis } from "@/components/dashboard/dashboard-kpis";
import { AutomationCard } from "@/components/dashboard/automation-card";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import {
  CardSkeleton,
  ChipRowSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/feedback/skeletons";
import {
  combineQueries,
  useArticles,
  useAutomation,
  useCredits,
  useMe,
  useOnboarding,
  useResearch,
  useTopics,
} from "@/lib/api/queries";
import { getPlan, isActiveSubscription } from "@/lib/billing/plans";
import { statusColor } from "@/lib/ui/status";
import { autonomyLabel } from "@/lib/workspace/settings";

const manageTopicsAction = (
  <Link href="/topics" className={buttonVariants({ size: "sm" })}>
    Manage topics
  </Link>
);
const overviewMetaSkeleton = <ChipRowSkeleton count={3} />;
const kpiSkeleton = <StatGridSkeleton />;
const automationSkeleton = <StatGridSkeleton />;
const onboardingSkeleton = <CardSkeleton lines={5} />;
const researchSkeleton = <CardSkeleton lines={1} />;
const recentArticlesSkeleton = <TableSkeleton rows={3} />;

export default function DashboardPage() {
  const me = useMe();
  const credits = useCredits();
  const research = useResearch();
  const articles = useArticles();
  const topics = useTopics();
  const automation = useAutomation();
  const onboarding = useOnboarding();

  // Header chips + the free-tier banner share the same inputs.
  const overview = useMemo(() => combineQueries(me, credits, research), [me, credits, research]);
  const kpis = useMemo(
    () => combineQueries(me, credits, articles, topics),
    [me, credits, articles, topics],
  );
  const overviewMeta = useMemo(
    () => (
      <Section query={overview} skeleton={overviewMetaSkeleton}>
        {([meData, , researchData]) => {
          const active = isActiveSubscription(meData.subscription?.status);
          const planName =
            active && meData.subscription?.planId
              ? (getPlan(meData.subscription.planId)?.name ?? "Active plan")
              : null;
          const activeBrand =
            meData.brands.find((brand) => brand.id === meData.activeBrandId) ??
            meData.brands[0] ??
            null;
          const latestRun = researchData.latest;
          return (
            <>
              <Chip color={active ? "success" : "warning"} variant="soft">
                {active ? (planName ?? "Active plan") : "Free plan"}
              </Chip>
              {activeBrand ? (
                <Chip variant="soft">{autonomyLabel(activeBrand.autonomyMode)}</Chip>
              ) : null}
              {latestRun ? (
                <Chip color={statusColor(latestRun.status)} variant="soft">
                  Research {latestRun.status}
                </Chip>
              ) : null}
            </>
          );
        }}
      </Section>
    ),
    [overview],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your autonomous content pipeline at a glance."
        actions={manageTopicsAction}
        meta={overviewMeta}
      />

      {/* Free-tier banner — only shown for unsubscribed workspaces. */}
      <Section query={overview} skeleton={null}>
        {([meData, creditsData]) => {
          if (isActiveSubscription(meData.subscription?.status)) return null;
          const total = creditsData.balance.total;
          const articleCost = creditsData.costs.article_generation;
          const canGenerate = total >= articleCost;
          const articleCount = Math.floor(total / articleCost);
          return (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {canGenerate ? "You're ready to generate" : "You're on the free tier"}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {canGenerate
                    ? `You have ${total.toLocaleString()} credits — enough for ${articleCount} article${
                        articleCount === 1 ? "" : "s"
                      }. Subscribe for a monthly allowance and to publish.`
                    : "You're out of credits. Pick a plan for a monthly credit allowance and auto-publishing."}
                </p>
              </div>
              <Link
                href={canGenerate ? "/topics" : "/account?tab=billing"}
                className={`${buttonVariants({ size: "sm" })} shrink-0`}
              >
                {canGenerate ? "Generate an article" : "View plans"}
              </Link>
            </div>
          );
        }}
      </Section>

      <Section query={kpis} skeleton={kpiSkeleton} errorLabel="Couldn't load your stats.">
        {([meData, creditsData, articlesData, topicsData]) => {
          const approvedArticles = articlesData.articles.filter(
            (article) => article.status === "approved",
          ).length;
          const pendingTopics = topicsData.topics.filter(
            (topic) => topic.status === "pending" && topic.score != null,
          ).length;
          return (
            <DashboardKpis
              credits={creditsData.balance}
              monthlyCreditGrant={meData.subscription?.monthlyCreditGrant ?? 0}
              totalArticles={articlesData.articles.length}
              approvedArticles={approvedArticles}
              pendingTopics={pendingTopics}
            />
          );
        }}
      </Section>

      <Section
        query={automation}
        skeleton={automationSkeleton}
        errorLabel="Couldn't load your content agent."
      >
        {(data) => <AutomationCard automation={data} />}
      </Section>

      <Section query={onboarding} skeleton={onboardingSkeleton}>
        {(data) => <OnboardingChecklist steps={data.steps} />}
      </Section>

      <Section
        query={research}
        skeleton={researchSkeleton}
        errorLabel="Couldn't load research."
      >
        {(data) => {
          const latestRun = data.latest;
          return (
            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">Topic research</h2>
                  <p className="mt-1 text-sm text-muted">
                    {latestRun
                      ? `Last run ${latestRun.status}${
                          typeof latestRun.topicsCreated === "number"
                            ? ` · ${latestRun.topicsCreated} topics added`
                            : ""
                        }`
                      : "No research yet — discover ranked topics worth writing about."}
                  </p>
                  {latestRun?.summary ? (
                    <p className="mt-1 text-sm text-muted">{latestRun.summary}</p>
                  ) : null}
                </div>
                <Link
                  href="/topics"
                  className={`${buttonVariants({ size: "sm", variant: "secondary" })} shrink-0`}
                >
                  Manage topics
                </Link>
              </div>
            </section>
          );
        }}
      </Section>

      <Section query={articles} skeleton={recentArticlesSkeleton}>
        {(data) => {
          const recentArticles = data.articles.slice(0, 5);
          if (recentArticles.length === 0) return null;
          return (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Recent articles</h2>
                <Link href="/articles" className="text-sm text-muted hover:text-foreground">
                  View all
                </Link>
              </div>
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Recent articles" className="min-w-[480px]">
                    <Table.Header>
                      <Table.Column id="title" isRowHeader>
                        Title
                      </Table.Column>
                      <Table.Column id="status">Status</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {recentArticles.map((article) => (
                        <Table.Row
                          key={article.id}
                          id={article.id}
                          href={`/articles/${article.id}`}
                          className="cursor-pointer"
                        >
                          <Table.Cell>
                            <span className="font-medium text-foreground">{article.title}</span>
                          </Table.Cell>
                          <Table.Cell>
                            <Chip color={statusColor(article.status)} variant="soft" size="sm">
                              {article.status}
                            </Chip>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </section>
          );
        }}
      </Section>
    </div>
  );
}
