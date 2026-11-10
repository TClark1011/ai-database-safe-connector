import { stringify } from "csv-stringify/sync";

export type CsvValue = string | null;

/** Formats rows as CSV with a header row. NULL is an unquoted empty field, `""` an empty string. */
export function formatCsv(
  columns: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  return stringify([columns, ...rows], { quoted_match: /^$/u });
}
