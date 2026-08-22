import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/server/database";
import {
  leads,
  outreachMessages,
} from "../../../../lib/server/database/schema";
import { suppressLeadForUnsubscribe } from "../../../../lib/server/suppression";

export const dynamic = "force-dynamic";

function confirmationPage(completed = false) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${completed ? "Unsubscribed" : "Confirm unsubscribe"}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #0d1e18;">
<h1 style="font-size: 20px;">${completed ? "You're unsubscribed" : "Stop future outreach?"}</h1>
<p>${completed ? "You will not receive further outreach messages from this sender." : "Confirm below to permanently unsubscribe this address."}</p>
${completed ? "" : '<form method="post"><input type="hidden" name="confirm" value="1"><button type="submit" style="border:0;border-radius:10px;background:#173f2b;color:white;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer">Confirm unsubscribe</button></form>'}
</body></html>`,
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

async function unsubscribeByMessageId(messageId: string) {
  const database = getDatabase();
  const [context] = await database
    .select({
      organizationId: outreachMessages.organizationId,
      campaignId: outreachMessages.campaignId,
      leadId: outreachMessages.leadId,
      email: leads.email,
    })
    .from(outreachMessages)
    .innerJoin(leads, eq(outreachMessages.leadId, leads.id))
    .where(eq(outreachMessages.id, messageId))
    .limit(1);
  if (!context || !context.email) return;

  await database.transaction(async (transaction) => {
    await suppressLeadForUnsubscribe(transaction, {
      organizationId: context.organizationId,
      leadId: context.leadId,
      email: context.email!,
      source: "one_click_unsubscribe",
      campaignId: context.campaignId,
    });
  });
}

type Params = { params: Promise<{ messageId: string }> };

// Manual link scanners and preview bots often issue GET requests. Render an
// explicit confirmation instead of letting a crawler suppress a real lead.
export async function GET(_request: Request, { params }: Params) {
  return confirmationPage();
}

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post), sent by mailbox
// providers without the user visiting a page.
export async function POST(request: Request, { params }: Params) {
  const { messageId } = await params;
  await unsubscribeByMessageId(messageId);
  if (request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    return confirmationPage(true);
  }
  return NextResponse.json({ ok: true });
}
