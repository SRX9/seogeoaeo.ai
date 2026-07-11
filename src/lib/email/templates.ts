export type OutOfCreditsEmailInput = {
  brandName: string;
  pendingTopics: number;
  dashboardUrl: string;
  creditsUrl: string;
};

export type EmailContent = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared shell so every Claudia email matches the out-of-credits styling. */
function claudiaEmailHtml(kicker: string, title: string, bodyHtml: string, cta: { href: string; label: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#0a0b10;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#eef1f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#14161f;border:1px solid #242838;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#b06cff;">${escapeHtml(kicker)}</div>
            <h1 style="margin:10px 0 0;font-size:22px;font-weight:700;color:#ffffff;">${escapeHtml(title)}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#9aa3b8;">${bodyHtml}</td></tr>
          <tr><td style="padding:20px 32px 28px;">
            <a href="${cta.href}" style="display:inline-block;background:linear-gradient(135deg,#7c6cff,#b06cff);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">${escapeHtml(cta.label)}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export type VisibilityAlertEmailInput = {
  siteUrl: string;
  reasons: string[];
  dashboardUrl: string;
};

/** V7.3 alert: score drop or new critical finding on a monitored site. */
export function visibilityAlertEmail(input: VisibilityAlertEmailInput): EmailContent {
  const subject = `Visibility alert for ${input.siteUrl}`;
  const text = [
    `Claudia's scheduled check of ${input.siteUrl} found something that needs your attention:`,
    "",
    ...input.reasons.map((r) => `- ${r}`),
    "",
    `See the details and fixes: ${input.dashboardUrl}`,
  ].join("\n");
  const body =
    `<p style="margin:12px 0;">My scheduled check of <strong style="color:#eef1f7;">${escapeHtml(input.siteUrl)}</strong> found something that needs your attention:</p>` +
    `<ul style="margin:12px 0;padding-left:20px;">${input.reasons.map((r) => `<li style="margin:6px 0;">${escapeHtml(r)}</li>`).join("")}</ul>`;
  const html = claudiaEmailHtml("Claudia · visibility alert", "Something moved on your site", body, {
    href: input.dashboardUrl,
    label: "See details & fixes",
  });
  return { subject, html, text };
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
  const subject = `Claudia's weekly report for ${input.brandName}`;
  const text = [
    `Here's my week on ${input.siteUrl}:`,
    "",
    ...input.lines.map((line) => `- ${line}`),
    ...(input.ask ? ["", `One thing from you: ${input.ask.what} ${input.ask.href}`] : []),
    "",
    `Every report: ${input.reportsUrl}`,
  ].join("\n");

  const body =
    `<p style="margin:12px 0;">Here's my week on <strong style="color:#eef1f7;">${escapeHtml(input.siteUrl)}</strong>:</p>` +
    `<ul style="margin:12px 0;padding-left:20px;">${input.lines
      .map((line) => `<li style="margin:8px 0;color:#eef1f7;">${escapeHtml(line)}</li>`)
      .join("")}</ul>` +
    (input.ask
      ? `<p style="margin:16px 0 4px;color:#eef1f7;"><strong>One thing from you:</strong> ${escapeHtml(input.ask.what)}</p>`
      : `<p style="margin:16px 0 4px;">You do not need to do anything this week. I'll keep working.</p>`);

  const html = claudiaEmailHtml(
    "Claudia · weekly report",
    `My week on ${input.brandName}`,
    body,
    input.ask
      ? { href: input.ask.href, label: "Take care of it" }
      : { href: input.reportsUrl, label: "View the full report" },
  );
  return { subject, html, text };
}

/**
 * "Your content agent is out of credits" notice. Framed as a hired content
 * employee who's ready to keep working but needs the account topped up.
 */
export function outOfCreditsEmail(input: OutOfCreditsEmailInput): EmailContent {
  const brand = escapeHtml(input.brandName);
  const topics = Math.max(0, input.pendingTopics);
  const queued =
    topics > 0
      ? `${topics} researched ${topics === 1 ? "topic is" : "topics are"} queued and ready to write`
      : "new topics are queued and ready to write";

  const subject = `Claudia paused because your credits ran out`;

  const text = [
    `Claudia has paused work for ${input.brandName}.`,
    "",
    `Your account is out of credits, so Claudia cannot write today's articles. ${queued}.`,
    "",
    `Add credits to resume the work: ${input.creditsUrl}`,
    `View Claudia's work: ${input.dashboardUrl}`,
    "",
    "Claudia will resume from the same place as soon as credits are available.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#0a0b10;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#eef1f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#14161f;border:1px solid #242838;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#b06cff;">Content agent · paused</div>
            <h1 style="margin:10px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Out of credits</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#9aa3b8;">
            <p style="margin:12px 0;">Claudia has paused work for <strong style="color:#eef1f7;">${brand}</strong> because your account is out of credits.</p>
            <p style="margin:12px 0;">${escapeHtml(queued)}. Add credits when you want her to continue.</p>
          </td></tr>
          <tr><td style="padding:20px 32px 28px;">
            <a href="${input.creditsUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c6cff,#b06cff);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Buy add-on credits</a>
            <a href="${input.dashboardUrl}" style="display:inline-block;margin-left:10px;color:#cdd3e6;text-decoration:none;font-weight:600;font-size:15px;padding:12px 14px;">View agent →</a>
          </td></tr>
          <tr><td style="padding:0 32px 28px;font-size:13px;color:#6b7388;border-top:1px solid #242838;">
            <p style="margin:16px 0 0;">Claudia will resume from the same place as soon as credits are available.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
