# VranceFlex voice worker

The always-on process that holds the AI phone conversations. The VranceFlex app
decides who to call, checks consent and calling hours, builds the script and
places the call; this worker only talks. Each call arrives as a LiveKit agent
job, and its result goes back to the app as a signed report.

It can't run on Vercel (it needs a long-running process). Run it anywhere that
runs a container, or on LiveKit Cloud's agent hosting.

## What it does on every call

- Says the AI disclosure first, word for word, and can't be interrupted during it.
- Ends the call at once if the other person asks to stop, in code, whatever the
  model would have done. The app then removes the number, withdraws consent and
  stops email to that person.
- Wraps up 45 seconds before the call's time cap so it never ends mid-sentence.
- Always sends a report (outcome, summary, transcript), even if the call drops.

## Setup

1. Create a LiveKit project and note its URL, API key and API secret.
2. Set these on the **worker**:

   | Variable | What it is |
   |---|---|
   | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Your LiveKit project |
   | `LIVEKIT_AGENT_NAME` | Defaults to `vranceflex-caller`. Must match the app. |
   | `VOICE_WORKER_SECRET` | A long random string, **also set on the app**. Signs every report. |
   | `DEEPGRAM_API_KEY` | Speech to text |
   | `OPENAI_API_KEY` | The language model and the voice |
   | `VOICE_LLM_MODEL`, `VOICE_TTS_VOICE` | Optional. Default `gpt-4o-mini` and `alloy`. |

3. Set these on the **app**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
   `LIVEKIT_AGENT_NAME`, `VOICE_WORKER_SECRET`, and `APP_BASE_URL` (the public URL
   the worker posts reports to).
4. Build and run (from the repository root):

   ```bash
   docker build -f voice-worker/Dockerfile -t vranceflex-voice-worker .
   docker run --env-file voice.env vranceflex-voice-worker
   ```

   Locally: `cd voice-worker && npm install && npm run dev`.

## Before you rely on it

This worker has been type-checked against the LiveKit Agents SDK and its call
rules are unit-tested, but it has **not** been run against a live LiveKit
project or a real phone call. Before launching:

- Place test calls to your own phone and check: the disclosure, the stop request,
  voicemail handling, the wrap-up and that reports reach the app.
- Choose and test your speech and language models for latency; they are
  configurable above, and the defaults are only a starting point.
- Have a lawyer review the consent flow and the scripts for the countries you call.
