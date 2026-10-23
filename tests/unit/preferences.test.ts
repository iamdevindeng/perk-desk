// Checks institution preferences record current edits and keep recent, consistent history.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { mergePreferences } from "@/lib/request-builders";
import type { CategoryTag } from "@/lib/types";

function category(slug: string): CategoryTag {
  return { tagId: `urn:tag:category:place:${slug}`, label: slug };
}

const COFFEE = category("coffee_shop");
const CAFE = category("cafe");
const BAKERY = category("bakery");

describe("category preference memory", () => {
  it("records only the difference between planned and confirmed categories", () => {
    expect(mergePreferences({ removed: [], added: [] }, [COFFEE, CAFE], [COFFEE, BAKERY])).toEqual({
      removed: [CAFE.tagId], added: [BAKERY.tagId],
    });
  });

  it("reverses an earlier removal when that category is confirmed again", () => {
    expect(mergePreferences({ removed: [COFFEE.tagId], added: [] }, [CAFE], [CAFE, COFFEE])).toEqual({ removed: [], added: [COFFEE.tagId] });
    expect(mergePreferences({ removed: [COFFEE.tagId], added: [] }, [COFFEE], [COFFEE])).toEqual({ removed: [], added: [] });
  });

  it("removes an earlier addition when the user now removes it", () => {
    expect(mergePreferences({ removed: [], added: [COFFEE.tagId, BAKERY.tagId] }, [COFFEE, CAFE], [CAFE])).toEqual({ removed: [COFFEE.tagId], added: [BAKERY.tagId] });
  });

  it("deduplicates history and resolves old contradictions in favor of removal", () => {
    const previous = { removed: [COFFEE.tagId, COFFEE.tagId], added: [COFFEE.tagId, BAKERY.tagId, BAKERY.tagId] };
    expect(mergePreferences(previous, [], [])).toEqual({ removed: [COFFEE.tagId], added: [BAKERY.tagId] });
    expect(previous.removed).toHaveLength(2);
  });

  it("keeps the last 50 entries in each list and moves repeated choices to the end", () => {
    const oldRemoved = Array.from({ length: 50 }, (_, index) => category(`removed_${index}`).tagId);
    const oldAdded = Array.from({ length: 50 }, (_, index) => category(`added_${index}`).tagId);
    const merged = mergePreferences({ removed: oldRemoved, added: oldAdded }, [COFFEE], [BAKERY]);
    expect(merged.removed).toHaveLength(50);
    expect(merged.added).toHaveLength(50);
    expect(merged.removed[0]).toBe(oldRemoved[1]);
    expect(merged.removed[49]).toBe(COFFEE.tagId);
    expect(merged.added[49]).toBe(BAKERY.tagId);
    expect(mergePreferences({ removed: [COFFEE.tagId, CAFE.tagId], added: [] }, [COFFEE], []).removed).toEqual([CAFE.tagId, COFFEE.tagId]);
  });
});
