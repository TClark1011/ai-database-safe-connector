import { formatCsv, formatCsvRow } from "#/csv";
import type { RowSink } from "#/database-adapter";
import { formatCount, queryLimits } from "#/query-limits";

export interface ResultCaps {
  readonly maxRows: number;
  readonly maxCharacters: number;
}

export interface CappedCsvResult {
  readonly csv: string;
  readonly notes: readonly string[];
}

export interface CappedCsv extends RowSink {
  result(): CappedCsvResult;
}

/**
 * A row's CSV line is never shorter than its raw bytes divided by this: UTF-8 takes at most 3
 * bytes per UTF-16 unit, and compacting JSON at most halves it.
 */
const maxRawBytesPerCsvCharacter = 6;

/**
 * Builds CSV from streamed rows, stopping at whichever cap comes first and always at a row
 * boundary. The header row is always kept. A row that can't fit is declined without decoding it.
 */
export function createCappedCsv(caps: ResultCaps = queryLimits): CappedCsv {
  let csv = formatCsv([], []);
  let rowCount = 0;
  let truncation: string | undefined;

  const truncate = (reason: string): false => {
    truncation = `Showing the first ${formatCount(rowCount)} rows${reason}`;
    return false;
  };
  const charactersTruncation = `, cut at ${formatCount(caps.maxCharacters)} characters; the result has more. Select fewer columns or rows to see the rest.`;

  return {
    columns: (names) => {
      csv = formatCsv(names, []);
    },
    row: (row) => {
      if (truncation !== undefined) {
        return false;
      }
      if (rowCount >= caps.maxRows) {
        return truncate(
          "; the result has more. Narrow the query with WHERE or LIMIT to see the rest.",
        );
      }
      if (csv.length + row.rawBytes / maxRawBytesPerCsvCharacter > caps.maxCharacters) {
        return truncate(charactersTruncation);
      }
      const line = formatCsvRow(row.decode());
      if (csv.length + line.length > caps.maxCharacters) {
        return truncate(charactersTruncation);
      }
      csv += line;
      rowCount += 1;
      return true;
    },
    result: () => ({ csv, notes: truncation === undefined ? [] : [truncation] }),
  };
}
