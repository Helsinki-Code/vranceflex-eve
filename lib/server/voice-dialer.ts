import { ConnectTwilioCallRequest_TwilioCallDirection, JobRestartPolicy, RoomAgentDispatch, SIPOutboundConfig, SIPTransport } from "@livekit/protocol";
import { AgentDispatchClient, ConnectorClient, RoomServiceClient, SipClient } from "livekit-server-sdk";

/**
 * The boundary with LiveKit. Everything above this file works with a plain
 * interface, so call scheduling, billing and review are tested without a phone.
 *
 * A call on a SIP line is: create a room, dispatch the voice agent into it with the call's
 * context, then have LiveKit dial the number over the customer's SIP trunk and wait until it's
 * answered (or fails). The trunk's details travel with each call (LiveKit's "inline trunk"),
 * so there is nothing to create, store or clean up on LiveKit for a workspace.
 */

export type SipConnection = {
  /** The carrier's SIP host, for example "acme.pstn.twilio.com" or "sip.telnyx.com". */
  address: string;
  username: string;
  password: string;
  callerNumber: string;
};

export type CallJobMetadata = {
  callId: string;
  level: "meetings" | "qualify" | "sell";
  /** The instructions and opening line are built server-side, never in the worker. */
  instructions: string;
  openingLine: string;
  /** The hard cap on this call, in seconds. */
  maxSeconds: number;
  /** Where the worker reports results. */
  reportUrl: string;
  /** How the call is placed. A SIP line has no voicemail detection before the agent, so the agent does it. */
  lineType: "twilio" | "sip";
};

export type DialRequest = {
  callId: string;
  to: string;
  sip: SipConnection;
  metadata: CallJobMetadata;
  ringSeconds: number;
  /** ISO 3166-1 alpha-2, so LiveKit can route the call in the right region. Optional. */
  destinationCountry?: string;
};

export type DialResult =
  | { status: "answered"; room: string }
  | {
      status: "not_answered";
      room: string;
      reason: string;
      /** "line_failure": the carrier refused or couldn't carry the call (bad credentials, outage), not the person. */
      kind: "no_answer" | "line_failure";
      sipStatus?: number;
    };

/**
 * What a SIP response code means for us. 486 (busy), 603 (declined), 480/408 (unavailable, no
 * answer) and the like are about the person. 5xx and authentication refusals (401, 403, 407) are
 * about the line: the same call would fail for everyone until the customer fixes it.
 */
export function classifySipStatus(status: number | undefined): "no_answer" | "line_failure" {
  if (status === undefined) return "no_answer";
  // 5xx is the carrier failing; 6xx (600 busy everywhere, 603 declined, 604 doesn't exist) is the person.
  if ((status >= 500 && status < 600) || status === 401 || status === 402 || status === 403 || status === 407) return "line_failure";
  return "no_answer";
}

export interface VoiceDialer {
  dial(request: DialRequest): Promise<DialResult>;
  /** Ends a call in progress, for example when the caller asked to stop. */
  hangUp(room: string): Promise<void>;
}

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string; agentName: string };

export function liveKitConfigFromEnv(env: Record<string, string | undefined> = process.env): LiveKitConfig | null {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret, agentName: env.LIVEKIT_AGENT_NAME?.trim() || "vranceflex-caller" };
}

export function roomNameForCall(callId: string) {
  return `call-${callId}`;
}

