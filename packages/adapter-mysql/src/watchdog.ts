import type { ConnectionSettings } from "@ai-database-safety-experiment/core";
import { closeQuietly, openConnection } from "#/connection";

const graceMs = 2000;
const killTimeoutMs = 5000;

/**
 * Stops a connection's running statement from a second connection; MySQL lets an account kill
 * its own threads. Fails rather than hangs when the server doesn't answer, so callers can fall
 * back to dropping the connection.
 */
export async function killQuery(settings: ConnectionSettings, threadId: number): Promise<void> {
  const killer = await openConnection(settings);
  try {
    await killer.query({ sql: "KILL QUERY ?", values: [threadId], timeout: killTimeoutMs });
  } finally {
    await closeQuietly(killer);
  }
}

export interface Watchdog {
  readonly fired: () => boolean;
  readonly stop: () => void;
}

/**
 * Calls `kill` once the time limit plus a grace has passed, since a `MAX_EXECUTION_TIME` hint in
 * the SQL replaces the session's limit. If the kill fails, `onKillFailed` gets the reason.
 */
export function startWatchdog(
  timeLimitMs: number,
  kill: () => Promise<void>,
  onKillFailed: (reason: unknown) => void,
): Watchdog {
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    kill().catch(onKillFailed);
  }, timeLimitMs + graceMs);
  return {
    fired: () => fired,
    stop: () => {
      clearTimeout(timer);
    },
  };
}
