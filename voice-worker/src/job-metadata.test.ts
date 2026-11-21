import { describe, expect, it } from "vitest";
import { resolveJobMetadata } from "./job-metadata";

const metadata = {
  callId: "11111111-1111-4111-8111-111111111111",
  level: "meetings",
  instructions: "Be brief.",
  openingLine: "Hi, this is an AI assistant.",
  maxSeconds: 900,
  reportUrl: "https://app.example.com/api/voice/worker/report",
};

describe("resolveJobMetadata", () => {
  it("reads the call's metadata, assuming a SIP line for calls placed before the line type existed", () => {
    expect(resolveJobMetadata(JSON.stringify(metadata), {})).toMatchObject({ callId: metadata.callId, level: "meetings", lineType: "sip" });
    expect(resolveJobMetadata(JSON.stringify({ ...metadata, lineType: "twilio" }), {}).lineType).toBe("twilio");
  });

  it("refuses a job with no metadata, so nothing is said or dialed from guesswork", () => {
    expect(() => resolveJobMetadata("", {})).toThrow(/no call metadata/);
    expect(() => resolveJobMetadata(undefined, {})).toThrow(/no call metadata/);
    expect(() => resolveJobMetadata("   ", {})).toThrow(/no call metadata/);
  });

  it("uses the test metadata only when the job has none", () => {
    const env = { VOICE_WORKER_TEST_METADATA: JSON.stringify({ ...metadata, instructions: "Test script." }) };
    expect(resolveJobMetadata("", env).instructions).toBe("Test script.");
    expect(resolveJobMetadata(JSON.stringify(metadata), env).instructions).toBe("Be brief.");
  });

  it("rejects metadata that is malformed or incomplete", () => {
    expect(() => resolveJobMetadata("{not json", {})).toThrow(/valid JSON/);
    expect(() => resolveJobMetadata(JSON.stringify({ ...metadata, callId: "nope" }), {})).toThrow();
    expect(() => resolveJobMetadata(JSON.stringify({ ...metadata, maxSeconds: 0 }), {})).toThrow();
  });
});
