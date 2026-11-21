import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import {
  addCallTargets,
  approvalBlockers,
  approveVoiceCampaign,
  cancelVoiceCampaign,
  pauseVoiceCampaign,
  startVoiceCampaign,
  updateVoiceCampaign,
  voiceCampaignPatchSchema,
} from "../../../../../lib/server/voice-campaigns";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { id } = await params;
    await updateVoiceCampaign(actor, id, voiceCampaignPatchSchema.parse(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("pause"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("add_targets"), leadIds: z.array(z.string().uuid()).max(500).optional() }),
  z.object({ action: z.literal("check") }),
]);

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { id } = await params;
    const body = actionSchema.parse(await request.json());
    switch (body.action) {
      case "approve":
        await approveVoiceCampaign(actor, id);
        return NextResponse.json({ ok: true });
      case "start":
        await startVoiceCampaign(actor, id);
        return NextResponse.json({ ok: true });
      case "pause":
        await pauseVoiceCampaign(actor, id, body.reason);
        return NextResponse.json({ ok: true });
      case "cancel":
        await cancelVoiceCampaign(actor, id);
        return NextResponse.json({ ok: true });
      case "add_targets":
        return NextResponse.json(await addCallTargets(actor, id, body.leadIds));
      case "check":
        return NextResponse.json({ blockers: await approvalBlockers(actor.organizationId, id) });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
