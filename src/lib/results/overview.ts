import type {
  Article,
  SiteHealthResponse,
  VisibilityAnswers,
  VisibilitySubScoreKey,
  VisibilitySummary,
  VisibilityTraffic,
  WeeklyReportRow,
} from "@/lib/api/queries";

export type ResultAreaId = "google" | "ai" | "content" | "health";

export type ResultAreaView = {
  id: ResultAreaId;
  title: string;
  value: string;
  change: string;
  nextStep: string;
  href: string;
  tone: "positive" | "attention" | "neutral";
};

export type ResultsOverviewView = {
  weeklyHeadline: string;
  weeklySummary: string;
  areas: ResultAreaView[];
  discoveryHealth: {
    value: string;
    description: string;
    delta: string | null;
    href: string;
    details: Array<{ key: VisibilitySubScoreKey; label: string; value: number | null }>;
  };
  latestReport: {
    id: string;
    subject: string;
    createdAt: string;
    summary: string;
    href: string;
  } | null;
  recentReports: Array<{ id: string; subject: string; weekStart: string; href: string }>;
  measurementFreshness: string;
};

type ResultsOverviewInput = {
  summary: VisibilitySummary;
  traffic: VisibilityTraffic;
  answers: VisibilityAnswers;
  siteHealth: SiteHealthResponse;
  articles: Article[];
  reports: WeeklyReportRow[];
  now?: Date;
};

