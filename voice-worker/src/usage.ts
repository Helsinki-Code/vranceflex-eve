/**
 * What a call used, boiled down to the few numbers that decide what it cost us: model tokens,
 * characters spoken, and seconds of audio heard. Stored with the call so margins can be checked
 * against real calls instead of estimates.
 */
export type CallUsage = {
  llmInputTokens: number;
  llmOutputTokens: number;
  ttsCharacters: number;
  sttSeconds: number;
};

type ModelUsageLike = { type?: string; inputTokens?: number; outputTokens?: number; charactersCount?: number; audioDurationMs?: number };

export function summarizeUsage(modelUsage: ModelUsageLike[]): CallUsage {
  const usage: CallUsage = { llmInputTokens: 0, llmOutputTokens: 0, ttsCharacters: 0, sttSeconds: 0 };
  for (const item of modelUsage) {
    if (item.type === "llm_usage") {
      usage.llmInputTokens += item.inputTokens ?? 0;
      usage.llmOutputTokens += item.outputTokens ?? 0;
    } else if (item.type === "tts_usage") {
      usage.ttsCharacters += item.charactersCount ?? 0;
    } else if (item.type === "stt_usage") {
      usage.sttSeconds += (item.audioDurationMs ?? 0) / 1_000;
    }
  }
  usage.sttSeconds = Math.round(usage.sttSeconds);
  return usage;
}
