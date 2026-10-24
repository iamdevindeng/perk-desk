// Verifies cached merchant display aliases and hours without modifying provider-backed values.
// Called by: npm test; all brand mappings use hand-written plan records
import { expect, it } from "vitest";
import { displayBrandName, displayHours } from "@/lib/merchant-display";
import { FAKE_RESOLVED_BRAND } from "../fixtures/fake-plan";

it.each([
  "Mon–Sun 00:00–00:00", "Mon–Sun 00:00–24:00",
  "Mon–Fri 00:00–00:00 · Sat–Sun 00:00–24:00",
])("displays full-day cached hours %s clearly", (text) => {
  expect(displayHours(text)).toBe("Open 24 hours");
});

it.each([undefined, "", "Mon–Fri 09:00–17:00", "Mon–Fri 00:00–24:00 · Sat 09:00–12:00", "Call for hours"])(
  "preserves ordinary, mixed, or missing hours %s", (text) => { expect(displayHours(text)).toBe(text); },
);

it.each([
  { inputName: "REI", name: "Recreational Equipment Inc" },
  { inputName: "Fake Coffee", name: "Fake Coffee Co." },
  { inputName: "Fake Coffee", name: "Fake Coffee Reserve" },
])("uses the supplied $inputName for a matching expanded name", ({ inputName, name }) => {
  const brand = { ...FAKE_RESOLVED_BRAND, inputName, name };
  expect(displayBrandName(name, [brand])).toBe(inputName);
  expect(brand.name).toBe(name);
});

it("does not alias an unrelated chosen brand or an unlisted merchant share", () => {
  const brand = { ...FAKE_RESOLVED_BRAND, inputName: "Fake Mystery", name: "Recreational Equipment Inc" };
  expect(displayBrandName(brand.name, [brand])).toBe(brand.name);
  expect(displayBrandName("Fake Other Brand", [brand])).toBe("Fake Other Brand");
  expect(displayBrandName(brand.name)).toBe(brand.name);
});

it("does not alias an unselected candidate that shares the input name prefix", () => {
  const brand = { ...FAKE_RESOLVED_BRAND, inputName: "Fake Brand", name: "Fake Brand Inc", candidates: [
    { ...FAKE_RESOLVED_BRAND.candidates[0], name: "Fake Brand Sports" },
  ] };
  expect(displayBrandName(brand.name, [brand])).toBe("Fake Brand");
  expect(displayBrandName("Fake Brand Sports", [brand])).toBe("Fake Brand Sports");
});
