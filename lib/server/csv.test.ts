import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("escapes quotes", () => {
    expect(csvCell('A "quoted" value')).toBe('"A ""quoted"" value"');
  });

  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "  =1+1"])(
    "neutralizes spreadsheet formula input %s",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("keeps ordinary values unchanged", () => {
    expect(csvCell("Acme, Inc.")).toBe('"Acme, Inc."');
  });
});
