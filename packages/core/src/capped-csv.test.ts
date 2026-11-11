import { describe, expect, it } from "vitest";
import { createCappedCsv } from "#/capped-csv";
import type { CsvValue } from "#/csv";
import type { RawRow } from "#/database-adapter";

/** A row read as UTF-8 text, as the adapter gives it. */
function textRow(values: readonly CsvValue[]): RawRow {
  return {
    rawBytes: values.reduce((total, value) => total + Buffer.byteLength(value ?? ""), 0),
    decode: () => values,
  };
}

describe("createCappedCsv", () => {
  it("returns every row with no notes when under both caps", () => {
    const csv = createCappedCsv({ maxRows: 3, maxCharacters: 100 });
    csv.columns(["id"]);

    const accepted = ["1", "2", "3"].map((value) => csv.row(textRow([value])));

    expect(accepted).toEqual([true, true, true]);
    expect(csv.result()).toEqual({ csv: "id\n1\n2\n3\n", notes: [] });
  });

  it("stops at the row cap and notes the truncation", () => {
    const csv = createCappedCsv({ maxRows: 2, maxCharacters: 100 });
    csv.columns(["id"]);

    const accepted = ["1", "2", "3"].map((value) => csv.row(textRow([value])));

    expect(accepted).toEqual([true, true, false]);
    expect(csv.result()).toEqual({
      csv: "id\n1\n2\n",
      notes: [expect.stringMatching(/first 2 rows/u)],
    });
  });

  it("returns an empty result for a statement without a result set", () => {
    const csv = createCappedCsv({ maxRows: 100, maxCharacters: 100 });

    expect(csv.result()).toEqual({ csv: "\n", notes: [] });
  });
});

describe("createCappedCsv's character cap", () => {
  it("cuts at the last whole row that fits the character cap", () => {
    // The header and every row have the same length, so the cap falls just after a known row.
    const csv = createCappedCsv({ maxRows: 100, maxCharacters: 13 });
    csv.columns(["id"]);

    const accepted = ["1x", "2x", "3x", "4x"].map((value) => csv.row(textRow([value])));

    expect(accepted).toEqual([true, true, true, false]);
    expect(csv.result()).toEqual({
      csv: "id\n1x\n2x\n3x\n",
      notes: [expect.stringMatching(/first 3 rows.*13 characters/u)],
    });
  });

  it("declines a row too large to fit without decoding it", () => {
    const csv = createCappedCsv({ maxRows: 100, maxCharacters: 100 });
    csv.columns(["blob"]);

    const accepted = csv.row({
      rawBytes: 10_000,
      decode: () => {
        throw new Error("decoded a row that can't fit");
      },
    });

    expect(accepted).toBe(false);
    expect(csv.result()).toEqual({
      csv: "blob\n",
      notes: [expect.stringMatching(/first 0 rows.*100 characters/u)],
    });
  });

  it("keeps the header row even when it alone passes the character cap", () => {
    const csv = createCappedCsv({ maxRows: 100, maxCharacters: 2 });
    csv.columns(["long_name"]);

    expect(csv.row(textRow(["1"]))).toBe(false);
    expect(csv.result().csv).toBe("long_name\n");
  });
});
