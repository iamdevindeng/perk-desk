// Checks evidence deduplication, priority, limits, and the collapsed confirmation display.
// Called by: npm test; all evidence is hand-written synthetic data.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CategoryConfirm from "@/components/CategoryConfirm";
import { compactCategoryEvidence } from "@/lib/agent/guards";
import type { CategoryEvidence } from "@/lib/types";
import { FAKE_CATEGORY, FAKE_EVIDENCE, FAKE_PLAN_RESPONSE } from "../fixtures/fake-plan";

function evidence(tagId: string, tagName: string, reason = "Observed tag supports this category."): typeof FAKE_EVIDENCE {
  return { ...FAKE_EVIDENCE, brandTagId: tagId, brandTagName: tagName, reason };
}

function renderEvidence(records: CategoryEvidence[]): string {
  const plan = { ...FAKE_PLAN_RESPONSE, categories: [{ ...FAKE_CATEGORY, evidence: records }] };
  return renderToStaticMarkup(createElement(CategoryConfirm, {
    plan, confirmedCategories: plan.categories, brandOverrides: {}, onChange: vi.fn(),
    onBrandOverride: vi.fn(), onReplan: vi.fn(), onConfirm: vi.fn(),
  }));
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

  it("retains the more specific record when a brand and tag pair is repeated", () => {
    const broad = evidence("fake:coffee", "Coffee");
    const specific = { ...broad, brandTagName: "Specialty coffee roasting equipment" };
    expect(compactCategoryEvidence([broad, specific])).toEqual([specific]);
  });

  it("caps each category at five strongest distinct records", () => {
    const records = Array.from({ length: 6 }, (_, index) => evidence(`fake:coffee:${index}`, `Coffee ${index}`));
    const specific = evidence("fake:specialty", "Specialty coffee roasting equipment");
    const compacted = compactCategoryEvidence([...records, specific]);
    expect(compacted).toHaveLength(5);
    expect(compacted).toEqual([specific, ...records.slice(0, 4)]);
  });

  it("places agent and rule evidence ahead of defaults and saved preferences", () => {
    const rule: CategoryEvidence = { ...evidence("fake:rule", "Coffee"), kind: "rule", reason: "Rule: tag contains 'coffee'" };
    const agent = evidence("fake:agent", "Tea");
    const defaults: CategoryEvidence[] = [
      { kind: "default", reason: "Quick-segment default: Fake segment; confirm this category." },
      { kind: "default", reason: "Generic fallback default; confirm this category." },
      { kind: "preference", reason: "Saved institution preference; confirm this category." },
    ];
    expect(compactCategoryEvidence([...defaults, agent, rule])).toEqual([rule, agent, ...defaults]);
  });

  it("uses explicit kinds instead of inferring evidence strength from reason text", () => {
    const agent = evidence("fake:agent", "Coffee", "Generic fallback text appears in this explanation.");
    const fallback: CategoryEvidence = { kind: "default", reason: "Rule: this remains a default suggestion." };
    expect(compactCategoryEvidence([fallback, agent])).toEqual([agent, fallback]);
  });

  it("deduplicates non-brand evidence by kind and reason without merging distinct suggestions", () => {
    const fallback: CategoryEvidence = { kind: "default", reason: "Confirm this suggestion." };
    const preference: CategoryEvidence = { kind: "preference", reason: "Confirm this suggestion." };
    const otherDefault: CategoryEvidence = { kind: "default", reason: "Another quick-segment suggestion." };
    expect(compactCategoryEvidence([fallback, preference, { ...fallback }, otherDefault])).toEqual([
      fallback, preference, otherDefault,
    ]);
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
    const html = renderEvidence(records);
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

  it.each([
    { kind: "preference", label: "Saved preference" },
    { kind: "default", label: "Default suggestion" },
  ] as const)("labels $kind evidence without a borrowed brand-tag arrow", ({ kind, label }) => {
    const html = renderEvidence([{ kind, reason: "Confirm this suggested category." }]);
    expect(html).toContain(label);
    expect(html).toContain("Confirm this suggested category.");
    expect(html).not.toContain("→");
    expect(html).not.toContain("undefined");
  });

  it.each(["agent", "rule"] as const)("keeps the observed brand and tag arrow for %s evidence", (kind) => {
    const html = renderEvidence([{ ...evidence("fake:observed", "Observed specialty coffee"), kind }]);
    expect(html).toContain("Observed specialty coffee");
    expect(html).toContain("→");
    expect(html).not.toContain("Default suggestion");
    expect(html).not.toContain("Saved preference");
  });
});
