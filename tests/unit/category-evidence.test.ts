// Checks evidence deduplication, priority, limits, and the collapsed confirmation display.
// Called by: npm test; all evidence is hand-written synthetic data.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CategoryConfirm from "@/components/CategoryConfirm";
import { compactCategoryEvidence } from "@/lib/agent/guards";
import type { CategoryEvidence } from "@/lib/types";
import { FAKE_CATEGORY, FAKE_EVIDENCE, FAKE_PLAN_RESPONSE } from "../fixtures/fake-plan";

function evidence(tagId: string, tagName: string, reason = "Observed tag supports this category."): CategoryEvidence {
  return { ...FAKE_EVIDENCE, brandTagId: tagId, brandTagName: tagName, reason };
}

describe("category evidence compaction", () => {
  it("deduplicates by both brand entity and tag identity", () => {
    const first = evidence("fake:coffee", "Coffee");
    const otherTag = evidence("fake:espresso", "Espresso");
    const otherBrand = { ...first, brandEntityId: "00000000-0000-4000-8000-000000000075", brandName: "Fake Other Coffee Co" };
    const compacted = compactCategoryEvidence([first, { ...first }, otherTag, otherBrand]);
    expect(compacted).toHaveLength(3);
    expect(compacted).toContainEqual(first);
    expect(compacted).toContainEqual(otherTag);
    expect(compacted).toContainEqual(otherBrand);
  });

  it("retains the stronger record when a duplicate pair has different evidence kinds", () => {
    const fallback = evidence("fake:coffee", "Coffee", "Generic fallback default; confirm this category.");
    const rule = { ...fallback, reason: "Rule: tag contains 'coffee'" };
    expect(compactCategoryEvidence([fallback, rule])).toEqual([rule]);
  });

  it("caps each category at five strongest distinct records", () => {
    const records = Array.from({ length: 6 }, (_, index) => evidence(`fake:coffee:${index}`, `Coffee ${index}`));
    const specific = evidence("fake:specialty", "Specialty coffee roasting equipment");
    const compacted = compactCategoryEvidence([...records, specific]);
    expect(compacted).toHaveLength(5);
    expect(compacted).toEqual([specific, ...records.slice(0, 4)]);
  });

  it("places agent and rule evidence ahead of defaults and saved preferences", () => {
    const rule = evidence("fake:rule", "Coffee", "Rule: tag contains 'coffee'");
    const agent = evidence("fake:agent", "Tea");
    const defaults = [
      evidence("fake:segment", "Very specific coffee roasting equipment", "Quick-segment default: Fake segment; confirm this category."),
      evidence("fake:generic", "Very specific coffee roasting equipment", "Generic fallback default; confirm this category."),
      evidence("fake:preference", "Very specific coffee roasting equipment", "Saved institution preference; confirm this category."),
    ];
    expect(compactCategoryEvidence([...defaults, agent, rule])).toEqual([rule, agent, ...defaults]);
  });

  it("orders specificity by word count before name length", () => {
    const shortName = evidence("fake:short", "Coffee");
    const longName = evidence("fake:long", "Espresso");
    const twoWords = evidence("fake:two", "Tea shop");
    const threeWords = evidence("fake:three", "Fresh coffee beans");
    expect(compactCategoryEvidence([shortName, longName, twoWords, threeWords])).toEqual([
      threeWords, twoWords, longName, shortName,
    ]);
  });

  it("preserves input order when strength and specificity are equal", () => {
    const first = evidence("fake:first", "Coffee cafe");
    const second = evidence("fake:second", "Coffee shop");
    expect(compactCategoryEvidence([second, first])).toEqual([second, first]);
  });

  it("does not mutate the supplied records or their order", () => {
    const records = [evidence("fake:short", "Coffee"), evidence("fake:long", "Specialty coffee beans")];
    const original = structuredClone(records);
    compactCategoryEvidence(records);
    expect(records).toEqual(original);
  });

  it("accepts an empty evidence list without adding records", () => {
    expect(compactCategoryEvidence([])).toEqual([]);
  });
});

describe("category evidence confirmation", () => {
  it("shows three records initially and groups the remaining two under a toggle", () => {
    const records = ["First", "Second", "Third", "Fourth", "Fifth"].map((name) => evidence(`fake:${name}`, `${name} evidence tag`));
    const plan = { ...FAKE_PLAN_RESPONSE, categories: [{ ...FAKE_CATEGORY, evidence: records }] };
    const html = renderToStaticMarkup(createElement(CategoryConfirm, {
      plan, confirmedCategories: plan.categories, brandOverrides: {}, onChange: vi.fn(),
      onBrandOverride: vi.fn(), onReplan: vi.fn(), onConfirm: vi.fn(),
    }));
    const details = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
    const initiallyVisible = html.replace(details, "");
    expect(details).toContain("+2 more");
    expect(details).not.toMatch(/<details\b[^>]*\bopen(?:[=\s>])/);
    for (const name of ["First", "Second", "Third"]) expect(initiallyVisible).toContain(`${name} evidence tag`);
    for (const name of ["Fourth", "Fifth"]) {
      expect(details).toContain(`${name} evidence tag`);
      expect(initiallyVisible).not.toContain(`${name} evidence tag`);
    }
  });
});
