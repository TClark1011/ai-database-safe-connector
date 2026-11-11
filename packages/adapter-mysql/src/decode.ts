import type { CsvValue, RawRow } from "@ai-database-safety-experiment/core";
import { Charsets, type FieldPacket, type TypeCast, Types } from "mysql2";

// Column types whose values are bytes rather than text, whatever their charset.
const binaryTypes = new Set<number>([Types.BIT, Types.GEOMETRY, Types.VECTOR]);
// Column types that hold bytes when their charset is binary, such as BINARY and BLOB.
const stringTypes = new Set<number>([
  Types.STRING,
  Types.VAR_STRING,
  Types.VARCHAR,
  Types.TINY_BLOB,
  Types.MEDIUM_BLOB,
  Types.LONG_BLOB,
  Types.BLOB,
]);

/** Turns one column's raw bytes into its text form. */
export type Decode = (bytes: Buffer) => string;

/** The driver's type cast: every value as raw bytes, decoded later per column. */
export const asBytes: TypeCast = (field) => field.buffer();

/** Drops the whitespace MySQL puts between JSON tokens, leaving strings untouched. */
function compactJson(text: string): string {
  return text.replaceAll(/("(?:[^"\\]|\\.)*")|\s+/gu, (_match, quoted?: string) => quoted ?? "");
}

/** MySQL's text form for the column, with binary as `0x` hex and JSON compacted. */
export function decoderFor(field: FieldPacket): Decode {
  const type = field.columnType ?? field.type;
  if (type === Types.JSON) {
    return (bytes) => compactJson(bytes.toString("utf8"));
  }
  const isBinary =
    type !== undefined &&
    (binaryTypes.has(type) || (stringTypes.has(type) && field.characterSet === Charsets.BINARY));
  if (isBinary) {
    return (bytes) => `0x${bytes.toString("hex")}`;
  }
  return (bytes) => bytes.toString("utf8");
}

function decodeValue(value: Buffer | null, decode: Decode | undefined): CsvValue {
  if (value === null) {
    return null;
  }
  if (decode === undefined) {
    throw new TypeError("Got a value for a column without metadata");
  }
  return decode(value);
}

/** Wraps a row of raw values from the driver, decoding them only when asked. */
export function rawRow(row: readonly unknown[], decoders: readonly Decode[]): RawRow {
  const values = row.map((value) => {
    if (value !== null && !Buffer.isBuffer(value)) {
      throw new TypeError("Expected each value from the driver as bytes");
    }
    return value;
  });
  return {
    rawBytes: values.reduce((total, value) => total + (value?.length ?? 0), 0),
    decode: () => values.map((value, index) => decodeValue(value, decoders[index])),
  };
}
