import { stringify } from "csv-stringify/sync";

export type CsvValue = string | null;

const csvOptions = { quoted_match: /^$/u };

/** Formats rows as CSV with a header row. NULL is an unquoted empty field, `""` an empty string. */
export function formatCsv(
  columns: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  return stringify([columns, ...rows], csvOptions);
}

/** Formats one CSV line, ending in a newline, as `formatCsv` would. */
export function formatCsvRow(values: readonly CsvValue[]): string {
  return stringify([values], csvOptions);
}
