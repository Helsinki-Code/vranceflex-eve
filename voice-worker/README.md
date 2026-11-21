# VranceFlex voice worker

The always-on process that holds the AI phone conversations. The VranceFlex app
decides who to call, checks consent and calling hours, builds the script and
places the call; this worker only talks. Each call arrives as a LiveKit agent
job, and its result goes back to the app as a signed report.

It can't run on Vercel (it needs a long-running process). Run it anywhere that
runs a container, or on LiveKit Cloud's agent hosting.

## Two kinds of phone line

A workspace connects one of these in Settings → Voice.

| | Twilio account (recommended) | SIP trunk (another carrier) |
|---|---|---|
| What the customer gives us | Account SID, a **restricted** API key (Calls: create/read/update; Incoming Phone Numbers: read), and a number. Never the Auth Token. | The carrier's SIP host, a username and password, and a number. |
| Who places the call | Twilio, from the app (`calls.create`). | LiveKit, over the trunk details sent with each call. |
| Voicemail | Twilio detects it **before** the call reaches LiveKit; the app hangs up. No room, agent or model is used and nothing is charged. | The agent listens to the greeting first (LiveKit's detector) and ends the call without speaking if it is a recording. |
| Needs LiveKit Cloud | Yes (the Twilio connector is Cloud-only). | No. |
| Billing | Once the worker's report and Twilio's "completed" have both arrived; never more than either says the call lasted. | From the worker's answer time to the end of the call. |

## What it does on every call

- Does nothing, and counts no time, until the call is really answered (for SIP:
  the participant's `sip.callStatus` becomes `active`; for Twilio: the call is
  bridged only after a person picks up).
- Lets the person say "Hello?", then says the AI disclosure word for word, and
  can't be interrupted during it. The model never replies before the disclosure.
- Ends the call at once if the other person asks to stop, in code, whatever the
  model would have done. The app then removes the number, withdraws consent and
  stops email to that person.
- Wraps up 45 seconds before the call's time cap so it never ends mid-sentence.
- Records no audio. The only record of a call is the transcript the app stores.
- Always sends a report (outcome, summary, transcript, what the call used), even
  if the call drops. The agent is dispatched with "never restart", so a crash can't
  make it say the disclosure a second time; the app closes the call out instead.

## Setup

1. Create a LiveKit Cloud project and note its URL, API key and API secret.
2. Set these on the **worker**:

   | Variable | What it is |
   |---|---|
   | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Your LiveKit project. Injected for you on LiveKit Cloud. |
   | `LIVEKIT_AGENT_NAME` | Defaults to `vranceflex-caller`. Must match the app. |
   | `VOICE_WORKER_SECRET` | A long random string, **also set on the app**. Signs every report and every Twilio callback URL. |
   | `VOICE_STT`, `VOICE_LLM`, `VOICE_TTS` | Optional. LiveKit Inference models. Defaults: `deepgram/nova-3:en`, `openai/gpt-4.1-mini`, `cartesia/sonic-3:<voice>`. |

   By default the worker uses **LiveKit Inference**: no Deepgram or OpenAI keys, one
   bill on LiveKit Cloud. To use your own keys instead (for example with a
   self-hosted LiveKit server), set `VOICE_MODELS=plugins` and also `DEEPGRAM_API_KEY`,
   `OPENAI_API_KEY`, and optionally `VOICE_LLM_MODEL` / `VOICE_TTS_VOICE`
   (defaults `gpt-4o-mini` and `alloy`).

3. Set these on the **app**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
   `LIVEKIT_AGENT_NAME`, `VOICE_WORKER_SECRET`, and `APP_BASE_URL`. `APP_BASE_URL` must be
   **publicly reachable**: the worker posts reports to it, and Twilio calls its
   `/api/voice/twilio/twiml` and `/api/voice/twilio/status` routes.
4. Optional on the app: `VOICE_PLATFORM_MAX_CONCURRENT_CALLS` (default 18). LiveKit
   limits agent sessions per project (20 on Ship, up to 600 on Scale), shared by every
   workspace; keep this just under your plan's limit. Twilio-connector calls have their
   own per-plan limit (20 on Ship) that the same ceiling stays under.
5. Build and run (from the repository root):

   ```bash
   docker build -f voice-worker/Dockerfile -t vranceflex-voice-worker .
   docker run --env-file voice.env vranceflex-voice-worker
   ```

   Locally: `cd voice-worker && npm install && npm run dev`.

### LiveKit Cloud hosting

LiveKit Cloud can host the worker (`lk agent deploy`), which keeps agents warm on paid
plans and makes turn detection and interruption handling free. It builds from the agent's
folder, but this worker imports the shared call rules from `../lib/domain`, so deploying
from `voice-worker/` alone needs those two files (`voice.ts`, `voice-signature.ts`) copied in
first. This hasn't been tried here. Until it is, the Docker image above is the supported way
to run it.

## What a call costs us

An answered minute is roughly the agent session ($0.01) + the connector or SIP fee
($0.004 on Ship) + speech-to-text (~$0.005) + a small model (~$0.002) + text-to-speech
($0.009 to $0.03), about **$0.03 to $0.05 per minute**, before the customer's own Twilio
bill. Each call's real usage (model tokens, characters spoken, seconds of audio heard) is
stored on the call (`voice_calls.usage`) so this can be checked against real calls.

## Testing without a phone

LiveKit's simulations can't set a job's metadata, and a job with none is refused (so the worker
never says or dials anything from guesswork). For simulations only, set
`VOICE_WORKER_TEST_METADATA` to a JSON call (the same shape the app sends: `callId`, `level`,
`instructions`, `openingLine`, `maxSeconds`, `reportUrl`, `lineType`) and the worker uses it
when a job has none. Don't set it in production. Use a `reportUrl` that doesn't exist, or the
test's report will reach your real app.

## Before you rely on it

This has been type-checked against the LiveKit Agents SDK and its call rules are
unit-tested, but it has **not** been run against a live LiveKit project, Twilio account or a
real phone call. Before launching, place test calls to your own phone and check:

- The disclosure comes after "Hello?", and never before the call is answered.
- A voicemail: on a Twilio line, no LiveKit room appears and nothing is charged; on a SIP
  line, the agent says nothing.
- The stop request, the wrap-up, a call nobody answers (billed 0) and that reports reach the app.
- Kill the worker mid-call: the disclosure is not repeated, and the call is closed out from
  Twilio's status callback.
- A wrong Twilio key: calling pauses with a clear message.
- How long a person waits between "Hello?" and the disclosure on a Twilio line (voicemail
  detection runs first). If it feels slow, dispatch the agent before dialing instead.
- What the Twilio connector supports beyond audio: LiveKit's docs don't say whether voicemail
  detection, DTMF, transfers or recording work over it. We rely only on audio.
- Have a lawyer review the consent flow, the disclosure and the scripts for the countries you call.
