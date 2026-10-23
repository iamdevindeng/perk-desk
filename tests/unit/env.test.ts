// Checks lazy environment defaults, optional services, and cache resetting.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QLOO_BASE_URL_DEFAULT } from "@/lib/config";
import {
  getEnv,
  hasDeepSeekKey,
  hasQlooKey,
  hasUpstash,
  isAgentDisabled,
  resetEnvForTests,
} from "@/lib/env";

const ENVIRONMENT_NAMES = [
  "QLOO_API_KEY",
  "QLOO_BASE_URL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "JUDGE_BYPASS_CODE",
  "PD_AGENT_DISABLED",
];

beforeEach(() => {
  for (const name of ENVIRONMENT_NAMES) vi.stubEnv(name, undefined);
  resetEnvForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("environment configuration", () => {
  it("allows missing keys and applies the documented defaults", () => {
    expect(hasQlooKey()).toBe(false);
    expect(hasDeepSeekKey()).toBe(false);
    expect(hasUpstash()).toBe(false);
    expect(isAgentDisabled()).toBe(false);
    expect(getEnv().QLOO_BASE_URL).toBe(QLOO_BASE_URL_DEFAULT);
    expect(getEnv().DEEPSEEK_MODEL).toBe("deepseek-flash");
  });

  it("enables deterministic mode only for the exact value 1", () => {
    vi.stubEnv("PD_AGENT_DISABLED", "true");
    expect(isAgentDisabled()).toBe(false);
    vi.stubEnv("PD_AGENT_DISABLED", "1");
    resetEnvForTests();
    expect(isAgentDisabled()).toBe(true);
  });

  it("reuses the first parsed environment until reset", () => {
    const environment = getEnv();
    vi.stubEnv("DEEPSEEK_MODEL", "test-model");
    expect(getEnv()).toBe(environment);
    expect(getEnv().DEEPSEEK_MODEL).toBe("deepseek-flash");
    resetEnvForTests();
    expect(getEnv().DEEPSEEK_MODEL).toBe("test-model");
  });

  it("treats empty credentials as absent", () => {
    vi.stubEnv("QLOO_API_KEY", " ");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    expect(hasQlooKey()).toBe(false);
    expect(hasDeepSeekKey()).toBe(false);
  });

  it("requires both Upstash settings", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.invalid");
    expect(hasUpstash()).toBe(false);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-placeholder");
    resetEnvForTests();
    expect(hasUpstash()).toBe(true);
  });
});
