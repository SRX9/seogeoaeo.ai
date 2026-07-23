import { SITE_URL } from "@/lib/site";

export type OutOfCreditsEmailInput = {
  brandName: string;
  pendingTopics: number;
  dashboardUrl: string;
  creditsUrl: string;
};

export type EmailContent = { subject: string; html: string; text: string };

type EmailAction = {
  href: string;
  label: string;
};

const CLAUDIA_LOGO_URL = `${SITE_URL}/claudia-bg-free-logo.png`;
const GEIST_FONT_URL = `${SITE_URL}/geist-latin.woff2`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(content: string): string {
  return `<p style="margin:0 0 20px;">${content}</p>`;
}

function list(items: string[]): string {
  return `<ul style="margin:0 0 20px;padding:0 0 0 22px;">${items
    .map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function claudiaEmailText(lines: string[], action?: EmailAction): string {
  return [
    "Hi,",
    "",
    ...lines,
    ...(action ? ["", `${action.label}: ${action.href}`] : []),
    "",
    "Claudia",
  ].join("\n");
}

/**
 * A plain, letter-like shell for customer emails. Email clients that support
 * Geist use it; Arial is the metric-compatible fallback elsewhere.
 */
function claudiaEmailHtml(bodyHtml: string, action?: EmailAction): string {
  const actionHtml = action
    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(action.href)}" style="color:inherit;font-weight:600;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;">${escapeHtml(action.label)}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>Claudia</title>
    <style>
      @font-face {
        font-family: "Geist";
        font-style: normal;
        font-weight: 100 900;
        font-display: swap;
        src: url("${GEIST_FONT_URL}") format("woff2");
      }
    </style>
  </head>
  <body style="margin:0;padding:0;font-family:Geist,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:48px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
            <tr>
              <td style="font-family:Geist,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;text-align:left;overflow-wrap:break-word;">
                <img src="${CLAUDIA_LOGO_URL}" width="48" height="48" alt="Claudia" style="display:block;width:48px;height:48px;object-fit:contain;margin:0 0 32px;">
                ${paragraph("Hi,")}
                ${bodyHtml}
                ${actionHtml}
                <p style="margin:32px 0 0;">Claudia</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function formatRunDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function weeklyAskLabel(href: string): string {
  const path = new URL(href, SITE_URL).pathname;
  if (path === "/settings") return "Connect Search Console";
  if (path === "/visibility/fixes") return "Review fixes";
  if (path === "/articles") return "Review drafts";
  return "Review this";
}

export type VisibilityAlertEmailInput = {
  siteUrl: string;
  reasons: string[];
  dashboardUrl: string;
};

/** V7.3 alert: score drop or new critical finding on a monitored site. */
export function visibilityAlertEmail(input: VisibilityAlertEmailInput): EmailContent {
  const subject = `I found a visibility issue on ${input.siteUrl}`;
  const action = { href: input.dashboardUrl, label: "Review visibility issues" };
  const text = claudiaEmailText(
    [
      `I checked ${input.siteUrl} and found something that needs your attention:`,
      "",
      ...input.reasons.map((reason) => `- ${reason}`),
    ],
    action,
  );
  const body =
    paragraph(`I checked ${escapeHtml(input.siteUrl)} and found something that needs your attention:`) +
    list(input.reasons);

  return { subject, html: claudiaEmailHtml(body, action), text };
}

export type WeeklyReportEmailInput = {
  brandName: string;
  siteUrl: string;
  /** Owner-language report lines, proof-stack order (renderReportLines). */
  lines: string[];
  /** At most one ask: AP5's "one ask, max" rule is enforced upstream. */
  ask: { what: string; href: string } | null;
  reportsUrl: string;
};

/** AP5: the full weekly report: both halves of Claudia's job, one ask max. */
export function weeklyReportEmail(input: WeeklyReportEmailInput): EmailContent {
  const subject = `What I did for ${input.brandName} this week`;
  const action = input.ask
    ? { href: input.ask.href, label: weeklyAskLabel(input.ask.href) }
    : { href: input.reportsUrl, label: "View the full report" };
  const text = claudiaEmailText(
    [
      `Here's what changed on ${input.siteUrl} this week:`,
      "",
      ...input.lines.map((line) => `- ${line}`),
      ...(input.ask ? ["", "I need your help with one thing:", input.ask.what] : []),
    ],
    action,
  );
  const body =
    paragraph(`Here's what changed on ${escapeHtml(input.siteUrl)} this week:`) +
    (input.lines.length > 0
      ? list(input.lines)
      : paragraph("There is nothing new to report this week.")) +
    (input.ask
      ? paragraph(`I need your help with one thing: ${escapeHtml(input.ask.what)}`)
      : "");

  return { subject, html: claudiaEmailHtml(body, action), text };
}

/**
 * Let the owner know that Claudia stopped because the account ran out of
 * credits, with one direct path to resume work.
 */
