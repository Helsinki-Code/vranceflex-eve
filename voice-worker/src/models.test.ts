import { describe, expect, it } from "vitest";
import { DEFAULT_LLM, DEFAULT_STT, DEFAULT_TTS, voiceModelsFromEnv } from "./models";

describe("voiceModelsFromEnv", () => {
  it("uses LiveKit Inference by default, so no separate speech or model keys are needed", () => {
    expect(voiceModelsFromEnv({})).toEqual({ mode: "inference", stt: DEFAULT_STT, llm: DEFAULT_LLM, tts: DEFAULT_TTS });
    expect(DEFAULT_STT).toBe("deepgram/nova-3:en");
    expect(DEFAULT_TTS).toMatch(/^cartesia\/sonic-3:[0-9a-f-]{36}$/);
  });

  it("lets each model be changed, ignoring blanks", () => {
    expect(voiceModelsFromEnv({ VOICE_STT: "assemblyai/universal-streaming", VOICE_LLM: "  ", VOICE_TTS: "inworld/inworld-tts-1.5-mini:Ashley" })).toEqual({
      mode: "inference", stt: "assemblyai/universal-streaming", llm: DEFAULT_LLM, tts: "inworld/inworld-tts-1.5-mini:Ashley",
    });
  });

  it("talks to Deepgram and OpenAI directly for a self-hosted LiveKit server", () => {
    expect(voiceModelsFromEnv({ VOICE_MODELS: "plugins" })).toEqual({ mode: "plugins", llm: "gpt-4o-mini", ttsVoice: "alloy" });
    expect(voiceModelsFromEnv({ VOICE_MODELS: "Plugins", VOICE_LLM_MODEL: "gpt-4.1-mini", VOICE_TTS_VOICE: "nova" })).toEqual({ mode: "plugins", llm: "gpt-4.1-mini", ttsVoice: "nova" });
  });
});
