import { describe, expect, it, vi } from "vitest";
import { domainAgeDays, fetchDomainRegistration, registrationDateFromRdap } from "./domain-age";

describe("registrationDateFromRdap", () => {
  it("reads the registration event", () => {
    const date = registrationDateFromRdap({ events: [{ eventAction: "last changed", eventDate: "2024-01-01T00:00:00Z" }, { eventAction: "registration", eventDate: "2019-05-02T10:00:00Z" }] });
    expect(date?.toISOString()).toBe("2019-05-02T10:00:00.000Z");
  });

  it.each([
    [null],
    [{}],
    [{ events: "nope" }],
    [{ events: [] }],
    [{ events: [{ eventAction: "expiration", eventDate: "2031-01-01T00:00:00Z" }] }],
    [{ events: [{ eventAction: "registration", eventDate: "not a date" }] }],
    [{ events: [{ eventAction: "registration", eventDate: "1970-01-01T00:00:00Z" }] }],
    [{ events: [{ eventAction: "registration", eventDate: "2999-01-01T00:00:00Z" }] }],
  ])("returns null for %j", (body) => {
    expect(registrationDateFromRdap(body)).toBeNull();
  });
});

describe("fetchDomainRegistration", () => {
  const ok = (body: unknown) => vi.fn(async (_url: string) => ({ ok: true, json: async () => body }));

  it("looks the domain up and returns the date", async () => {
    const fetchImpl = ok({ events: [{ eventAction: "registration", eventDate: "2020-03-04T00:00:00Z" }] });
    const date = await fetchDomainRegistration("Example.COM", fetchImpl);
    expect(date?.toISOString()).toBe("2020-03-04T00:00:00.000Z");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://rdap.org/domain/example.com");
  });

  it("sends nothing for something that is not a domain", async () => {
    const fetchImpl = ok({});
    for (const bad of ["not a domain", "a b.com", "http://x.com/path", "", "localhost"]) {
      expect(await fetchDomainRegistration(bad, fetchImpl)).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null on a missing record, an error status or a network failure", async () => {
    expect(await fetchDomainRegistration("example.com", vi.fn(async (_url: string) => ({ ok: false, json: async () => ({}) })))).toBeNull();
    expect(await fetchDomainRegistration("example.com", vi.fn(async (_url: string): Promise<{ ok: boolean; json(): Promise<unknown> }> => { throw new Error("offline"); }))).toBeNull();
    expect(await fetchDomainRegistration("example.com", vi.fn(async (_url: string) => ({ ok: true, json: async () => { throw new Error("bad json"); } })))).toBeNull();
  });
});

describe("domainAgeDays", () => {
  it("counts whole days and treats unknown as null", () => {
    const now = new Date("2030-01-15T12:00:00Z");
    expect(domainAgeDays(new Date("2030-01-10T00:00:00Z"), now)).toBe(5);
    expect(domainAgeDays(new Date("2030-01-16T00:00:00Z"), now)).toBe(0);
    expect(domainAgeDays(null, now)).toBeNull();
    expect(domainAgeDays(undefined, now)).toBeNull();
  });
});
