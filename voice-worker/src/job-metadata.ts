import { z } from "zod";

/**
 * Everything about a call arrives in the job metadata, set by the app when it dispatches the
 * agent. The script and the opening line are built on the server, never here.
 */
export const metadataSchema = z.object({
  callId: z.string().uuid(),
  level: z.enum(["meetings", "qualify", "sell"]),
  instructions: z.string().min(1),
  openingLine: z.string().min(1),
  maxSeconds: z.number().int().positive(),
  reportUrl: z.string().url(),
  // A Twilio-line call has already been checked for voicemail by Twilio before it reached us.
  lineType: z.enum(["twilio", "sip"]).default("sip"),
});
export type JobMetadata = z.infer<typeof metadataSchema>;

/**
 * Reads the call's metadata. A job with none (for example a LiveKit simulation, which can't set
 * metadata) is refused, so nothing is ever said or dialed from guesswork. For testing only,
 * VOICE_WORKER_TEST_METADATA supplies metadata when a job has none.
 */
export function resolveJobMetadata(raw: string | undefined, env: Record<string, string | undefined> = process.env): JobMetadata {
  const given = raw?.trim();
  const source = given || env.VOICE_WORKER_TEST_METADATA?.trim();
  if (!source) throw new Error("This job has no call metadata, so there is nothing to say or dial.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("The call metadata isn't valid JSON.");
  }
  return metadataSchema.parse(parsed);
}
