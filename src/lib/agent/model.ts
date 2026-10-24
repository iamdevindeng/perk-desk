// Creates the DeepSeek model and deterministic settings shared by agent calls.
// Called by: plan/run agents and the pitch writer
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { getEnv } from "@/lib/env";
import { recordUsageCall } from "@/lib/store/usage";

export const AGENT_CALL_SETTINGS = {
  temperature: 0,
  maxRetries: 1,
  providerOptions: { deepseek: { thinking: { type: "disabled" } } },
} as const;

async function fetchModel(input: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  // Provider transport sees every model step, pitch request, and SDK retry (FIXES-R2 R10c).
  recordUsageCall("llm");
  return await fetch(input, options);
}

export function agentModel(): LanguageModel {
  const environment = getEnv();
  return createDeepSeek({ apiKey: environment.DEEPSEEK_API_KEY, fetch: fetchModel })(environment.DEEPSEEK_MODEL);
}
