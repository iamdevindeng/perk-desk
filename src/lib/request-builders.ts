// Builds validated API requests from editable profile fields and confirmed plan choices.
// Called by: the page and request-builder unit tests
import { LIST_MAX_ITEMS, PREFERENCE_MAX_ITEMS, RUN_MAX_CATEGORIES } from "@/lib/config";
import { findPreset } from "@/lib/data";
import {
  CategoryPreferencesSchema, EntityIdSchema, PlanRequestSchema, ProfileSchema, RunRequestSchema, type Branch, type CategoryPreferences, type CategoryTag,
  type PlanRequest, type PlanResponse, type Profile, type RunRequest,
} from "@/lib/types";

export function parseListText(text: string): string[] {
  const names = new Map<string, string>();
  // Commas belong to merchant names; only line breaks separate pasted entries (TASKS.md T8).
  for (const line of text.split(/\r\n|\n|\r/)) {
    const name = line.trim();
    if (!name || names.has(name.toLowerCase())) continue;
    names.set(name.toLowerCase(), name);
    if (names.size >= LIST_MAX_ITEMS) break;
  }
  return Array.from(names.values());
}

function validOverrides(brandNames: string[], overrides: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(overrides).filter(([name, entityId]) =>
    brandNames.includes(name) && EntityIdSchema.safeParse(entityId).success));
}

type UploadedCell = { value: string; nextIndex: number; rowEnded: boolean };

function readUploadedCell(text: string, start: number): UploadedCell {
  let value = "";
  let insideQuotes = false;
  let quoteClosed = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (insideQuotes) {
      if (character !== '"') { value += character; continue; }
      if (text[index + 1] === '"') { value += '"'; index += 1; continue; }
      insideQuotes = false;
      quoteClosed = true;
      continue;
    }
    if ([",", "\r", "\n"].includes(character)) {
      const nextIndex = index + (character === "\r" && text[index + 1] === "\n" ? 2 : 1);
      return { value, nextIndex, rowEnded: character !== "," };
    }
    if (character === '"') {
      if (value.trim() || quoteClosed) throw new Error("Invalid CSV quoting in uploaded list.");
      value = "";
      insideQuotes = true;
      continue;
    }
    if (quoteClosed && character.trim()) throw new Error("Invalid CSV quoting in uploaded list.");
    if (!quoteClosed) value += character;
  }
  if (insideQuotes) throw new Error("Unclosed quoted field in uploaded list.");
  return { value, nextIndex: text.length, rowEnded: true };
}

function uploadedFirstColumn(text: string): string[] {
  const values: string[] = [];
  let nextIndex = 0;
  let firstColumn = true;
  while (nextIndex < text.length) {
    const cell = readUploadedCell(text, nextIndex);
    if (firstColumn) values.push(cell.value);
    firstColumn = cell.rowEnded;
    nextIndex = cell.nextIndex;
  }
  return values;
}

export function parseUploadedList(text: string): string[] {
  // CSV and text uploads both use columns: quote names containing commas (TASKS.md X1).
  const names = uploadedFirstColumn(text).map((value) => value.replace(/\r\n|\r|\n/g, " ").trim()).filter(Boolean);
  if (names.length && /^(name|merchant|brand|business name|merchant name)$/i.test(names[0])) names.shift();
  // A multiline cell is one pasted name, never several merchants; share normal list limits.
  return parseListText(names.join("\n"));
}

export function buildPlanRequest(
  profile: Profile, brandsText: string, presetId?: string, brandOverrides: Record<string, string> = {},
): PlanRequest {
  const brandNames = parseListText(brandsText);
  return PlanRequestSchema.parse({
    presetId, institutionName: profile.institutionName, city: profile.city, branches: profile.branches,
    brandNames, brandOverrides: validOverrides(brandNames, brandOverrides), preferences: profile.categoryPreferences,
  });
}

function resolvedBranches(profile: Profile, plan: PlanResponse): Branch[] {
  // Planning drops unresolved locations; keep those branches editable without sending them to research.
  const plannedIds = new Set(plan.branches.map((branch) => branch.id));
  return profile.branches.filter((branch) => plannedIds.has(branch.id)).map((branch) => {
    if (branch.lat !== undefined && branch.lon !== undefined) return branch;
    const resolved = plan.branches.find((planned) => planned.id === branch.id && planned.address === branch.address);
    // A changed address must be planned again; never reuse its old approximate coordinates.
    return { ...branch, lat: branch.lat ?? resolved?.lat, lon: branch.lon ?? resolved?.lon,
      locationSource: branch.locationSource ?? resolved?.locationSource };
  });
}

