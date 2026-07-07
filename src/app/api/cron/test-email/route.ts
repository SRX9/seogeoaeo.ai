// Manual test endpoint for the Cloudflare `send_email` binding. Gated behind the
// CRON_SECRET so it can't be hit publicly. The recipient comes from `?to=` —
// in the real flow it's resolved from the DB (the workspace owner, via
// getWorkspaceOwnerEmail). Only works on the Cloudflare runtime where the
// EMAIL binding exists (deployed worker or `pnpm preview:cf`), not in `next dev`.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://seogeoaeo.ai/api/cron/test-email?to=you@example.com"
import { NextResponse } from "next/server";
import { EMAIL_FROM, isEmailConfigured, sendEmail } from "@/lib/email/send";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) {
    return true;
  }

  return request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = new URL(request.url).searchParams.get("to")?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json(
      { error: "Pass the recipient as ?to=you@example.com" },
      { status: 400 },
    );
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "EMAIL binding not available — run on Cloudflare (deploy or `pnpm preview:cf`).",
      },
      { status: 503 },
    );
  }

  // Always return JSON so the real failure is visible instead of a bare 500.
  try {
    const sent = await sendEmail({
      to,
      subject: "Test email from Claudia 👋",
      html: `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#14161f;">
        <h1 style="margin:0 0 12px;">Hi from Claudia 👋</h1>
        <p>If you're reading this, the Cloudflare <code>send_email</code> binding is wired up correctly.</p>
        <p style="color:#6b7388;">— Claudia, your content agent at seogeoaeo.ai</p>
      </body></html>`,
      text: "Hi from Claudia! If you're reading this, the Cloudflare send_email binding is wired up correctly. — Claudia, your content agent at seogeoaeo.ai",
    });
    return NextResponse.json({ ok: sent, to, from: EMAIL_FROM });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      to,
      from: EMAIL_FROM,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6) : undefined,
    });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
