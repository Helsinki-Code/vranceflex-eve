import { afterEach, describe, expect, it } from "vitest";
import { isSmsEnabled } from "./feature-flags";

const original = process.env.VRANCEFLEX_SMS_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.VRANCEFLEX_SMS_ENABLED;
  else process.env.VRANCEFLEX_SMS_ENABLED = original;
});

describe("isSmsEnabled", () => {
  it("is off by default", () => {
    delete process.env.VRANCEFLEX_SMS_ENABLED;
    expect(isSmsEnabled()).toBe(false);
  });

  it("is on only for an explicit true", () => {
    process.env.VRANCEFLEX_SMS_ENABLED = "true";
    expect(isSmsEnabled()).toBe(true);
    process.env.VRANCEFLEX_SMS_ENABLED = " TRUE ";
    expect(isSmsEnabled()).toBe(true);
  });

  it.each(["", "false", "1", "yes", "on"])("treats %j as off", (value) => {
    process.env.VRANCEFLEX_SMS_ENABLED = value;
    expect(isSmsEnabled()).toBe(false);
  });
});