export function outOfCreditsEmail(input: OutOfCreditsEmailInput): EmailContent {
  const topics = Math.max(0, input.pendingTopics);
  const queued =
    topics > 0
      ? `${topics} researched ${topics === 1 ? "topic is" : "topics are"} queued and ready to write`
      : "The next work is queued and ready";
  const action = { href: input.creditsUrl, label: "Add credits" };
  const subject = `I paused work for ${input.brandName} because your credits ran out`;
  const text = claudiaEmailText(
    [
      `I paused work for ${input.brandName} because the account ran out of credits.`,
      "",
      `${queued}. I'll continue from the same place as soon as credits are available.`,
    ],
    action,
  );
  const body =
    paragraph(
      `I paused work for ${escapeHtml(input.brandName)} because the account ran out of credits.`,
    ) +
    paragraph(
      `${escapeHtml(queued)}. I'll continue from the same place as soon as credits are available.`,
    );

  return { subject, html: claudiaEmailHtml(body, action), text };
}

export type SetupRunStalledEmailInput = {
  brandName: string;
  dashboardUrl: string;
};

/**
 * Setup hit a terminal technical failure. The customer's saved work is safe,
 * the team is alerted, and the dashboard offers the only useful action.
 */
export function setupRunStalledEmail(input: SetupRunStalledEmailInput): EmailContent {
  const subject = `I hit a problem while setting up ${input.brandName}`;
  const action = { href: input.dashboardUrl, label: "Retry setup" };
  const text = claudiaEmailText(
    [
      `I ran into a technical problem while setting up ${input.brandName}.`,
      "",
      "Everything I finished is saved, and my team has been alerted. You can retry now, or wait while we fix it.",
    ],
    action,
  );
  const body =
    paragraph(`I ran into a technical problem while setting up ${escapeHtml(input.brandName)}.`) +
    paragraph(
      "Everything I finished is saved, and my team has been alerted. You can retry now, or wait while we fix it.",
    );

  return { subject, html: claudiaEmailHtml(body, action), text };
}

export type SetupRunCompletedEmailInput = {
  brandName: string;
  summary: string;
  dashboardUrl: string;
};

export function setupRunCompletedEmail(input: SetupRunCompletedEmailInput): EmailContent {
  const subject = `I finished setting up ${input.brandName}`;
  const action = { href: input.dashboardUrl, label: "See what I found" };
  const text = claudiaEmailText(
    [
      `I finished the initial setup for ${input.brandName}.`,
      "",
      input.summary,
    ],
    action,
  );
  const body =
    paragraph(`I finished the initial setup for ${escapeHtml(input.brandName)}.`) +
    paragraph(escapeHtml(input.summary));

  return { subject, html: claudiaEmailHtml(body, action), text };
}

export type ArticleReviewNeededEmailInput = {
  brandName: string;
  articleTitle: string;
  articleUrl: string;
  reason: "review_mode" | "quality_hold";
};

export function articleReviewNeededEmail(input: ArticleReviewNeededEmailInput): EmailContent {
  const reason =
    input.reason === "review_mode"
      ? "You asked me to hold every article for review before publishing."
      : "One of my checks found something that needs your judgment before I can publish it.";
  const subject = `Review: ${input.articleTitle}`;
  const action = { href: input.articleUrl, label: "Review the article" };
  const text = claudiaEmailText(
    [
      `I drafted "${input.articleTitle}" for ${input.brandName}.`,
      "",
      reason,
    ],
    action,
  );
  const body =
    paragraph(
      `I drafted <strong>${escapeHtml(input.articleTitle)}</strong> for ${escapeHtml(input.brandName)}.`,
    ) + paragraph(reason);

  return { subject, html: claudiaEmailHtml(body, action), text };
}

export type DailyStandupEmailInput = {
  brandName: string;
  runDate: string;
  articlesWritten: number;
  topicsResearched: number;
  failures: number;
  status: string;
  dashboardUrl: string;
};

export function dailyStandupEmail(input: DailyStandupEmailInput): EmailContent {
  const lines = [
    `Wrote ${input.articlesWritten} article${input.articlesWritten === 1 ? "" : "s"}.`,
    `Researched ${input.topicsResearched} new topic${input.topicsResearched === 1 ? "" : "s"}.`,
    ...(input.failures > 0
      ? [`Held ${input.failures} item${input.failures === 1 ? "" : "s"} to try again.`]
      : []),
    ...(input.status === "paused_no_credits"
      ? ["Paused after the account ran out of credits."]
      : []),
  ];
  const date = formatRunDate(input.runDate);
  const subject = `What I did for ${input.brandName} today`;
  const text = claudiaEmailText([
    `Here's my update for ${date}:`,
    "",
    ...lines.map((line) => `- ${line}`),
  ]);
  const body = paragraph(`Here's my update for ${escapeHtml(date)}:`) + list(lines);

  return { subject, html: claudiaEmailHtml(body), text };
}
