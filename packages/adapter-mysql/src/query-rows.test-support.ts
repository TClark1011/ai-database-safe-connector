import {
  type ConnectionSettings,
  type CsvValue,
  queryLimits,
} from "@ai-database-safety-experiment/core";
import { mysqlAdapter } from "#/index";

export interface CollectedRows {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly CsvValue[])[];
}

/** Runs a query through the adapter and collects every row, for tests. */
export async function queryRows(
  settings: ConnectionSettings,
  sql: string,
  timeLimitSeconds: number = queryLimits.timeLimitSeconds,
): Promise<CollectedRows> {
  let columns: readonly string[] = [];
  const rows: (readonly CsvValue[])[] = [];
  await mysqlAdapter.runReadOnlyQuery(settings, {
    sql,
    timeLimitSeconds,
    sink: {
      columns: (names) => {
        columns = names;
      },
      row: (row) => {
        rows.push(row.decode());
        return true;
      },
    },
  });
  return { columns, rows };
}
