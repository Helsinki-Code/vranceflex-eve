import { describe, expect, it } from "vitest";
import { summarizeUsage } from "./usage";

describe("summarizeUsage", () => {
  it("adds up tokens, characters and heard audio across models", () => {
    expect(
      summarizeUsage([
        { type: "llm_usage", inputTokens: 3_000, outputTokens: 175 },
        { type: "llm_usage", inputTokens: 500, outputTokens: 20 },
        { type: "tts_usage", charactersCount: 600, audioDurationMs: 40_000 },
        { type: "stt_usage", audioDurationMs: 60_400 },
        { type: "eot_usage" },
        {},
      ]),
    ).toEqual({ llmInputTokens: 3_500, llmOutputTokens: 195, ttsCharacters: 600, sttSeconds: 60 });
  });

  it("is all zeros for a call that never spoke", () => {
    expect(summarizeUsage([])).toEqual({ llmInputTokens: 0, llmOutputTokens: 0, ttsCharacters: 0, sttSeconds: 0 });
  });
});
