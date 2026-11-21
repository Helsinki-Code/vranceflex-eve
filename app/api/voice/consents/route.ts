import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { consentSources, recordCallConsent, revokeCallConsent } from "../../../../lib/server/voice-consent";

const recordSchema = z
  .object({
    leadIds: z.array(z.string().uuid()).min(1).max(200),
    source: z.enum(consentSources),
    evidence: z.string().trim().min(15, "Say where and when they agreed (at least a sentence).").max(1_000),
    grantedAt: z.string().datetime().optional(),
  })
  .strict();

/** Records consent for one or many leads that share the same evidence (for example one web form). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = recordSchema.parse(await request.json());
    const recorded: string[] = [];
    const failed: Array<{ leadId: string; reason: string }> = [];
    for (const leadId of input.leadIds) {
      try {
        await recordCallConsent(actor, { leadId, source: input.source, evidence: input.evidence, grantedAt: input.grantedAt });
        recorded.push(leadId);
      } catch (error) {
        failed.push({ leadId, reason: error instanceof Error ? error.message : "Could not record consent." });
      }
    }
    return NextResponse.json({ recorded: recorded.length, failed });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const revokeSchema = z.object({ leadId: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).strict();

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { leadId, reason } = revokeSchema.parse(await request.json());
    return NextResponse.json(await revokeCallConsent(actor, leadId, reason));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