function chosenBrands(plan: PlanResponse, overrides: Record<string, string>): RunRequest["brands"] {
  const brands = plan.brands.map((brand) => {
    const selected = brand.candidates.find((candidate) => candidate.entityId === overrides[brand.inputName]);
    return { entityId: selected?.entityId ?? brand.entityId, name: selected?.name ?? brand.name };
  });
  return Array.from(new Map(brands.map((brand) => [brand.entityId, brand])).values());
}

export function buildRunRequest(
  profile: Profile, plan: PlanResponse, confirmedCategories: CategoryTag[],
  brandOverrides: Record<string, string> = {}, presetId?: string,
): RunRequest {
  const excludeEntityIds = Object.entries(profile.merchantStatus)
    .filter(([, entry]) => entry.status === "signed" || entry.status === "not_a_fit").map(([entityId]) => entityId);
  return RunRequestSchema.parse({
    presetId, institutionName: profile.institutionName, city: profile.city,
    branches: resolvedBranches(profile, plan), brands: chosenBrands(plan, brandOverrides), categories: confirmedCategories,
    signedNames: parseListText(profile.signedMerchantsText), businessMemberNames: parseListText(profile.businessMembersText), excludeEntityIds,
  });
}

function recentPreferences(previous: string[], latest: string[]): string[] {
  const entries = new Set<string>();
  for (const tagId of [...previous, ...latest]) {
    entries.delete(tagId);
    entries.add(tagId);
  }
  return [...entries].slice(-PREFERENCE_MAX_ITEMS);
}

export function mergePreferences(previous: CategoryPreferences, planned: CategoryTag[], confirmed: CategoryTag[]): CategoryPreferences {
  const plannedIds = new Set(planned.map((category) => category.tagId));
  const confirmedIds = new Set(confirmed.map((category) => category.tagId));
  const newlyRemoved = [...plannedIds].filter((tagId) => !confirmedIds.has(tagId));
  const newlyAdded = [...confirmedIds].filter((tagId) => !plannedIds.has(tagId));
  // Confirming an old removal reverses it; removing an old addition reverses that choice too.
  const removed = recentPreferences(previous.removed.filter((tagId) => !confirmedIds.has(tagId)), newlyRemoved);
  const added = recentPreferences(previous.added.filter((tagId) => !removed.includes(tagId)), newlyAdded);
  return CategoryPreferencesSchema.parse({ removed, added });
}


type PresetRequestInputs = {
  profile: Profile; brandsText: string; presetId?: string; brandOverrides?: Record<string, string>;
  plan?: PlanResponse | null; canonicalPlan?: PlanResponse | null; confirmedCategories?: CategoryTag[];
};

export function presetRequestChanges(input: PresetRequestInputs): { plan: boolean; run: boolean } {
  const preset = input.presetId ? findPreset(input.presetId) : null;
  if (!preset) return { plan: false, run: false };
  const canonicalProfile = ProfileSchema.parse({ ...preset.profile,
    branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })),
  });
  let plan = true;
  let run = false;
  try {
    const current = buildPlanRequest(input.profile, input.brandsText, input.presetId, input.brandOverrides);
    const original = buildPlanRequest(canonicalProfile, preset.brandsText, preset.id);
    plan = JSON.stringify(current) !== JSON.stringify(original);
  } catch { /* An incomplete edit cannot equal the validated preset request. */ }
  if (input.plan) {
    try {
      const baseline = input.canonicalPlan ?? input.plan;
      const current = buildRunRequest(input.profile, input.plan, input.confirmedCategories ?? input.plan.categories.slice(0, RUN_MAX_CATEGORIES), input.brandOverrides, preset.id);
      const original = buildRunRequest(canonicalProfile, baseline, baseline.categories.slice(0, RUN_MAX_CATEGORIES), {}, preset.id);
      run = JSON.stringify(current) !== JSON.stringify(original);
    } catch { run = true; }
  }
  return { plan, run };
}
