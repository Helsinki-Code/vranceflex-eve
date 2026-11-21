import { ConnectTwilioCallRequest_TwilioCallDirection, JobRestartPolicy, RoomAgentDispatch, SIPTransport } from "@livekit/protocol";
import { AgentDispatchClient, ConnectorClient, RoomServiceClient, SipClient } from "livekit-server-sdk";

/**
 * The boundary with LiveKit. Everything above this file works with a plain
 * interface, so call scheduling, billing and review are tested without a phone.
 *
 * A call is: create a room, dispatch the voice agent into it with the call's
 * context, then have LiveKit dial the number over the customer's Twilio SIP
 * trunk and wait until it's answered (or fails).
 */

export type SipConnection = {
  /** The Twilio termination URI, for example "acme.pstn.twilio.com". */
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
};

export type DialRequest = {
  callId: string;
  to: string;
  sip: SipConnection;
  trunkId: string;
  metadata: CallJobMetadata;
  ringSeconds: number;
};

export type DialResult =
  | { status: "answered"; room: string }
  | { status: "not_answered"; room: string; reason: string };

export interface VoiceDialer {
  /** Creates (or replaces) the LiveKit outbound trunk for a workspace's SIP connection. */
  ensureTrunk(input: { organizationId: string; sip: SipConnection; existingTrunkId?: string | null }): Promise<string>;
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
    async ensureTrunk({ organizationId, sip: connection, existingTrunkId }) {
      // A trunk can't be edited in place when credentials change; replace it.
      if (existingTrunkId) await sip.deleteSipTrunk(existingTrunkId).catch(() => undefined);
      const trunk = await sip.createSipOutboundTrunk(`vranceflex-${organizationId}`, connection.address, [connection.callerNumber], {
        transport: SIPTransport.SIP_TRANSPORT_AUTO,
        authUsername: connection.username,
        authPassword: connection.password,
      });
      return trunk.sipTrunkId;
    },

    async dial(request) {
      const room = roomNameForCall(request.callId);
      // Never restart the agent if it crashes: a restarted agent would say the AI disclosure a
      // second time to someone already mid-call. A crashed call is closed out by the app instead.
      await dispatch.createDispatch(room, config.agentName, {
        metadata: JSON.stringify(request.metadata),
        restartPolicy: JobRestartPolicy.JRP_NEVER,
      });
      try {
        await sip.createSipParticipant(request.trunkId, request.to, room, {
          participantIdentity: `callee-${request.callId}`,
          participantName: "Prospect",
          waitUntilAnswered: true,
          ringingTimeout: request.ringSeconds,
          // LiveKit ends the call at the cap, so a call can never run past the minutes available.
          maxCallDuration: request.metadata.maxSeconds,
          krispEnabled: true,
        });
        return { status: "answered", room };
      } catch (error) {
        // Not answered, busy, rejected or timed out: the room is no use any more.
        await rooms.deleteRoom(room).catch(() => undefined);
        return { status: "not_answered", room, reason: error instanceof Error ? error.message : "The call was not answered." };
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
  return { ensureTrunk: fail, dial: fail, hangUp: fail };
}

export function getVoiceDialer(env: Record<string, string | undefined> = process.env): VoiceDialer {
  const config = liveKitConfigFromEnv(env);
  return config ? createLiveKitDialer(config) : unconfiguredDialer();
}
