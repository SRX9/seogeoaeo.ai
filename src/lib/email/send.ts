import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { logError, logInfo, logWarn } from "@/lib/logging/logger";

/**
 * Sender identity for every transactional email. "Claudia" is the content
 * agent's persona (see the content-agent narrative), so a message reads as
 * coming from the writer the customer hired rather than a faceless no-reply.
 * Must be an address on the verified sending domain. Change this one line to
 * rename it.
 */
export const EMAIL_FROM = "Claudia from seogeoaeo.ai <claudia@seogeoaeo.ai>";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** The Cloudflare `send_email` binding, if we're running on the Workers runtime. */
function getEmailBinding() {
  return getCloudflareRequestContext()?.env?.EMAIL;
}

/** True only when the EMAIL binding is present (i.e. running on Cloudflare). */
export function isEmailConfigured(): boolean {
  return Boolean(getEmailBinding());
}

/**
 * Send one transactional email through the Cloudflare `send_email` binding. The
 * binding is only bound on the Workers runtime, so in local `next dev` this
 * no-ops. Never throws — callers treat email as best-effort and must not let it
 * break the surrounding work.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const binding = getEmailBinding();
  if (!binding) {
    logWarn("email.not_configured", { to: input.to });
    return false;
  }

  try {
    const response = await binding.send({
      to: input.to,
      from: EMAIL_FROM,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    logInfo("email.sent", { to: input.to, messageId: response?.messageId });
    return true;
  } catch (error) {
    logError("email.send_error", {
      to: input.to,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
