// Verifies the downloadable examples use the same importer as the three upload controls.
// Called by: npm test
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUploadedList } from "@/lib/request-builders";

describe("downloadable upload samples", () => {
  it.each([
    { file: "brands-sample.csv", names: ["Patagonia", "REI", "Nike", "Adidas", "Lululemon", "Apple", "LEGO", "Nintendo"] },
    { file: "signed-merchants-sample.csv", names: [
      "Fake Lantern Coffee", "Fake Willow Bakery", "Fake Books, Beans & More", "Fake Meadow Bikes", "Fake Pebble Pet Shop",
    ] },
    { file: "business-members-sample.csv", names: [
      "Fake Cedar Design Studio", "Fake Harbor Printing", "Fake Maple Repair", "Fake Orchard Florist", "Fake Summit Accounting",
    ] },
  ])("imports the expected names from $file", ({ file, names }) => {
    expect(parseUploadedList(readFileSync(`public/samples/${file}`, "utf8"))).toEqual(names);
  });
});
