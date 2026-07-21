import { getDb } from "@/lib/db";
import { contactInquiries } from "@/lib/db/schema";
import { CONTACT_CATEGORY_LABELS, contactRequestSchema } from "@/lib/contact/schema";
import { handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getSession } from "@/lib/auth/session";
import { sendOperatorAlert } from "@/lib/email/notify";
import { logInfo } from "@/lib/logging/logger";
import {
  assertIpRateLimit,
  assertOpaqueIdentifierRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

const CONTACT_RATE_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 };
const CONTACT_ACCOUNT_RATE_LIMIT = { limit: 3, windowMs: 24 * 60 * 60 * 1000 };
const MAX_CONTACT_BODY_BYTES = 16 * 1024;

function assertContactRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "Unsupported request format.");
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Invalid request origin.");
  }
}

/** Accept an authenticated support request, retain it, and notify the configured operator inbox. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const session = await getSession();
    if (!session) throw new HttpError(401, "Sign in to contact support.");

    assertContactRequest(request);

    const requestBody = parseBody(
      contactRequestSchema,
      await readJson(request, MAX_CONTACT_BODY_BYTES),
    );

    // Quietly accept bot submissions so automated senders cannot distinguish
    // the honeypot from a real form, but never store or forward their content.
    if (requestBody.website) return jsonOk({ submitted: true });

    try {
      await assertIpRateLimit(
        request,
        "contact_submit",
        CONTACT_RATE_LIMIT.limit,
        CONTACT_RATE_LIMIT.windowMs,
      );
      await assertOpaqueIdentifierRateLimit(
        session.user.id,
        "contact_submit",
        CONTACT_ACCOUNT_RATE_LIMIT.limit,
        CONTACT_ACCOUNT_RATE_LIMIT.windowMs,
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Too many support requests. Please try again later.");
      }
      throw error;
    }

    const [inquiry] = await getDb()
      .insert(contactInquiries)
      .values({
        email: session.user.email,
        category: requestBody.category,
        message: requestBody.message,
      })
      .returning({ id: contactInquiries.id });

    void sendOperatorAlert("New contact request", [
      `Inquiry ID: ${inquiry.id}`,
      `User ID: ${session.user.id}`,
      `Email: ${session.user.email}`,
      `Category: ${CONTACT_CATEGORY_LABELS[requestBody.category]}`,
      "",
      "Message:",
      requestBody.message,
    ]);

    logInfo("contact.submitted", { inquiryId: inquiry.id });
    return jsonOk({ submitted: true, inquiryId: inquiry.id });
  });
}
