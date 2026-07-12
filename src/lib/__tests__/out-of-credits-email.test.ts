/**
 * Unit tests for `sendOutOfCreditsEmail`: the credit notification gate the daily
 * cron fires through. Verifies the opt-out flag, the weekly throttle, and the
 * happy path, with the DB / send / env dependencies mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type SubRow = { lastLowCreditEmailAt: Date | null; creditEmailsEnabled: boolean };

const { subRow, sendEmail, updateSet, getOwnerEmail } = vi.hoisted(() => ({
  subRow: { value: null as SubRow | null },
  sendEmail: vi.fn(async () => true),
  updateSet: vi.fn(),
  getOwnerEmail: vi.fn(async () => "owner@example.com"),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(subRow.value ? [subRow.value] : []) }),
      }),
    }),
    update: () => ({
      set: (vals: unknown) => {
        updateSet(vals);
        return { where: () => Promise.resolve() };
      },
    }),
  }),
}));
vi.mock("@/lib/email/send", () => ({ isEmailConfigured: () => true, sendEmail }));
vi.mock("@/lib/workspace", () => ({ getWorkspaceOwnerEmail: getOwnerEmail }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ BETTER_AUTH_URL: "https://app.test" }) }));

import { sendOutOfCreditsEmail } from "@/lib/email/notify";

const notice = { workspaceId: "ws-1", brandName: "Acme", pendingTopics: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  subRow.value = null;
});

describe("sendOutOfCreditsEmail", () => {
  it("emails the owner and stamps the throttle when enabled", async () => {
    subRow.value = { lastLowCreditEmailAt: null, creditEmailsEnabled: true };
    await sendOutOfCreditsEmail(notice);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledOnce();
  });

  it("sends nothing and leaves the throttle untouched when the owner opted out", async () => {
    subRow.value = { lastLowCreditEmailAt: null, creditEmailsEnabled: false };
    await sendOutOfCreditsEmail(notice);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("respects the weekly throttle even when enabled", async () => {
    subRow.value = { lastLowCreditEmailAt: new Date(), creditEmailsEnabled: true };
    await sendOutOfCreditsEmail(notice);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
