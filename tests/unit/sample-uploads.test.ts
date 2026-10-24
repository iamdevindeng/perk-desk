// Verifies the downloadable examples use the same importer as the three upload controls.
// Called by: npm test
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUploadedList } from "@/lib/request-builders";

describe("downloadable upload samples", () => {
  it.each([
    { file: "brands-sample.csv", names: ["Patagonia", "REI", "Nike", "Adidas", "Lululemon", "Apple", "LEGO", "Nintendo"] },
    { file: "signed-merchants-sample.csv", names: [
      "Juniper Lantern Coffee", "Maple Kestrel Bakery", "Paper Finch Books, Beans & More", "Copper Comet Cycles", "Pebble Grove Pet Shop",
    ] },
    { file: "business-members-sample.csv", names: [
      "Cedar Kite Design Studio", "Inkstone Harbor Printing", "Willow Gear Repair", "Orchard Wren Florist", "Summit Acorn Accounting",
    ] },
  ])("imports the expected names from $file", ({ file, names }) => {
    expect(parseUploadedList(readFileSync(`public/samples/${file}`, "utf8"))).toEqual(names);
  });
});
