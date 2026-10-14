import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { priceListFromCsv } from "./priceListCsv";
import { toCsv } from "./reportLogic";

describe("csv", () => {
  it("reads quotes, commas, newlines in quotes, CRLF and a BOM", () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\n"line\nbreak",\n')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["line\nbreak", ""]]);
  });
  it("round-trips what toCsv writes", () => {
    const rows = [["a", "b,c"], ['q"uote', "multi\nline"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("price list import", () => {
  it("accepts a normal sheet, in any column order", () => {
    const r = priceListFromCsv(parseCsv("Unit Price,Description,Unit,Category,Taxable\n$335.00,Architectural shingles,sq,Roofing,yes\n\"1,200.5\",Gutters 5in,LF,Gutters,no"));
    expect(r.errors).toEqual([]);
    expect(r.items.map((i) => [i.key, i.unit, i.unitPriceCents, i.taxable])).toEqual([["architectural_shingles", "SQ", 33500, true], ["gutters_5in", "LF", 120050, false]]);
  });
  it("reports every bad row by number instead of importing half a file", () => {
    const r = priceListFromCsv(parseCsv("description,unit,unit price\nGood,EA,10\n,EA,5\nBad unit,XX,5\nBad price,EA,abc\nGood,EA,10"));
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(r.errors[3]!.message).toMatch(/more than once/);
  });
  it("needs the essential columns", () => {
    expect(priceListFromCsv(parseCsv("name,color\nx,y")).errors.length).toBeGreaterThan(0);
  });
});
