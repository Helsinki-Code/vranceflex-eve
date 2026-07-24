import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDatabase } from "../../../../lib/server/database";
import {
  leads,
  outreachMessages,
} from "../../../../lib/server/database/schema";
import { suppressLeadForUnsubscribe } from "../../../../lib/server/suppression";

export const dynamic = "force-dynamic";

function confirmationPage() {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; color: #0d1e18;">
<h1 style="font-size: 20px;">You're unsubscribed</h1>
<p>You will not receive further outreach messages from this sender.</p>
</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
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

// Manual click from the footer link.
export async function GET(_request: Request, { params }: Params) {
  const { messageId } = await params;
  await unsubscribeByMessageId(messageId);
  return confirmationPage();
}

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post), sent by mailbox
// providers without the user visiting a page.
export async function POST(_request: Request, { params }: Params) {
  const { messageId } = await params;
  await unsubscribeByMessageId(messageId);
  return NextResponse.json({ ok: true });
}
