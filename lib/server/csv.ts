const spreadsheetFormulaPrefix = /^[\t\r\n ]*[=+\-@]/;

/**
 * Escapes a value for RFC 4180 CSV and neutralizes spreadsheet formulas.
 * Quoting alone does not stop Excel or Google Sheets from evaluating cells.
 */
export function csvCell(value: string | number | boolean | null | undefined) {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = spreadsheetFormulaPrefix.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}
