// Checks CSV and text list uploads preserve first-column names without importing other data.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { LIST_MAX_ITEMS } from "@/lib/config";
import { parseUploadedList } from "@/lib/request-builders";

describe("uploaded first-column lists", () => {
  it("accepts plain text with LF, CRLF, CR, blank lines, and surrounding spaces", () => {
    expect(parseUploadedList("  Fake Coffee  \n\nFake Tea\r\nFake Bakery\r  ")).toEqual([
      "Fake Coffee", "Fake Tea", "Fake Bakery",
    ]);
    expect(parseUploadedList("\r\n \n")).toEqual([]);
  });

  it.each(["name", "MERCHANT", "Brand", "Business Name", "MERCHANT NAME"])("skips a first nonempty %s header", (header) => {
    expect(parseUploadedList(`\n,ignored\r\n ${header} ,other\nFake Coffee,unused`)).toEqual(["Fake Coffee"]);
  });

  it("handles a BOM and a quoted header", () => {
    expect(parseUploadedList('\uFEFF" name ",other\r\n"Fake Coffee",unused')).toEqual(["Fake Coffee"]);
  });

  it("takes only the first column and keeps quoted commas and escaped quotes", () => {
    expect(parseUploadedList('name,notes\n"Fake Coffee, LLC",ignore\n"Fake ""Cup"" Cafe",ignore')).toEqual([
      "Fake Coffee, LLC", 'Fake "Cup" Cafe',
    ]);
  });

  it("requires comma-containing names to be quoted in either upload format", () => {
    expect(parseUploadedList('Fake Coffee, LLC\n"Fake Tea, LLC"')).toEqual(["Fake Coffee", "Fake Tea, LLC"]);
  });

  it("normalizes embedded line endings in the first cell into one pasted name", () => {
    expect(parseUploadedList('"Fake\r\nCoffee",note\r\n"Fake\nTea",note\r"Fake\rBakery",note')).toEqual([
      "Fake Coffee", "Fake Tea", "Fake Bakery",
    ]);
  });

  it("ignores quoted multiline content in later columns without creating extra names", () => {
    expect(parseUploadedList('Fake Coffee,"notes, more\ncontinued ""text"""\nFake Tea,done')).toEqual([
      "Fake Coffee", "Fake Tea",
    ]);
  });

  it("only skips the first nonempty header, not matching names in later rows", () => {
    expect(parseUploadedList("Fake Coffee\nname\nmerchant\nbrand")).toEqual(["Fake Coffee", "name", "merchant", "brand"]);
    expect(parseUploadedList("name\nname\nFake Coffee")).toEqual(["name", "Fake Coffee"]);
  });

  it("reuses case-insensitive deduplication and keeps the first spelling", () => {
    expect(parseUploadedList('" Fake Coffee "\nFAKE COFFEE,ignored\nFake Tea')).toEqual(["Fake Coffee", "Fake Tea"]);
  });

  it("caps unique names with the shared list limit", () => {
    const rows = Array.from({ length: LIST_MAX_ITEMS + 2 }, (_, index) => `Fake Merchant ${index},ignored`);
    const names = parseUploadedList(["merchant,notes", ...rows].join("\n"));
    expect(names).toHaveLength(LIST_MAX_ITEMS);
    expect(names.at(-1)).toBe(`Fake Merchant ${LIST_MAX_ITEMS - 1}`);
  });

  it.each(['"Fake Coffee', 'Fake Coffee,"unfinished\nFake Tea', '"Fake ""Cup""']) (
    "rejects an unclosed quote without returning a partial list", (text) => {
      expect(() => parseUploadedList(text)).toThrow("Unclosed quoted field in uploaded list.");
    },
  );

  it.each(['Fake "Coffee"', '"Fake Coffee"unexpected']) (
    "rejects malformed quoting with a static message", (text) => {
      expect(() => parseUploadedList(text)).toThrow("Invalid CSV quoting in uploaded list.");
    },
  );
});
