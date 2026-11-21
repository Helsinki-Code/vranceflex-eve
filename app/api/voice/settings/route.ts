import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { getVoiceBalance } from "../../../../lib/server/voice-credits";
import { attestCallConsent, getVoiceSettings, pauseVoice, resumeVoice, updateVoiceSettings, voiceSettingsInputSchema } from "../../../../lib/server/voice-settings";

export async function GET() {
  try {
    const actor = await getApiActor();
    const [settings, balance] = await Promise.all([getVoiceSettings(actor.organizationId), getVoiceBalance(actor.organizationId)]);
    return NextResponse.json({ settings, balance: { ...balance, nextExpiry: balance.nextExpiry?.toISOString() ?? null } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    return NextResponse.json(await updateVoiceSettings(actor, voiceSettingsInputSchema.parse(await request.json())));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const actionSchema = z.object({ action: z.enum(["attest", "pause", "resume"]), reason: z.string().trim().max(300).optional() }).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { action, reason } = actionSchema.parse(await request.json());
    const settings = action === "attest" ? await attestCallConsent(actor) : action === "pause" ? await pauseVoice(actor, reason) : await resumeVoice(actor);
    return NextResponse.json(settings);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
