import { JobRestartPolicy } from "@livekit/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createDispatch = vi.fn(async () => ({}));
const createSipParticipant = vi.fn(async (..._args: unknown[]) => ({}));
const deleteRoom = vi.fn(async () => undefined);
const connectTwilioCall = vi.fn(async (..._args: unknown[]) => ({ connectUrl: "wss://example.livekit.cloud/twilio/abc" }));

vi.mock("livekit-server-sdk", () => ({
  AgentDispatchClient: class { createDispatch = createDispatch; },
  RoomServiceClient: class { deleteRoom = deleteRoom; },
  SipClient: class { createSipParticipant = createSipParticipant; },
  ConnectorClient: class { connectTwilioCall = connectTwilioCall; },
}));

const config = { url: "wss://example.livekit.cloud", apiKey: "key", apiSecret: "secret", agentName: "vranceflex-caller" };
const request = {
  callId: "11111111-1111-4111-8111-111111111111",
  to: "+14155550111",
  sip: { address: "sip.telnyx.com", username: "u", password: "p", callerNumber: "+14155550100" },
  ringSeconds: 30,
  metadata: { callId: "11111111-1111-4111-8111-111111111111", lineType: "sip" as const, level: "meetings" as const, instructions: "x", openingLine: "y", maxSeconds: 900, reportUrl: "https://app.example.com/r" },
};

describe("LiveKit dialer (SIP line)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches the agent so it is never restarted, which would repeat the AI disclosure", async () => {
    const { createLiveKitDialer } = await import("./voice-dialer");
    await createLiveKitDialer(config).dial(request);
    expect(createDispatch).toHaveBeenCalledTimes(1);
    const [room, agentName, options] = createDispatch.mock.calls[0] as unknown as [string, string, { restartPolicy: number; metadata: string }];
    expect(room).toBe(`call-${request.callId}`);
    expect(agentName).toBe("vranceflex-caller");
    expect(options.restartPolicy).toBe(JobRestartPolicy.JRP_NEVER);
    expect(JSON.parse(options.metadata)).toMatchObject({ callId: request.callId, maxSeconds: 900, lineType: "sip" });
  });

  it("carries the trunk with the call instead of storing one on LiveKit", async () => {
    const { createLiveKitDialer } = await import("./voice-dialer");
    const result = await createLiveKitDialer(config).dial({ ...request, destinationCountry: "GB" });
    expect(result).toMatchObject({ status: "answered" });
    const [trunkId, to, room, options, trunk] = createSipParticipant.mock.calls[0] as unknown as [string, string, string, Record<string, unknown>, { hostname: string; authUsername: string; authPassword: string; destinationCountry: string }];
    expect(trunkId).toBe("");
    expect(to).toBe("+14155550111");
    expect(room).toBe(`call-${request.callId}`);
    expect(options).toMatchObject({ fromNumber: "+14155550100", waitUntilAnswered: true, ringingTimeout: 30, maxCallDuration: 900, krispEnabled: true });
    expect(trunk).toMatchObject({ hostname: "sip.telnyx.com", authUsername: "u", authPassword: "p", destinationCountry: "GB" });
  });

  it("closes the room when nobody answers, and says it was about the person", async () => {
    createSipParticipant.mockRejectedValueOnce(Object.assign(new Error("busy"), { sipStatusCode: 486 }));
    const { createLiveKitDialer } = await import("./voice-dialer");
    const result = await createLiveKitDialer(config).dial(request);
    expect(result).toMatchObject({ status: "not_answered", reason: "busy", kind: "no_answer", sipStatus: 486 });
    expect(deleteRoom).toHaveBeenCalledWith(`call-${request.callId}`);
  });

  it("says when the carrier refused the call", async () => {
    createSipParticipant.mockRejectedValueOnce(Object.assign(new Error("forbidden"), { sipStatusCode: 403 }));
    const { createLiveKitDialer } = await import("./voice-dialer");
    expect(await createLiveKitDialer(config).dial(request)).toMatchObject({ kind: "line_failure", sipStatus: 403 });
  });
});

describe("what a SIP status means", () => {
  it("separates the person from the line", async () => {
    const { classifySipStatus } = await import("./voice-dialer");
    for (const status of [486, 603, 408, 480, 487, 404, 410, 600, undefined]) expect(classifySipStatus(status)).toBe("no_answer");
    for (const status of [401, 402, 403, 407, 500, 502, 503, 504]) expect(classifySipStatus(status)).toBe("line_failure");
  });
});

describe("LiveKit Twilio connector", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches the agent in the same call, never restarting it, and returns Twilio's stream address", async () => {
    const { createLiveKitConnector } = await import("./voice-dialer");
    const result = await createLiveKitConnector(config).connectTwilioCall({ callId: request.callId, metadata: { ...request.metadata, lineType: "twilio" } });
    expect(result).toEqual({ room: `call-${request.callId}`, connectUrl: "wss://example.livekit.cloud/twilio/abc" });
    const [options] = connectTwilioCall.mock.calls[0] as unknown as [{ roomName: string; participantIdentity: string; agents: Array<{ agentName: string; metadata: string; restartPolicy: number }> }];
    expect(options).toMatchObject({ roomName: `call-${request.callId}`, participantIdentity: `callee-${request.callId}` });
    expect(options.agents[0]).toMatchObject({ agentName: "vranceflex-caller", restartPolicy: JobRestartPolicy.JRP_NEVER });
    expect(JSON.parse(options.agents[0]!.metadata)).toMatchObject({ lineType: "twilio", maxSeconds: 900 });
    expect(createDispatch).not.toHaveBeenCalled();
  });
});
