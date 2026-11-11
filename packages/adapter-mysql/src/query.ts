import {
  AppError,
  type ConnectionSettings,
  type QueryRequest,
  errorMessage,
} from "@ai-database-safety-experiment/core";
import type { Connection } from "mysql2";
import { closeQuietly, openStreamingConnection } from "#/connection";
import { streamRows } from "#/stream-rows";
import { killQuery, startWatchdog } from "#/watchdog";

const queryTimeoutErrno = 3024;

function queryFailed(error: unknown): AppError {
  return new AppError("QUERY_FAILED", errorMessage(error), "Fix the SQL, then query again.", {
    cause: error,
  });
}

function queryTimedOut(timeLimitSeconds: number, error: unknown): AppError {
  return new AppError(
    "QUERY_TIMED_OUT",
    `The query ran past the ${timeLimitSeconds} second limit and was stopped.`,
    "Narrow the query, e.g. with a LIMIT or conditions on indexed columns, then query again.",
    { cause: error },
  );
}

function isServerTimeout(error: unknown): boolean {
  return error instanceof Error && "errno" in error && error.errno === queryTimeoutErrno;
}

/** Opens a fresh connection in UTC, with the time limit, inside a read-only transaction. */
async function openQueryConnection(
  settings: ConnectionSettings,
  timeLimitMs: number,
): Promise<Connection> {
  const connection = openStreamingConnection(settings);
  const statements = connection.promise();
  try {
    await statements.query("SET time_zone = '+00:00'");
    await statements.query("SET max_execution_time = ?", [timeLimitMs]);
    await statements.query("START TRANSACTION READ ONLY");
  } catch (error) {
    await closeQuietly(statements);
    throw error;
  }
  return connection;
}

/**
 * Runs one statement on a fresh connection and streams every value in MySQL's text form, with
 * binary as `0x` hex and JSON compacted, into the sink (ADR 0014).
 */
export async function runReadOnlyQuery(
  settings: ConnectionSettings,
  { sql, timeLimitSeconds, sink }: QueryRequest,
): Promise<void> {
  const timeLimitMs = timeLimitSeconds * 1000;
  let connection;
  try {
    connection = await openQueryConnection(settings, timeLimitMs);
  } catch (error) {
    throw queryFailed(error);
  }

  const { threadId } = connection;
  const kill = () => killQuery(settings, threadId);
  const stream = streamRows(connection, sql, sink);
  // Started only now, so connecting doesn't count toward the limit.
  const watchdog = startWatchdog(timeLimitMs, kill, stream.abort);
  try {
    const end = await stream.ended;
    if (end === "declined") {
      // Stops the server sending the rest; dropping the connection is the fallback.
      await kill().catch(() => {
        connection.destroy();
      });
    }
  } catch (error) {
    throw watchdog.fired() || isServerTimeout(error)
      ? queryTimedOut(timeLimitSeconds, error)
      : queryFailed(error);
  } finally {
    watchdog.stop();
    // Closing ends the transaction without committing it.
    await closeQuietly(connection.promise());
  }
}
