// Creates the DeepSeek model and deterministic settings shared by agent calls.
// Called by: plan/run agents and the pitch writer
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { getEnv } from "@/lib/env";

export const AGENT_CALL_SETTINGS = {
  temperature: 0,
  maxRetries: 1,
  providerOptions: { deepseek: { thinking: { type: "disabled" } } },
} as const;

export function agentModel(): LanguageModel {
  const environment = getEnv();
  return createDeepSeek({ apiKey: environment.DEEPSEEK_API_KEY })(environment.DEEPSEEK_MODEL);
}
