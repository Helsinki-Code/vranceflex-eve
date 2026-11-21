import { describe, expect, it } from "vitest";
import { assessRecipientRegion } from "./compliance-rules";

describe("assessRecipientRegion", () => {
  it("allows the United States by default", () => {
    expect(assessRecipientRegion("US", [])).toEqual({ outcome: "ok", country: "US" });
  });

  it("allows an unknown country, since there is nothing to check", () => {
    expect(assessRecipientRegion(null, [])).toEqual({ outcome: "ok", country: null });
    expect(assessRecipientRegion(undefined, [])).toEqual({ outcome: "ok", country: null });
  });

  it.each(["GB", "DE", "FR", "CA", "AU", "IN"])("holds %s until an admin confirms it", (country) => {
    const result = assessRecipientRegion(country, []);
    expect(result.outcome).toBe("review");
    if (result.outcome === "review") {
      expect(result.country).toBe(country);
      expect(result.message).toMatch(/Confirm yours for .* in Settings/);
    }
  });

  it("names the country in the message", () => {
    const result = assessRecipientRegion("DE", []);
    expect(result.outcome === "review" && result.message).toMatch(/This lead is in Germany/);
  });

  it("lets a confirmed country through, and only that country", () => {
    expect(assessRecipientRegion("DE", ["DE"]).outcome).toBe("ok");
    expect(assessRecipientRegion("FR", ["DE"]).outcome).toBe("review");
  });

  it("does not claim what the law says", () => {
    const result = assessRecipientRegion("DE", []);
    const message = result.outcome === "review" ? result.message : "";
    expect(message).not.toMatch(/illegal|prohibited|unlawful|banned/i);
  });
});
