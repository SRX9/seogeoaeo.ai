"use client";

import { toast } from "@heroui/react";
import { ApiError, getErrorMessage } from "@/lib/api/fetcher";

export type PublishSummary = {
  published: number;
  skipped: number;
  failed: number;
  unchanged?: boolean;
};

/**
 * Shared publish toast semantics for article editor and inbox approve-and-publish.
 * Never masks real failures as "connect CMS".
 */
export function notifyPublishResult(summary: PublishSummary) {
  if (summary.unchanged) {
    toast.info("No changes since the last publish — nothing to send.");
    return;
  }
  if (summary.published > 0) {
    if (summary.failed > 0) {
      toast.danger(
        `Published to ${summary.published} destination(s), but ${summary.failed} failed — check Connections.`,
      );
    } else {
      toast.success(`Published to ${summary.published} destination(s).`);
    }
    return;
  }
  if (summary.skipped > 0 && summary.failed === 0) {
    toast.info("Already up to date on your destinations.");
    return;
  }
  if (summary.failed > 0) {
    toast.danger("Publishing failed — check Connections.");
    return;
  }
  toast.warning("Approved, but publishing had issues — check Connections.");
}

/** Handle publish-route errors after a successful approve. */
export function notifyPublishError(error: unknown, opts?: { noCmsHint?: boolean }) {
  if (error instanceof ApiError && error.status === 402) {
    toast.danger("Publishing needs an active plan.");
    return;
  }
  if (opts?.noCmsHint) {
    toast.danger(getErrorMessage(error, "Couldn't publish this draft."));
    return;
  }
  // Only suggest CMS when the error looks like "nothing to publish to".
  const msg = getErrorMessage(error, "");
  if (/no (enabled )?integration|no destination|connect/i.test(msg)) {
    toast.success("Approved. Connect a CMS under Brand → Connections to go live.");
    return;
  }
  toast.danger(getErrorMessage(error, "Couldn't publish this draft."));
}
