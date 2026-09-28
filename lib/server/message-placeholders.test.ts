import { describe, expect, it } from "vitest";
import { findUnresolvedPlaceholders } from "./message-placeholders";

describe("unresolved placeholder detection", () => {
  it("finds the template slots models leave behind", () => {
    expect(findUnresolvedPlaceholders("Hi [First Name], book here: [LINK]")).toEqual(["[First Name]", "[LINK]"]);
    expect(findUnresolvedPlaceholders("Quick note for {{company}}")).toEqual(["{{company}}"]);
    expect(findUnresolvedPlaceholders("Subject", "Body with <first_name>")).toEqual(["<first_name>"]);
  });

  it("leaves ordinary brackets and finished copy alone", () => {
    expect(findUnresolvedPlaceholders("Elena, the close drops from 8 days [to 2] with LedgerSync.")).toEqual([]);
    expect(findUnresolvedPlaceholders("See https://ledgersync.io/playbook")).toEqual([]);
  });
});