export function createLiveKitDialer(config: LiveKitConfig): VoiceDialer {
  const sip = new SipClient(config.url, config.apiKey, config.apiSecret);
  const dispatch = new AgentDispatchClient(config.url, config.apiKey, config.apiSecret);
  const rooms = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);

  return {
    async dial(request) {
      const room = roomNameForCall(request.callId);
      // Never restart the agent if it crashes: a restarted agent would say the AI disclosure a
      // second time to someone already mid-call. A crashed call is closed out by the app instead.
      await dispatch.createDispatch(room, config.agentName, {
        metadata: JSON.stringify(request.metadata),
        restartPolicy: JobRestartPolicy.JRP_NEVER,
      });
      try {
        await sip.createSipParticipant(
          "", // no stored trunk: this call carries its own trunk details
          request.to,
          room,
          {
            participantIdentity: `callee-${request.callId}`,
            participantName: "Prospect",
            fromNumber: request.sip.callerNumber,
            waitUntilAnswered: true,
            ringingTimeout: request.ringSeconds,
            // LiveKit ends the call at the cap, so a call can never run past the minutes available.
            maxCallDuration: request.metadata.maxSeconds,
            krispEnabled: true,
          },
          new SIPOutboundConfig({
            hostname: request.sip.address,
            transport: SIPTransport.SIP_TRANSPORT_AUTO,
            authUsername: request.sip.username,
            authPassword: request.sip.password,
            ...(request.destinationCountry ? { destinationCountry: request.destinationCountry } : {}),
          }),
        );
        return { status: "answered", room };
      } catch (error) {
        // Not answered, busy, rejected, timed out, or the line refused it: the room is no use any more.
        await rooms.deleteRoom(room).catch(() => undefined);
        const sipStatus = typeof (error as { sipStatusCode?: unknown })?.sipStatusCode === "number" ? (error as { sipStatusCode: number }).sipStatusCode : undefined;
        return { status: "not_answered", room, reason: error instanceof Error ? error.message : "The call was not answered.", kind: classifySipStatus(sipStatus), sipStatus };
      }
    },

    async hangUp(room) {
      await rooms.deleteRoom(room);
    },
  };
}

/**
 * The Twilio connector: LiveKit hands back a WebSocket address that Twilio streams the call's
 * audio to, and dispatches the voice agent into the room. Only used once a person has answered,
 * so a call nobody picks up (or a voicemail) never touches LiveKit.
 */
export interface VoiceConnector {
  connectTwilioCall(input: { callId: string; metadata: CallJobMetadata; destinationCountry?: string }): Promise<{ room: string; connectUrl: string }>;
}

export function createLiveKitConnector(config: LiveKitConfig): VoiceConnector {
  const connector = new ConnectorClient(config.url, config.apiKey, config.apiSecret);
  return {
    async connectTwilioCall({ callId, metadata, destinationCountry }) {
      const room = roomNameForCall(callId);
      const response = await connector.connectTwilioCall({
        twilioCallDirection: ConnectTwilioCallRequest_TwilioCallDirection.OUTBOUND,
        roomName: room,
        participantIdentity: `callee-${callId}`,
        participantName: "Prospect",
        ...(destinationCountry ? { destinationCountry } : {}),
        // Never restart the agent if it crashes: a restarted agent would say the AI disclosure again.
        agents: [new RoomAgentDispatch({ agentName: config.agentName, metadata: JSON.stringify(metadata), restartPolicy: JobRestartPolicy.JRP_NEVER })],
      });
      return { room, connectUrl: response.connectUrl };
    },
  };
}

export function unconfiguredConnector(): VoiceConnector {
  return { connectTwilioCall: () => Promise.reject(new Error("Voice calling isn't configured on this deployment (LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are missing).")) };
}

export function getVoiceConnector(env: Record<string, string | undefined> = process.env): VoiceConnector {
  const config = liveKitConfigFromEnv(env);
  return config ? createLiveKitConnector(config) : unconfiguredConnector();
}

/** A dialer for environments with no LiveKit: every call fails clearly instead of hanging. */
export function unconfiguredDialer(): VoiceDialer {
  const fail = () => Promise.reject(new Error("Voice calling isn't configured on this deployment (LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are missing)."));
  return { dial: fail, hangUp: fail };
}

export function getVoiceDialer(env: Record<string, string | undefined> = process.env): VoiceDialer {
  const config = liveKitConfigFromEnv(env);
  return config ? createLiveKitDialer(config) : unconfiguredDialer();
}
