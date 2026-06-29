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

  const subject = `Your content agent paused — out of credits`;

  const text = [
    `Your content agent for ${input.brandName} has paused.`,
    "",
    `It's out of credits, so it can't write today's articles. ${queued}, but it needs credits to turn them into published articles.`,
    "",
    `Top up add-on credits to get it working again: ${input.creditsUrl}`,
    `View your agent: ${input.dashboardUrl}`,
    "",
    "It will pick up right where it left off as soon as credits are available.",
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
            <p style="margin:12px 0;">Your content agent for <strong style="color:#eef1f7;">${brand}</strong> has paused. It's out of credits, so it can't write today's articles.</p>
            <p style="margin:12px 0;">${escapeHtml(queued)} — it just needs credits to turn them into published articles.</p>
          </td></tr>
          <tr><td style="padding:20px 32px 28px;">
            <a href="${input.creditsUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c6cff,#b06cff);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Buy add-on credits</a>
            <a href="${input.dashboardUrl}" style="display:inline-block;margin-left:10px;color:#cdd3e6;text-decoration:none;font-weight:600;font-size:15px;padding:12px 14px;">View agent →</a>
          </td></tr>
          <tr><td style="padding:0 32px 28px;font-size:13px;color:#6b7388;border-top:1px solid #242838;">
            <p style="margin:16px 0 0;">It will pick up right where it left off as soon as credits are available.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
