// Validates plan choices, category evidence, and recruiting pitches against observed data.
// Called by: submitPlan, fallback validation, pitch generation, and guard unit tests.
import { z } from "zod";
import { CATEGORY_EVIDENCE_MAX, PLAN_MAX_CATEGORIES, TRACE_SUMMARY_MAX, PITCH_MAX_CHARACTERS, PITCH_MAX_SENTENCES, PITCH_CALL_MINUTES } from "@/lib/config";
import { getBlacklist } from "@/lib/data";
import { filterAllowedBrandTags } from "@/lib/qloo/search";
import { CategoryTagIdSchema } from "@/lib/types";
import type { BrandCandidate, CategoryEvidence, MerchantResult, PlannedCategory, TagRef } from "@/lib/types";
import type { PlanContext } from "@/lib/agent/context";

const EvidenceSubmissionSchema = z.object({
  brandEntityId: z.string(), brandTagId: z.string(), reason: z.string().max(TRACE_SUMMARY_MAX),
});
export const PlanSubmissionSchema = z.object({
  brandChoices: z.array(z.object({ inputName: z.string(), entityId: z.string() })).default([]),
  categories: z.array(z.object({ tagId: z.string(), evidence: z.array(EvidenceSubmissionSchema) })),
});
export type PlanSubmission = z.infer<typeof PlanSubmissionSchema>;
type EvidenceSubmission = z.infer<typeof EvidenceSubmissionSchema>;
type GuardResult = { kept: PlannedCategory[]; errors: string[] };

export function categoryEvidenceKey(evidence: CategoryEvidence): string {
  return "brandEntityId" in evidence ? JSON.stringify([evidence.brandEntityId, evidence.brandTagId])
    : JSON.stringify([evidence.kind, evidence.reason]);
}

function compareEvidence(first: CategoryEvidence, second: CategoryEvidence): number {
  const firstName = "brandTagName" in first ? first.brandTagName.trim() : "";
  const secondName = "brandTagName" in second ? second.brandTagName.trim() : "";
  const strength = Number("brandEntityId" in second) - Number("brandEntityId" in first);
  // Without a tag hierarchy, longer multi-word names are our specificity heuristic.
  return strength || secondName.split(/\s+/).length - firstName.split(/\s+/).length || secondName.length - firstName.length;
}

