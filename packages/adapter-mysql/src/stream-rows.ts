import type { RowSink } from "@ai-database-safety-experiment/core";
import type { Connection, FieldPacket } from "mysql2";
import { type Decode, asBytes, decoderFor, rawRow } from "#/decode";

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export type StreamEnd = "all-rows" | "declined";

export interface RowStream {
  readonly ended: Promise<StreamEnd>;
  /** Rejects `ended` at once and drops the connection, for when the query can't be killed. */
  readonly abort: (reason: unknown) => void;
}

/** Streams the statement's rows into the sink until they run out or the sink declines one. */
export function streamRows(connection: Connection, sql: string, sink: RowSink): RowStream {
  const { promise, resolve, reject } = Promise.withResolvers<StreamEnd>();
  let decoders: Decode[] = [];
  let declined = false;
  const abort = (reason: unknown): void => {
    connection.destroy();
    reject(asError(reason));
  };
  const query = connection.query({ sql, rowsAsArray: true, typeCast: asBytes });
  // Statements without a result set, such as SET, emit no fields and a non-array result.
  query.on("fields", (fields?: readonly FieldPacket[]) => {
    if (fields !== undefined) {
      decoders = fields.map((field) => decoderFor(field));
      sink.columns(fields.map((field) => field.name));
    }
  });
  // Rows still arriving after the sink declines one are dropped until the query is killed.
  query.on("result", (row: unknown) => {
    if (declined || !Array.isArray(row)) {
      return;
    }
    try {
      if (!sink.row(rawRow(row, decoders))) {
        declined = true;
        resolve("declined");
      }
    } catch (error) {
      // The server is still sending rows, so it stops on its next write to the dropped socket.
      declined = true;
      abort(error);
    }
  });
  query.on("end", () => {
    resolve("all-rows");
  });
  query.on("error", (error: Readonly<Error>) => {
    reject(error);
  });
  return { ended: promise, abort };
}
