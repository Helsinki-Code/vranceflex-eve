import { describe, expect, it } from "vitest";
import { assessMailboxReadiness, worstReadiness, type ReadinessInput } from "../domain/mailbox-readiness";

const healthy: ReadinessInput = {
  consumer: false,
  domainStatus: "verified",
  domainAgeDays: 400,
  rampCompletesOn: null,
  sentWeek: 100,
  bouncedWeek: 1,
  now: new Date("2030-01-15T00:00:00Z"),
};
const assess = (overrides: Partial<ReadinessInput>) => assessMailboxReadiness({ ...healthy, ...overrides });

describe("assessMailboxReadiness", () => {
  it("is ready when everything is in order", () => {
    expect(assess({})).toEqual({ level: "ready", reasons: [] });
  });

  it("is not ready for a personal mailbox", () => {
    const result = assess({ consumer: true });
    expect(result.level).toBe("not_ready");
    expect(result.reasons[0]).toMatch(/personal mailbox/i);
  });

  it("is not ready when authentication fails, and warming when it is partly there", () => {
    expect(assess({ domainStatus: "unverified" }).level).toBe("not_ready");
    expect(assess({ domainStatus: "partial" }).level).toBe("warming");
    // Not yet checked is unknown, not a problem.
    expect(assess({ domainStatus: null }).level).toBe("ready");
  });

  it("judges bounces only once there is enough volume", () => {
    expect(assess({ sentWeek: 10, bouncedWeek: 5 }).level).toBe("ready");
    expect(assess({ sentWeek: 100, bouncedWeek: 3 }).level).toBe("warming");
    expect(assess({ sentWeek: 100, bouncedWeek: 5 }).level).toBe("not_ready");
    expect(assess({ sentWeek: 100, bouncedWeek: 2 }).level).toBe("ready");
  });

  it("warms a young domain, and treats an unknown age as fine", () => {
    const young = assess({ domainAgeDays: 5 });
    expect(young.level).toBe("warming");
    expect(young.reasons[0]).toMatch(/5 days ago/);
    expect(assess({ domainAgeDays: 1 }).reasons[0]).toMatch(/1 day ago/);
    expect(assess({ domainAgeDays: 30 }).level).toBe("ready");
    expect(assess({ domainAgeDays: null }).level).toBe("ready");
  });

  it("warms a mailbox that is still ramping up", () => {
    const result = assess({ rampCompletesOn: new Date("2030-02-01T00:00:00Z") });
    expect(result.level).toBe("warming");
    expect(result.reasons[0]).toMatch(/until 2030-02-01/);
    expect(assess({ rampCompletesOn: new Date("2030-01-01T00:00:00Z") }).level).toBe("ready");
  });

  it("reports the worst level and lists blocking reasons first", () => {
    const result = assess({ consumer: true, domainAgeDays: 3 });
    expect(result.level).toBe("not_ready");
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toMatch(/personal/i);
  });
});

describe("worstReadiness", () => {
  it("picks the worst", () => {
    expect(worstReadiness([])).toBe("ready");
    expect(worstReadiness(["ready", "warming"])).toBe("warming");
    expect(worstReadiness(["warming", "not_ready", "ready"])).toBe("not_ready");
  });
});
