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

export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly CsvValue[])[];
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
  /** Runs one statement as the Agent User, failing with `QUERY_FAILED`. */
  runReadOnlyQuery(settings: ConnectionSettings, sql: string): Promise<QueryResult>;
}
