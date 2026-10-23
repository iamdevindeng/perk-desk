// Reads and validates optional server environment values on first use.
// Called by: Qloo, agent, cache, rate-limit, eval, and smoke modules
import { z } from "zod";
import { QLOO_BASE_URL_DEFAULT } from "@/lib/config";

const AppEnvSchema = z.object({
  QLOO_API_KEY: z.string().optional(),
  QLOO_BASE_URL: z.string().optional().default(QLOO_BASE_URL_DEFAULT),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().optional().default("deepseek-flash"),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  JUDGE_BYPASS_CODE: z.string().optional(),
  PD_AGENT_DISABLED: z.string().optional(),
});

export type AppEnv = z.infer<typeof AppEnvSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  // Lazy parsing keeps builds and keyless unit tests safe. See TASKS.md T1.
  cachedEnv ??= AppEnvSchema.parse(process.env);
  return cachedEnv;
}

export function hasQlooKey(): boolean {
  return Boolean(getEnv().QLOO_API_KEY?.trim());
}

export function hasDeepSeekKey(): boolean {
  return Boolean(getEnv().DEEPSEEK_API_KEY?.trim());
}

export function hasUpstash(): boolean {
  const environment = getEnv();
  return Boolean(
    environment.UPSTASH_REDIS_REST_URL?.trim() &&
      environment.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

export function isAgentDisabled(): boolean {
  return getEnv().PD_AGENT_DISABLED === "1";
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}
