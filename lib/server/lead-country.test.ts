import { describe, expect, it } from "vitest";
import { countryForDomain, countryForLead, countryForLocation } from "./lead-country";

describe("countryForDomain", () => {
  it.each([
    ["acme.de", "DE"],
    ["shop.acme.co.uk", "GB"],
    ["www.acme.fr", "FR"],
    ["ACME.AU", "AU"],
    ["acme.ca.", "CA"],
  ])("maps %s to %s", (domain, expected) => {
    expect(countryForDomain(domain)).toBe(expected);
  });

  it.each(["acme.com", "acme.io", "acme.ai", "acme.org", "localhost", "", null, undefined])("returns null for %j", (domain) => {
    expect(countryForDomain(domain as string | null | undefined)).toBeNull();
  });
});

describe("countryForLocation", () => {
  it.each([
    ["Germany", "DE"],
    ["United Kingdom", "GB"],
    ["UK", "GB"],
    ["USA", "US"],
    ["Munich, Germany", "DE"],
    ["Austin, TX", "US"],
    ["Toronto", "CA"],
    ["Ontario, Canada", "CA"],
    ["Sydney", "AU"],
    ["London, England", "GB"],
    ["Bengaluru", "IN"],
  ])("places %j in %s", (location, expected) => {
    expect(countryForLocation(location)).toBe(expected);
  });

  it.each(["Global", "Worldwide", "Europe", "North America", "", null, "Somewhere unknown"])("returns null for %j", (location) => {
    expect(countryForLocation(location as string | null)).toBeNull();
  });
});

describe("countryForLead", () => {
  it("prefers the company's domain over the campaign's location", () => {
    expect(countryForLead({ companyDomain: "acme.de", geography: "United States" })).toBe("DE");
  });

  it("falls back to the campaign's location for a generic domain", () => {
    expect(countryForLead({ companyDomain: "acme.com", geography: "Germany" })).toBe("DE");
  });

  it("is null when neither says", () => {
    expect(countryForLead({ companyDomain: "acme.com", geography: "Global" })).toBeNull();
    expect(countryForLead({})).toBeNull();
  });
});
