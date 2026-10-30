// Validates plan choices, category evidence, and recruiting pitches against observed data.
// Called by: submitPlan, fallback validation, pitch generation, and guard unit tests.
import { z } from "zod";
import { CATEGORY_EVIDENCE_MAX, PLAN_MAX_CATEGORIES, TRACE_SUMMARY_MAX } from "@/lib/config";
import { getBlacklist } from "@/lib/data";
import { isControlledPitch } from "@/lib/fallback/pitch-template";
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

export function checkPitch(pitch: string, card: MerchantResult, institutionName = ""): boolean {
  // Validate membership in a finite grammar, never infer factual truth from arbitrary model prose.
  return isControlledPitch(pitch, card, institutionName);
}
