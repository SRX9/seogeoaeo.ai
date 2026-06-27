import { NextResponse } from "next/server";
import { runWeeklyCron } from "@/lib/jobs/weekly";

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

  const results = await runWeeklyCron();
  return NextResponse.json({ ok: true, results });
}

export async function POST(request: Request) {
  return GET(request);
}
