// Checks the address hint for map-picked branches and all other location sources.
// Called by: npm test; static component rendering needs no browser or services
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import BranchEditor from "@/components/BranchEditor";
import type { Branch } from "@/lib/types";
import { FAKE_BRANCH } from "../fixtures/fake-plan";

type AddressCase = { source: Branch["locationSource"]; address: string; placeholder: string };
const DEFAULT_PLACEHOLDER = "Street address, city, state";
const ADDRESS_CASES: AddressCase[] = [
  { source: "map", address: "", placeholder: "Location set on map. Address optional." },
  { source: "map", address: "3 Example Lane", placeholder: DEFAULT_PLACEHOLDER },
  { source: "map", address: " ", placeholder: DEFAULT_PLACEHOLDER },
  { source: "preset", address: "", placeholder: DEFAULT_PLACEHOLDER },
  { source: "qloo_locality", address: "", placeholder: DEFAULT_PLACEHOLDER },
  { source: undefined, address: "", placeholder: DEFAULT_PLACEHOLDER },
];

it.each(ADDRESS_CASES)("uses the correct address placeholder for source=$source and address='$address'", ({ source, address, placeholder }) => {
  const branch = { ...FAKE_BRANCH, locationSource: source, address };
  const markup = renderToStaticMarkup(createElement(BranchEditor, {
    branches: [branch], onChange: () => {}, onPickBranch: () => {},
  }));
  const addressInput = markup.match(new RegExp(`<input[^>]*id="branch-${branch.id}-address"[^>]*>`))?.[0];
  expect(addressInput).toBeDefined();
  expect(addressInput).toContain(`placeholder="${placeholder}"`);
});
