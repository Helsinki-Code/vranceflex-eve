/**
 * When is a call really answered? Decided here, away from LiveKit, so it can be
 * tested and so there is one definition.
 *
 *  - A SIP participant is created while the phone is still ringing. It is
 *    answered only when its `sip.callStatus` attribute becomes "active".
 *  - A Twilio connector participant is hidden until the person accepts the
 *    call, so when it exists the call is already answered.
 *
 * Time on the call is charged from this moment, so ringing is never billed and
 * the AI disclosure is never spoken into a ringing phone.
 */

export const SIP_CALL_STATUS = "sip.callStatus";

export type ParticipantLine = "sip" | "connector" | "other";

export function isCallAnswered(input: { line: ParticipantLine; attributes: Record<string, string> | undefined }) {
  if (input.line === "connector") return true;
  return input.attributes?.[SIP_CALL_STATUS] === "active";
}

/** True when the call has already ended while we were still waiting for it to be answered. */
export function hasCallEnded(attributes: Record<string, string> | undefined) {
  return attributes?.[SIP_CALL_STATUS] === "hangup";
}

/** How long to wait for the other person to speak first before the disclosure goes out anyway. */
export const GREETING_WAIT_MS = 2_500;
/** If they start speaking, how long to let them finish before the disclosure goes out. */
export const GREETING_MAX_MS = 6_000;

/**
 * Decides when to say the disclosure. People answer a phone with "Hello?", so
 * the agent lets that happen first: it speaks after the person's first words
 * finish, or after a short silence if they say nothing. Pure: it is given the
 * clock and the events, and returns when to speak.
 */
export class GreetingGate {
  private spokeAt: number | null = null;
  private doneAt: number | null = null;

  constructor(private readonly startedAt: number) {}

  /** The other person began speaking. */
  speechStarted(at: number) {
    this.spokeAt ??= at;
  }

  /** The other person stopped speaking (their first words are over). */
  speechEnded(at: number) {
    if (this.spokeAt !== null) this.doneAt ??= at;
  }

  /** Whether it is time to say the disclosure. */
  ready(now: number) {
    if (this.doneAt !== null) return true;
    if (this.spokeAt !== null) return now - this.spokeAt >= GREETING_MAX_MS;
    return now - this.startedAt >= GREETING_WAIT_MS;
  }
}

/**
 * What to do with LiveKit's voicemail-detection result (used on a SIP line, where nothing has
 * listened for voicemail before the agent does). A person, a menu we can't navigate, or a
 * greeting it couldn't classify all go on as a normal call: hanging up on a real person is worse
 * than a brief message to a machine. A recorded greeting or an unreachable mailbox ends the call
 * without a word, so the disclosure is never played into voicemail.
 */
export type AmdDecision = "continue" | "voicemail" | "unreachable";

export function amdDecision(category: string): AmdDecision {
  switch (category) {
    case "machine-vm":
      return "voicemail";
    case "machine-unavailable":
      return "unreachable";
    default:
      // human, machine-ivr (the Node SDK can't navigate menus), uncertain, or anything new.
      return "continue";
  }
}

/** How long to listen for a first word before treating a silent line as a person. */
export const AMD_NO_SPEECH_MS = 4_000;
