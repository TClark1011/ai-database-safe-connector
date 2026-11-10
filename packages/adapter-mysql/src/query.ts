import {
  AppError,
  type ConnectionSettings,
  type CsvValue,
  type QueryResult,
  errorMessage,
} from "@ai-database-safety-experiment/core";
import type { FieldPacket, RowDataPacket, TypeCast } from "mysql2/promise";
import { closeQuietly, openConnection } from "#/connection";

const asText: TypeCast = (field) => field.string();

function toCsvValue(value: unknown): CsvValue {
  if (value === null || typeof value === "string") {
    return value;
  }
  throw new Error(`Expected a text value from the driver, got ${typeof value}`);
}

function toCsvRows(rows: readonly unknown[]): CsvValue[][] {
  return rows.map((row) => {
    if (!Array.isArray(row)) {
      throw new TypeError("Expected each row as an array");
    }
    return (row as readonly unknown[]).map((value) => toCsvValue(value));
  });
}

function queryFailed(error: unknown): AppError {
  return new AppError("QUERY_FAILED", errorMessage(error), "Fix the SQL, then query again.", {
    cause: error,
  });
}

/**
 * Runs one statement on a fresh connection, in UTC and inside a read-only transaction, and
 * returns every value in MySQL's text form.
 */
export async function runReadOnlyQuery(
  settings: ConnectionSettings,
  sql: string,
): Promise<QueryResult> {
  let connection;
  try {
    connection = await openConnection(settings);
  } catch (error) {
    throw queryFailed(error);
  }

  let rows: RowDataPacket[][];
  let fields: FieldPacket[] | undefined;
  try {
    await connection.query("SET time_zone = '+00:00'");
    await connection.query("START TRANSACTION READ ONLY");
    [rows, fields] = await connection.query<RowDataPacket[][]>({
      sql,
      rowsAsArray: true,
      typeCast: asText,
    });
  } catch (error) {
    throw queryFailed(error);
  } finally {
    // Closing ends the transaction without committing it.
    await closeQuietly(connection);
  }

  // Statements without a result set, such as SET, have no fields.
  if (!Array.isArray(fields)) {
    return { columns: [], rows: [] };
  }
  return { columns: fields.map((field) => field.name), rows: toCsvRows(rows) };
}
