import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./request-security";

describe("assertSameOrigin", () => {
  it("accepts a matching browser origin", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://app.example.com/api/campaigns", {
          headers: { origin: "https://app.example.com" },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects a cross-site browser origin", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://app.example.com/api/campaigns", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toThrow(/origin is not allowed/i);
  });
});
