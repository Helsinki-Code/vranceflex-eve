import { describe, expect, it } from "vitest";
import { classifyEveTerminalEvent } from "./eve-terminal";

describe("classifyEveTerminalEvent", () => {
  it("keeps active sessions running", () => {
    expect(classifyEveTerminalEvent({ type: "action.result" })).toBeNull();
  });

  it("surfaces Eve turn failures", () => {
    expect(
      classifyEveTerminalEvent({
        type: "turn.failed",
        data: { message: "AI Gateway credit was unavailable." },
      }),
    ).toEqual({
      errorCode: "eve_run_failed",
      errorMessage: "AI Gateway credit was unavailable.",
    });
  });

  it("marks a settled session without artifacts as retryable", () => {
    expect(classifyEveTerminalEvent({ type: "session.waiting" })).toEqual({
      errorCode: "eve_artifacts_missing",
      errorMessage:
        "Eve finished before saving campaign drafts. Continue with Eve to retry from the approved leads.",
    });
  });
});