const DAY_MS = 86_400_000;
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const PILLAR_LABELS: Record<VisibilitySubScoreKey, string> = {
  technical: "Technical access",
  eeat: "Content trust",
  brand: "Brand authority",
  citability: "Citability",
  platform: "AI answers",
  schema: "Structured data",
};
const PILLAR_KEYS = Object.keys(PILLAR_LABELS) as VisibilitySubScoreKey[];

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : pluralForm}`;
}

function searchMetrics(traffic: VisibilityTraffic) {
  const rows = [...traffic.gsc].sort((left, right) => left.date.localeCompare(right.date));
  const currentRows = rows.slice(-28);
  const previousRows = rows.slice(-56, -28);
  const clicks = currentRows.reduce((total, row) => total + row.clicks, 0);
  const impressions = currentRows.reduce((total, row) => total + row.impressions, 0);
  const previousClicks = previousRows.reduce((total, row) => total + row.clicks, 0);
  const delta = previousClicks > 0 ? Math.round(((clicks - previousClicks) / previousClicks) * 100) : null;
  return { clicks, impressions, delta };
}

function aiMetrics(answers: VisibilityAnswers) {
  const checks = answers.share.reduce((total, row) => total + row.prompts, 0);
  const appeared = answers.share.reduce((total, row) => total + row.appeared, 0);
  const cited = answers.share.reduce((total, row) => total + row.cited, 0);
  const share = checks > 0 ? Math.round((appeared / checks) * 100) : null;
  return { checks, appeared, cited, share };
}

function isPublished(article: Article) {
  return article.status === "published" || article.publication?.status === "published";
}

function contentMetrics(articles: Article[], now: Date) {
  let published = 0;
  let publishedThisWeek = 0;
  let winners = 0;
  let needsImprovement = 0;
  const cutoff = now.getTime() - 7 * DAY_MS;

  for (const article of articles) {
    if (isPublished(article)) {
      published += 1;
      const publishedAt = article.publication?.publishedAt ?? article.updatedAt;
      if (new Date(publishedAt).getTime() >= cutoff) publishedThisWeek += 1;
    }
    if (article.performance?.verdict === "winner") winners += 1;
    if (article.performance?.verdict === "stalling" || article.performance?.verdict === "dead") {
      needsImprovement += 1;
    }
  }
  return { published, publishedThisWeek, winners, needsImprovement };
}

function latestMeasurement(input: ResultsOverviewInput) {
  const candidates = [
    input.summary.latest?.completedAt,
    input.siteHealth.snapshot?.generatedAt,
    input.traffic.gsc.at(-1)?.date,
    input.traffic.aiReferrals.at(-1)?.date,
    input.reports[0]?.createdAt,
    input.articles[0]?.updatedAt,
  ].flatMap((value) => (value ? [new Date(value.includes("T") ? value : `${value}T00:00:00Z`)] : []));
  const valid = candidates.filter((date) => !Number.isNaN(date.getTime()));
  if (valid.length === 0) return "Waiting for the first reliable measurement";
  const latest = valid.reduce((current, date) => (date > current ? date : current));
  return `Measurements updated ${DATE_FORMATTER.format(latest)}`;
}

function reportSummary(report: WeeklyReportRow) {
  const parts: string[] = [];
  if (report.summary.completedWork > 0) {
    parts.push(`${plural(report.summary.completedWork, "priority item")} completed`);
  }
  if (report.summary.publishedCount > 0) {
    parts.push(`${plural(report.summary.publishedCount, "article")} published`);
  }
  if (report.summary.answerMentions > 0) {
    parts.push(`${plural(report.summary.answerMentions, "AI mention")} recorded`);
  }
  return parts.length > 0 ? `${parts.join(" · ")}.` : "Claudia summarized the latest evidence and next actions.";
}

export function buildResultsOverview(input: ResultsOverviewInput): ResultsOverviewView {
  const now = input.now ?? new Date();
  const search = searchMetrics(input.traffic);
  const ai = aiMetrics(input.answers);
  const content = contentMetrics(input.articles, now);
  const health = input.siteHealth.snapshot?.summary ?? { pass: 0, warn: 0, fail: 0 };
  const healthIssues = health.warn + health.fail;

  const areas: ResultAreaView[] = [
    input.traffic.connected.gsc
      ? {
          id: "google",
          title: "Found in Google",
          value: plural(search.clicks, "click"),
          change:
            search.delta == null
              ? `${plural(search.impressions, "impression")} recorded while Claudia builds a comparison.`
              : search.delta === 0
                ? "Search clicks are holding steady against the previous period."
                : `Search clicks are ${search.delta > 0 ? "up" : "down"} ${Math.abs(search.delta)}% against the previous period.`,
          nextStep:
            search.delta != null && search.delta < 0
              ? "Claudia will inspect the queries and pages that lost momentum."
              : "Claudia will keep monitoring the queries and pages gaining traction.",
          href: "#google-discovery",
          tone: search.delta == null || search.delta === 0 ? "neutral" : search.delta > 0 ? "positive" : "attention",
        }
      : {
          id: "google",
          title: "Found in Google",
          value: "Not connected",
          change: "Search Console data is not available yet.",
          nextStep: "Connect Search Console so Claudia can measure clicks, impressions, and query movement.",
          href: "/settings?tab=integrations",
          tone: "neutral",
        },
    {
      id: "ai",
      title: "Found in AI answers",
      value: ai.share == null ? "Collecting data" : `${ai.share}% of checks`,
      change:
        ai.checks > 0
          ? `Your brand appeared in ${ai.appeared} of ${ai.checks} tracked checks and was cited ${ai.cited} times.`
          : "Claudia is preparing the first questions worth tracking.",
      nextStep:
        ai.appeared > 0
          ? "Claudia will strengthen the pages and evidence earning mentions."
          : "Claudia will improve answer-ready coverage for the most relevant questions.",
      href: "/visibility/answers",
      tone: ai.share != null && ai.share > 0 ? "positive" : "neutral",
    },
    {
      id: "content",
      title: "Content performance",
      value: plural(content.published, "published page"),
      change:
        content.publishedThisWeek > 0
          ? `${plural(content.publishedThisWeek, "new page")} went live in the last seven days.`
          : content.winners > 0
            ? `${plural(content.winners, "page")} is gaining traction.`
            : "Claudia is waiting for enough performance data to judge recent work.",
      nextStep:
        content.needsImprovement > 0
          ? `Claudia has ${plural(content.needsImprovement, "underperforming page")} to revisit.`
          : "Claudia will keep measuring new content and improve what stays flat.",
      href: "/articles",
      tone: content.publishedThisWeek > 0 || content.winners > 0 ? "positive" : "neutral",
    },
    input.siteHealth.hasData
      ? {
          id: "health",
          title: "Website health",
          value: healthIssues === 0 ? "All checks passed" : plural(healthIssues, "issue"),
          change:
            healthIssues === 0
              ? `${plural(health.pass, "check")} passed in the latest website review.`
              : `${health.fail} important and ${health.warn} lower-priority issues remain.`,
          nextStep:
            healthIssues === 0
              ? "Claudia will recheck the site automatically."
              : "Claudia will prioritize the issues that affect discovery most.",
          href: "/visibility/health",
          tone: health.fail > 0 ? "attention" : healthIssues === 0 ? "positive" : "neutral",
        }
      : {
          id: "health",
          title: "Website health",
          value: "Checks pending",
          change: "The first website health reading is still being prepared.",
          nextStep: "Claudia will check speed, crawler access, metadata, and structured data.",
          href: "/visibility/health",
          tone: "neutral",
        },
  ];

  const positiveMovement = search.delta != null && search.delta > 0;
  const weeklyHeadline = positiveMovement
    ? "More people are discovering your brand."
    : content.publishedThisWeek > 0
      ? "Claudia is expanding your online footprint."
      : input.summary.hasAudit || ai.checks > 0 || input.traffic.gsc.length > 0
        ? "Claudia is measuring where discovery can improve."
        : "Claudia is building your first discovery baseline.";
  const summaryParts = [
    search.delta != null
      ? `Search clicks are ${search.delta >= 0 ? "up" : "down"} ${Math.abs(search.delta)}%`
      : null,
    content.publishedThisWeek > 0
      ? `${plural(content.publishedThisWeek, "page")} published this week`
      : null,
    ai.appeared > 0 ? `your brand appeared in ${plural(ai.appeared, "AI check")}` : null,
    healthIssues > 0 ? `${plural(healthIssues, "website issue")} being monitored` : null,
  ].flatMap((part) => (part ? [part] : []));

  const score = input.summary.latest?.overall;
  const scoreDelta =
    score != null && input.summary.previousOverall != null
      ? Math.round(score - input.summary.previousOverall)
      : null;
  const latestReport = input.reports[0] ?? null;

  return {
    weeklyHeadline,
    weeklySummary:
      summaryParts.length > 0
        ? `${summaryParts.join(", ")}.`
        : "Early results take time. Claudia is watching for the first reliable movement.",
    areas,
    discoveryHealth: {
      value: score == null ? "Not measured yet" : `${Math.round(score)}/100`,
      description:
        score == null
          ? "A combined check of how easy it is for search engines and AI assistants to find, understand, and trust your brand."
          : "A combined check of technical access, content trust, authority, citability, AI answers, and structured data.",
      delta:
        scoreDelta == null
          ? null
          : scoreDelta === 0
            ? "No change from the previous reading"
            : `${scoreDelta > 0 ? "Up" : "Down"} ${Math.abs(scoreDelta)} points from the previous reading`,
      href: input.summary.latest ? `/visibility/${input.summary.latest.id}` : "/visibility/health",
      details: PILLAR_KEYS.map((key) => ({
        key,
        label: PILLAR_LABELS[key],
        value: input.summary.latest?.subScores[key] ?? null,
      })),
    },
    latestReport: latestReport
      ? {
          id: latestReport.id,
          subject: latestReport.subject,
          createdAt: latestReport.createdAt,
          summary: reportSummary(latestReport),
          href: `/reports/${latestReport.id}`,
        }
      : null,
    recentReports: input.reports.slice(1, 4).map((report) => ({
      id: report.id,
      subject: report.subject,
      weekStart: report.weekStart,
      href: `/reports/${report.id}`,
    })),
    measurementFreshness: latestMeasurement(input),
  };
}
