import { describe, expect, it } from "vitest";
import { formatCsv } from "#/csv";

describe("formatCsv", () => {
  it("writes a header row then one line per row", () => {
    expect(
      formatCsv(
        ["id", "name"],
        [
          ["1", "Ada"],
          ["2", "Grace"],
        ],
      ),
    ).toBe("id,name\n1,Ada\n2,Grace\n");
  });

  it("writes NULL as an unquoted empty field and an empty string as a quoted one", () => {
    expect(formatCsv(["a", "b", "c"], [[null, "", "x"]])).toBe('a,b,c\n,"",x\n');
  });

  it("quotes fields holding delimiters, quotes or newlines", () => {
    expect(formatCsv(["v"], [["a,b"], ['say "hi"'], ["line\nbreak"]])).toBe(
      'v\n"a,b"\n"say ""hi"""\n"line\nbreak"\n',
    );
  });

  it("writes the header row when there are no rows", () => {
    expect(formatCsv(["id"], [])).toBe("id\n");
  });
});
