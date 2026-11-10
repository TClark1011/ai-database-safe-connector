import type { ConnectionSettings } from "@ai-database-safety-experiment/core";
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
 * Opens a connection that allows only one statement per query and tells the server the client
 * never sends local files, so `LOAD DATA LOCAL` can't make it read one.
 */
export function openConnection(settings: ConnectionSettings): Promise<Connection> {
  return mysql.createConnection({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    multipleStatements: false,
    flags: ["-LOCAL_FILES"],
    ...sslOptions(settings),
    ...(settings.database === undefined ? {} : { database: settings.database }),
  });
}

/** Closes a connection, ignoring errors: there is nothing left to do with it either way. */
export async function closeQuietly(connection: Connection): Promise<void> {
  await connection.end().catch(() => null);
}

/** Quotes one identifier, keeping dots inside it rather than splitting on them. */
export function quoteId(name: string): string {
  return mysql.escapeId(name, true);
}
