/**
 * Which speech and language models the worker uses, chosen by environment.
 *
 * "inference" (the default) uses LiveKit Inference: no separate Deepgram or OpenAI keys, one bill
 * on LiveKit Cloud, and turn detection included for agents hosted there. It needs a LiveKit Cloud
 * project. "plugins" talks to Deepgram and OpenAI directly with your own keys, for a self-hosted
 * LiveKit server. The model names are LiveKit Inference descriptors ("provider/model:option").
 */

export const DEFAULT_STT = "deepgram/nova-3:en";
export const DEFAULT_LLM = "openai/gpt-4.1-mini";
// Cartesia's "Jacqueline" voice: confident, young American adult female.
export const DEFAULT_TTS = "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";

export type ModelChoice =
  | { mode: "inference"; stt: string; llm: string; tts: string }
  | { mode: "plugins"; llm: string; ttsVoice: string };

export function voiceModelsFromEnv(env: Record<string, string | undefined> = process.env): ModelChoice {
  const pick = (name: string) => env[name]?.trim() || undefined;
  if (pick("VOICE_MODELS")?.toLowerCase() === "plugins") {
    return { mode: "plugins", llm: pick("VOICE_LLM_MODEL") ?? "gpt-4o-mini", ttsVoice: pick("VOICE_TTS_VOICE") ?? "alloy" };
  }
  return { mode: "inference", stt: pick("VOICE_STT") ?? DEFAULT_STT, llm: pick("VOICE_LLM") ?? DEFAULT_LLM, tts: pick("VOICE_TTS") ?? DEFAULT_TTS };
}
