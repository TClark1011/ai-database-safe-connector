import type { ConnectionSettings } from "@ai-database-safety-experiment/core";
import {
  type Connection as StreamingConnection,
  createConnection as createCallbackConnection,
} from "mysql2";
import mysql, { type Connection, type ConnectionOptions } from "mysql2/promise";

function sslOptions(settings: ConnectionSettings): Pick<ConnectionOptions, "ssl"> {
  if (settings.tls === "off") {
    return {};
  }
  // `required` encrypts without checking the certificate; `verify` checks it and the hostname.
  const rejectUnauthorized = settings.tls === "verify";
  return {
    ssl:
      settings.tlsCa === undefined
        ? { rejectUnauthorized }
        : { rejectUnauthorized, ca: settings.tlsCa },
  };
}

/**
 * Allows only one statement per query and tells the server the client never sends local files,
 * so `LOAD DATA LOCAL` can't make it read one.
 */
function connectionOptions(settings: ConnectionSettings): ConnectionOptions {
  return {
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    multipleStatements: false,
    flags: ["-LOCAL_FILES"],
    ...sslOptions(settings),
    ...(settings.database === undefined ? {} : { database: settings.database }),
  };
}

export function openConnection(settings: ConnectionSettings): Promise<Connection> {
  return mysql.createConnection(connectionOptions(settings));
}

/**
 * Opens a callback-style connection, whose queries can stream rows. It connects on its first
 * statement, so connection errors surface there.
 */
export function openStreamingConnection(settings: ConnectionSettings): StreamingConnection {
  return createCallbackConnection(connectionOptions(settings));
}

/** Closes a connection, ignoring errors: there is nothing left to do with it either way. */
export async function closeQuietly(connection: Connection): Promise<void> {
  await connection.end().catch(() => null);
}

/** Quotes one identifier, keeping dots inside it rather than splitting on them. */
export function quoteId(name: string): string {
  return mysql.escapeId(name, true);
}
