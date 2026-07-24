import { NextResponse } from "next/server";
import { removeExpiredAuthRecords } from "../../../../lib/server/auth-store";
import { processDueDeliveryJobs } from "../../../../lib/server/delivery-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const delivery = await processDueDeliveryJobs();
    const authCleanup = await removeExpiredAuthRecords();
    return NextResponse.json({ ...delivery, authCleanup });
  } catch {
    return NextResponse.json(
      { error: "The delivery worker could not complete this run." },
      { status: 500 },
    );
  }
}
