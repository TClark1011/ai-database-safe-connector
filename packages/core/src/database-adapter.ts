import type { CsvValue } from "#/csv";
import type { TlsMode } from "#/project-config";

export interface ServerAddress {
  readonly host: string;
  readonly port: number;
}

/** Where and how to reach a server, without an account. */
export interface ServerSettings extends ServerAddress {
  readonly tls: TlsMode;
  /** PEM contents of a private CA, for `verify`. */
  readonly tlsCa?: string;
}

export interface ConnectionSettings extends ServerSettings {
  readonly user: string;
  readonly password: string;
  /** The connection's default database. */
  readonly database?: string;
}

/** One developer's Agent User and the database it reads in one Environment. */
export interface AgentTarget {
  readonly database: string;
  readonly agentUser: string;
}

export type AppliedAccess = "none" | "unrestricted";

export interface AppliedState {
  readonly userExists: boolean;
  readonly access: AppliedAccess;
}

/** One row as read from the server: its raw size, and its values in text form on demand. */
export interface RawRow {
  /** Total bytes of the row's values as the server sent them. */
  readonly rawBytes: number;
  decode(): readonly CsvValue[];
}

/** Receives a query's result as it streams in. */
export interface RowSink {
  /** Called once, before any row, when the statement returns a result set. */
  columns(names: readonly string[]): void;
  /** Takes one row. Returns false when the row is dropped because the result is full: stop reading. */
  row(row: RawRow): boolean;
}

export interface QueryRequest {
  /** One SQL statement. */
  readonly sql: string;
  /** Server-side time limit, enforced by a watchdog even when the SQL overrides it. */
  readonly timeLimitSeconds: number;
  /** Receives the result as it streams in; reading stops when it declines a row. */
  readonly sink: RowSink;
}

/** Sync's statements, run on one Admin connection. */
export interface AdminSession {
  /** Reads the Agent User's applied access from the database; unknown grants fail Sync. */
  readAppliedAccess(target: AgentTarget): Promise<AppliedState>;
  createAgentUser(agentUser: string, password: string): Promise<void>;
  setAgentUserPassword(agentUser: string, password: string): Promise<void>;
  /** Grants read access to every table in the target's database, and nothing else. */
  grantUnrestricted(target: AgentTarget): Promise<void>;
  /** Closes the connection, never throwing. */
  close(): Promise<void>;
}

/** The engine-specific half of Sync and query execution (one per database engine). */
export interface DatabaseAdapter {
  openAdminSession(settings: ConnectionSettings): Promise<AdminSession>;
  /**
   * Runs one statement as the Agent User, giving every value in its text form, failing with
   * `QUERY_FAILED` or `QUERY_TIMED_OUT`.
   */
  runReadOnlyQuery(settings: ConnectionSettings, request: QueryRequest): Promise<void>;
}
