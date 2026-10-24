// Generates one batch of recruiting pitches and keeps only grounded pitches for known merchants.
// Called by: run-agent after deterministic shortlist and chain checks.
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { PITCH_TIMEOUT_MS } from "@/lib/config";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { checkPitch } from "@/lib/agent/guards";
import { agentModel, AGENT_CALL_SETTINGS } from "@/lib/agent/model";
import { buildPitchPrompt, PITCH_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { EntityIdSchema } from "@/lib/types";
import type { MerchantResult } from "@/lib/types";

const PitchOutputSchema = z.object({ pitches: z.array(z.object({ entityId: EntityIdSchema, pitch: z.string() })) });
type PitchOutput = z.infer<typeof PitchOutputSchema>;

function validPitches(output: PitchOutput, merchants: MerchantResult[]): Map<string, string> {
  const cards = new Map(merchants.map((merchant) => [merchant.place.entityId, merchant]));
  const pitches = new Map<string, string>();
  for (const item of output.pitches) {
    const card = cards.get(item.entityId);
    if (!card || pitches.has(item.entityId) || !checkPitch(item.pitch, card)) continue;
    pitches.set(item.entityId, item.pitch);
  }
  return pitches;
}

export async function writePitches(
  merchants: MerchantResult[], institutionName: string, options: { model?: LanguageModel } = {},
): Promise<Map<string, string>> {
  if (!merchants.length || isAgentDisabled() || (!options.model && !hasDeepSeekKey())) return new Map();
  try {
    const result = await generateText({
      model: options.model ?? agentModel(), ...AGENT_CALL_SETTINGS,
      instructions: PITCH_SYSTEM_PROMPT, prompt: buildPitchPrompt({ merchants, institutionName }),
      output: Output.object({ schema: PitchOutputSchema }), abortSignal: AbortSignal.timeout(PITCH_TIMEOUT_MS),
    });
    return validPitches(PitchOutputSchema.parse(result.output), merchants);
  } catch {
    // Provider/structured-output failures must reach orchestration; card guard failures stay local.
    throw new Error("Pitch writing was unavailable; template pitches were used.");
  }
}
