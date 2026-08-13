import { describe, expect, it } from "vitest";
import { normalizeLiveAvatarEmbedUrl } from "./live-avatar-embed-url";

describe("normalizeLiveAvatarEmbedUrl", () => {
  it("accepts LiveAvatar v1 embed URLs", () => {
    expect(normalizeLiveAvatarEmbedUrl(" https://embed.liveavatar.com/v1/demo-id ")).toBe(
      "https://embed.liveavatar.com/v1/demo-id",
    );
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "http://embed.liveavatar.com/v1/demo-id",
    "https://example.com/v1/demo-id",
    "https://embed.liveavatar.com/v2/demo-id",
  ])("rejects an unsafe or unsupported value: %s", (value) => {
    expect(normalizeLiveAvatarEmbedUrl(value)).toBeNull();
  });
});
