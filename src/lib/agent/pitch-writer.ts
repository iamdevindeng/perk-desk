// Selects verified facts in one model call and renders pitches with code-owned sentences.
// Called by: run-agent after deterministic shortlist and chain checks.
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { PITCH_TIMEOUT_MS } from "@/lib/config";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { checkPitch } from "@/lib/agent/guards";
import { PitchFactSchema, renderFactPitch } from "@/lib/fallback/pitch-template";
import { agentModel, AGENT_CALL_SETTINGS } from "@/lib/agent/model";
import { buildPitchPrompt, PITCH_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { EntityIdSchema } from "@/lib/types";
import type { MerchantResult } from "@/lib/types";

const PitchOutputSchema = z.strictObject({ pitches: z.array(z.strictObject({ entityId: EntityIdSchema, fact: PitchFactSchema })) });
type PitchOutput = z.infer<typeof PitchOutputSchema>;

function validPitches(output: PitchOutput, merchants: MerchantResult[], institutionName: string): Map<string, string> {
  const cards = new Map(merchants.map((merchant) => [merchant.place.entityId, merchant]));
  const pitches = new Map<string, string>();
  const seenIds = new Set<string>();
  for (const item of output.pitches) {
    const card = cards.get(item.entityId);
    // Conflicting duplicate selections are ambiguous; the whole card falls back deterministically.
    if (seenIds.has(item.entityId)) { pitches.delete(item.entityId); continue; }
    seenIds.add(item.entityId);
    if (!card) continue;
    const pitch = renderFactPitch(card, institutionName, item.fact);
    if (pitch && checkPitch(pitch, card, institutionName)) pitches.set(item.entityId, pitch);
  }
  return pitches;
}

export async function writePitches(
  merchants: MerchantResult[], institutionName: string, options: { model?: LanguageModel; signal?: AbortSignal } = {},
): Promise<Map<string, string>> {
  if (options.signal?.aborted) throw new Error("Research stopped.");
  if (!merchants.length || isAgentDisabled() || (!options.model && !hasDeepSeekKey())) return new Map();
  try {
    const result = await generateText({
      model: options.model ?? agentModel(), ...AGENT_CALL_SETTINGS,
      instructions: PITCH_SYSTEM_PROMPT, prompt: buildPitchPrompt({ merchants, institutionName }),
      output: Output.object({ schema: PitchOutputSchema }), abortSignal: AbortSignal.any([AbortSignal.timeout(PITCH_TIMEOUT_MS), ...(options.signal ? [options.signal] : [])]),
    });
    return validPitches(PitchOutputSchema.parse(result.output), merchants, institutionName);
  } catch {
    // Provider/structured-output failures must reach orchestration; card guard failures stay local.
    throw new Error("Pitch writing was unavailable; template pitches were used.");
  }
}
