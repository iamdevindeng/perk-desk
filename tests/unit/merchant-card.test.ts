// Checks merchant membership and multi-location badges using fictional rendered cards.
// Called by: npm test
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MerchantCard, { MerchantResults } from "@/components/MerchantCard";
import ExportButton from "@/components/ExportButton";
import type { MerchantResult, ResolvedBrand } from "@/lib/types";
import { FAKE_MERCHANT, FAKE_PROFILE, FAKE_RESOLVED_BRAND, FAKE_RUN_RESULT } from "../fixtures/fake-plan";

function renderMerchant(merchant: MerchantResult, brands: ResolvedBrand[] = []): string {
  return renderToStaticMarkup(createElement(MerchantCard, {
    merchant, brands, status: "to_contact", selected: false, onSelect: () => {}, onStatusChange: () => {},
  }));
}

describe("merchant relationship badges", () => {
  it("shows the badge for an existing business member", () => {
    const markup = renderMerchant({ ...FAKE_MERCHANT, businessMember: true });
    expect(markup).toContain("Already a business member");
    expect(markup).not.toContain("Multi-location brand");
  });

  it("omits the badge when the merchant is not a business member", () => {
    const markup = renderMerchant({ ...FAKE_MERCHANT, businessMember: false });
    expect(markup).not.toContain("Already a business member");
  });

  it("keeps both badges when the merchant is a business member with multiple locations", () => {
    const markup = renderMerchant({ ...FAKE_MERCHANT, businessMember: true, multiLocation: true });
    expect(markup).toContain("Already a business member");
    expect(markup).toContain("Multi-location brand");
  });
});

it.each(["Mon–Sun 00:00–00:00", "Mon–Sun 00:00–24:00"])("polishes cached hours %s at card rendering", (hoursText) => {
  const markup = renderMerchant({ ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, hoursText } });
  expect(markup).toContain("Open 24 hours");
  expect(markup).not.toContain(hoursText);
});

it("shows the three highest shares and puts the remaining shares in the more title", () => {
  const brandShares = [
    { brandName: "Fake Low", sharePercent: 10 }, { brandName: "Fake Top", sharePercent: 40 },
    { brandName: "Fake Middle", sharePercent: 30 }, { brandName: "Fake Third", sharePercent: 15 },
    { brandName: "Fake Last", sharePercent: 5 },
  ];
  const before = structuredClone(brandShares);
  const markup = renderMerchant({ ...FAKE_MERCHANT, brandShares });
  const visible = markup.replace(/title="[^"]*"/g, "");
  expect(visible).toContain("Fake Top 40% · Fake Middle 30% · Fake Third 15%");
  expect(visible).not.toContain("Fake Low 10%");
  expect(visible).not.toContain("Fake Last 5%");
  expect(visible).toContain("+2 more");
  expect(markup).toContain('title="Fake Low 10% · Fake Last 5%"');
  expect(brandShares).toEqual(before);
});

function findExport(root: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(root)) {
    for (const child of root) { const found = findExport(child); if (found) return found; }
    return;
  }
  if (!root || typeof root !== "object" || !("props" in root)) return;
  const element = root as ReactElement<Record<string, unknown>>;
  return element.type === ExportButton ? element : findExport(element.props.children);
}

it("passes plan aliases through the results component to cards and CSV export", () => {
  const brand = { ...FAKE_RESOLVED_BRAND, inputName: "REI", name: "Recreational Equipment Inc" };
  const merchant = { ...FAKE_MERCHANT, brandShares: [{ brandName: brand.name, sharePercent: 100 }] };
  const props = { result: { ...FAKE_RUN_RESULT, merchants: [merchant] }, profile: FAKE_PROFILE, brands: [brand], independentsOnly: false,
    onIndependentsOnlyChange: () => {}, onSelectMerchant: () => {}, onStatusChange: () => {} };
  const markup = renderToStaticMarkup(createElement(MerchantResults, props));
  expect(markup).toContain("REI 100%");
  expect(markup).not.toContain(brand.name);
  const exported = findExport(MerchantResults(props));
  expect(exported?.props.brands).toBe(props.brands);
  expect(exported?.props.merchants).toEqual([merchant]);
});

it("explains Independents only with the exact text and an icon outside its switch label", () => {
  const markup = renderToStaticMarkup(createElement(MerchantResults, {
    result: FAKE_RUN_RESULT, profile: FAKE_PROFILE, independentsOnly: false,
    onIndependentsOnlyChange: () => {}, onSelectMerchant: () => {}, onStatusChange: () => {},
  }));
  expect(markup).toContain("Hides local brands with 2+ locations nearby. National chains are already excluded.");
  expect(markup).toMatch(/Independents only<\/label><span[^>]*><button[^>]*aria-label="What does Independents only mean\?"/);
});
