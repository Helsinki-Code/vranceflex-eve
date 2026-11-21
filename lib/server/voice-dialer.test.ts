import { JobRestartPolicy } from "@livekit/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createDispatch = vi.fn(async () => ({}));
const createSipParticipant = vi.fn(async () => ({}));
const deleteRoom = vi.fn(async () => undefined);

vi.mock("livekit-server-sdk", () => ({
  AgentDispatchClient: class { createDispatch = createDispatch; },
  RoomServiceClient: class { deleteRoom = deleteRoom; },
  SipClient: class { createSipParticipant = createSipParticipant; createSipOutboundTrunk = vi.fn(); deleteSipTrunk = vi.fn(); },
}));

const config = { url: "wss://example.livekit.cloud", apiKey: "key", apiSecret: "secret", agentName: "vranceflex-caller" };
const request = {
  callId: "11111111-1111-4111-8111-111111111111",
  to: "+14155550111",
  sip: { address: "acme.pstn.twilio.com", username: "u", password: "p", callerNumber: "+14155550100" },
  trunkId: "ST_1",
  ringSeconds: 30,
  metadata: { callId: "11111111-1111-4111-8111-111111111111", level: "meetings" as const, instructions: "x", openingLine: "y", maxSeconds: 900, reportUrl: "https://app.example.com/r" },
};

describe("LiveKit dialer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches the agent so it is never restarted, which would repeat the AI disclosure", async () => {
    const { createLiveKitDialer } = await import("./voice-dialer");
    await createLiveKitDialer(config).dial(request);
    expect(createDispatch).toHaveBeenCalledTimes(1);
    const [room, agentName, options] = createDispatch.mock.calls[0] as unknown as [string, string, { restartPolicy: number; metadata: string }];
    expect(room).toBe(`call-${request.callId}`);
    expect(agentName).toBe("vranceflex-caller");
    expect(options.restartPolicy).toBe(JobRestartPolicy.JRP_NEVER);
    expect(JSON.parse(options.metadata)).toMatchObject({ callId: request.callId, maxSeconds: 900 });
  });

  it("caps the call at the minutes available and waits for it to be answered", async () => {
    const { createLiveKitDialer } = await import("./voice-dialer");
    const result = await createLiveKitDialer(config).dial(request);
    expect(result).toMatchObject({ status: "answered" });
    const call = createSipParticipant.mock.calls[0] as unknown as unknown[];
    expect(call[3]).toMatchObject({ waitUntilAnswered: true, ringingTimeout: 30, maxCallDuration: 900 });
  });

  it("closes the room when nobody answers", async () => {
    createSipParticipant.mockRejectedValueOnce(new Error("busy"));
    const { createLiveKitDialer } = await import("./voice-dialer");
    const result = await createLiveKitDialer(config).dial(request);
    expect(result).toMatchObject({ status: "not_answered", reason: "busy" });
    expect(deleteRoom).toHaveBeenCalledWith(`call-${request.callId}`);
  });
});