export function compactCategoryEvidence(evidence: CategoryEvidence[]): CategoryEvidence[] {
  const unique = new Map<string, CategoryEvidence>();
  for (const item of [...evidence].sort(compareEvidence)) {
    const key = categoryEvidenceKey(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, CATEGORY_EVIDENCE_MAX);
}

export function checkCategoryCandidate(
  tagId: string, candidates: Map<string, string>, blacklist: string[] = getBlacklist().categorySlugKeywords,
): boolean {
  if (!CategoryTagIdSchema.safeParse(tagId).success || !candidates.has(tagId)) return false;
  const slug = tagId.slice("urn:tag:category:place:".length);
  return !blacklist.some((keyword) => slug.includes(keyword));
}

export function checkEvidence(
  evidence: unknown, brandTags: Map<string, TagRef[]>, chosenIds: Set<string>,
): boolean {
  const parsed = EvidenceSubmissionSchema.safeParse(evidence);
  if (!parsed.success || !parsed.data.reason.trim() || !chosenIds.has(parsed.data.brandEntityId)) return false;
  // Recheck compliance even if a caller accidentally stored unfiltered tags (ARCHITECTURE §5.4–5.5).
  const allowed = filterAllowedBrandTags(brandTags.get(parsed.data.brandEntityId) ?? []);
  return allowed.some((tag) => tag.id === parsed.data.brandTagId);
}

function reject(context: PlanContext, errors: string[], layer: 1 | 2, message: string): void {
  const summary = message.slice(0, TRACE_SUMMARY_MAX);
  errors.push(summary);
  context.emit({ type: "guard", at: 0, layer, summary });
}

function selectBrands(submission: PlanSubmission, context: PlanContext, errors: string[]): void {
  const choices = new Map<string, string>();
  for (const choice of submission.brandChoices) {
    if (!context.brandsByInput.has(choice.inputName) || choices.has(choice.inputName)) {
      reject(context, errors, 1, `Ignored unknown or repeated brand choice: ${choice.inputName}.`);
      continue;
    }
    choices.set(choice.inputName, choice.entityId);
  }
  for (const resolution of context.brandsByInput.values()) {
    const selectedId = choices.get(resolution.inputName);
    if (resolution.status === "resolved" && resolution.chosen) {
      if (selectedId && selectedId !== resolution.chosen.entityId) {
        reject(context, errors, 1, `Kept the resolved brand for ${resolution.inputName}.`);
      }
      continue;
    }
    const selected = resolution.candidates.find((candidate) => candidate.entityId === selectedId);
    resolution.chosen = selected ?? resolution.candidates[0];
    resolution.matchKind = selected ? "agent" : "fallback";
    if (selectedId && !selected) reject(context, errors, 1, `Invalid brand choice for ${resolution.inputName}; used the first candidate.`);
    // Preserve original ambiguity so the agent's one correction may change its own choice.
  }
}

function chosenBrands(context: PlanContext): Map<string, BrandCandidate> {
  const brands = new Map<string, BrandCandidate>();
  for (const resolution of context.brandsByInput.values()) {
    if (resolution.chosen) brands.set(resolution.chosen.entityId, resolution.chosen);
  }
  return brands;
}

function buildEvidence(
  submitted: EvidenceSubmission[], context: PlanContext, brands: Map<string, BrandCandidate>, errors: string[],
): CategoryEvidence[] {
  const evidence: CategoryEvidence[] = [];
  const chosenIds = new Set(brands.keys());
  for (const item of submitted) {
    if (!checkEvidence(item, context.brandTags, chosenIds)) {
      reject(context, errors, 2, "Dropped evidence without a chosen brand, permitted observed tag, or non-empty reason.");
      continue;
    }
    const brand = brands.get(item.brandEntityId);
    const tag = filterAllowedBrandTags(context.brandTags.get(item.brandEntityId) ?? []).find((entry) => entry.id === item.brandTagId);
    if (!brand || !tag) continue;
    evidence.push({
      kind: "agent", brandEntityId: brand.entityId, brandName: brand.name, brandTagId: tag.id,
      brandTagName: tag.name, reason: item.reason.trim(),
    });
  }
  return compactCategoryEvidence(evidence);
}

export function applyPlanGuards(submission: unknown, context: PlanContext): GuardResult {
  const errors: string[] = [];
  const parsed = PlanSubmissionSchema.safeParse(submission);
  if (!parsed.success) {
    reject(context, errors, 1, "The submitted plan has an invalid structure.");
    return { kept: [], errors };
  }
  selectBrands(parsed.data, context, errors);
  const brands = chosenBrands(context);
  const kept: PlannedCategory[] = [];
  for (const category of parsed.data.categories) {
    if (!checkCategoryCandidate(category.tagId, context.candidateCategories)) {
      reject(context, errors, 1, `Dropped an invalid, unobserved, or blacklisted category: ${category.tagId}.`);
      continue;
    }
    if (kept.some((existing) => existing.tagId === category.tagId) || kept.length >= PLAN_MAX_CATEGORIES) {
      reject(context, errors, 1, `Dropped a duplicate or excess category: ${category.tagId}.`);
      continue;
    }
    const evidence = buildEvidence(category.evidence, context, brands, errors);
    if (!evidence.length) {
      reject(context, errors, 2, `Dropped a category without valid evidence: ${category.tagId}.`);
      continue;
    }
    kept.push({
      tagId: category.tagId, label: context.candidateCategories.get(category.tagId) ?? category.tagId,
      evidence, source: "agent", knownIndependents: context.knownDensities.get(category.tagId),
    });
  }
  return { kept, errors };
}

function maskCardLabels(pitch: string, card: MerchantResult): string {
  const labels = [card.place.name, card.branchName, card.categoryLabel, ...card.brandShares.map((brand) => brand.brandName)];
  let masked = pitch;
  for (const label of labels.filter(Boolean).sort((first, second) => second.length - first.length)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wholeLabel = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu");
    masked = masked.replace(wholeLabel, "NAME");
  }
  return masked;
}

function allowedPitchNumbers(card: MerchantResult): Set<string> {
  const numbers = [
    card.place.businessRating, card.place.tripadvisorRating, card.place.tripadvisorCount,
    Number((card.distanceMeters / 1000).toFixed(1)),
    card.rankLift === null ? undefined : Math.abs(card.rankLift), PITCH_CALL_MINUTES,
    ...card.brandShares.map((brand) => brand.sharePercent),
  ];
  return new Set(numbers.filter((number) => number !== undefined).map(String));
}

function hasUnsupportedPitchClaim(pitch: string, card: MerchantResult): boolean {
  // Cards contain neither negotiated offers nor partnership agreements; allowed numbers do not prove either.
  const agreement = /\b(?:agreed|confirmed|approved)\b[^.!?]*\b(?:offer|discount|partner(?:ship)?|deal|join|participate)\b|\b(?:partner(?:ship)?|deal)\b[^.!?]*\b(?:agreed|confirmed|approved)\b|\b(?:have|has|already)\s+partnered\b|\b(?:is|are)\s+(?:our|your)\s+partner\b/i;
  const discount = /\b\d+(?:\.\d+)?[\s-]*(?:%|percent|dollars?)?[\s-]*(?:off|discount|savings?)\b|\b(?:discount|savings?|save)\s+(?:of\s+)?\$?\d/i;
  if (agreement.test(pitch) || discount.test(pitch)) return true;
  if (card.tasteSignal) return false;
  const memberPreference = /\bmembers?[’']?\s+(?:favou?rites?|preferences?|tastes?|prefer\w*|love\w*|enjoy\w*)\b|\b(?:favou?rites?|loved|preferred|popular)\s+(?:of|among|with|by)\s+(?:(?:our|your|the)\s+)?members?\b/i;
  const tasteLink = /\b(?:taste|preference|affinity)\s+(?:data\s+)?(?:links?|match(?:es)?|connections?|fit)\b|\b(?:match(?:es)?|fits?)\s+(?:(?:our|your|the)\s+)?members?[’']?\s+(?:tastes?|preferences?)\b/i;
  return memberPreference.test(pitch) || tasteLink.test(pitch);
}

export function checkPitch(pitch: string, card: MerchantResult): boolean {
  if (!pitch.trim() || pitch.length > PITCH_MAX_CHARACTERS || !pitch.includes(card.place.name)) return false;
  // Card labels can contain digits and periods; those identify businesses rather than assert metrics.
  const masked = maskCardLabels(pitch, card);
  if (hasUnsupportedPitchClaim(masked, card)) return false;
  const withoutDecimals = masked.replace(/(\d)\.(\d)/g, "$1 $2");
  const sentences = (withoutDecimals.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).filter((sentence) => sentence.trim());
  if (sentences.length > PITCH_MAX_SENTENCES) return false;
  const allowed = allowedPitchNumbers(card);
  return (masked.match(/\d+(?:\.\d+)?/g) ?? []).every((number) => allowed.has(String(Number(number))));
}
