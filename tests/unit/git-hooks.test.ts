// Verifies hook installation skips deployment environments and enforces the required author.
// Called by: npm test, using isolated temporary Git repositories
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const INSTALLER = resolve("scripts/install-hooks.mjs");
const AUTHOR_CHECK = resolve("scripts/check-author.mjs");
const PACKAGE = JSON.parse(readFileSync("package.json", "utf8"));
const HOOK_COMMANDS = [
  { name: "pre-commit", command: "npm run check:privacy && node scripts/check-author.mjs" },
  { name: "pre-push", command: "npm run lint && npm run typecheck && npm test && npm run check:rules && node scripts/check-privacy.mjs --all" },
];
const REQUIRED_EMAIL = "99384331+iamdevindeng@users.noreply.github.com";
const TEST_ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PATH: "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
};
let directory = "";

beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "perk-desk-hooks-")); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

function initializeRepository(): void {
  execFileSync("git", ["init", "--quiet"], { cwd: directory, env: TEST_ENVIRONMENT, stdio: "ignore" });
}

function runScript(script: string, environment: Record<string, string> = {}): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [script], {
    cwd: directory, env: { ...TEST_ENVIRONMENT, ...environment }, encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

function authorEnvironment(name = "Devin Deng", email = REQUIRED_EMAIL): Record<string, string> {
  return { GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: name,
    GIT_CONFIG_KEY_1: "user.email", GIT_CONFIG_VALUE_1: email };
}

describe("local hook installation", () => {
  it("skips archives without Git metadata", () => {
    expect(runScript(INSTALLER)).toEqual({ status: 0, output: "Git hook installation skipped for CI, Vercel, or a non-Git install.\n" });
    expect(existsSync(join(directory, ".git"))).toBe(false);
  });

  it("skips Git metadata files without modifying them", () => {
    const metadata = join(directory, ".git");
    writeFileSync(metadata, "gitdir: elsewhere\n");
    expect(runScript(INSTALLER).status).toBe(0);
    expect(readFileSync(metadata, "utf8")).toBe("gitdir: elsewhere\n");
  });

  it.each(["CI", "VERCEL"])("creates neither hook when %s is set", (variable) => {
    initializeRepository();
    expect(runScript(INSTALLER, { [variable]: "1" })).toEqual({
      status: 0, output: "Git hook installation skipped for CI, Vercel, or a non-Git install.\n",
    });
    for (const hook of HOOK_COMMANDS) expect(existsSync(join(directory, ".git/hooks", hook.name))).toBe(false);
  });

  it.each(["CI", "VERCEL"])("leaves hooks alone when %s is set", (variable) => {
    initializeRepository();
    const hook = join(directory, ".git/hooks/pre-commit");
    writeFileSync(hook, "existing local hook\n");
    expect(runScript(INSTALLER, { [variable]: "1" }).status).toBe(0);
    expect(readFileSync(hook, "utf8")).toBe("existing local hook\n");
    expect(existsSync(join(directory, ".git/hooks/pre-push"))).toBe(false);
  });

  it("installs executable commit/push hooks and preserves unrelated hooks", () => {
    initializeRepository();
    const unrelated = join(directory, ".git/hooks/post-commit");
    writeFileSync(unrelated, "existing unrelated hook\n");
    expect(runScript(INSTALLER).status).toBe(0);
    for (const { name, command } of HOOK_COMMANDS) {
      const hook = join(directory, ".git/hooks", name);
      expect(readFileSync(hook, "utf8")).toBe(`#!/bin/sh\n${command}\n`);
      expect(statSync(hook).mode & 0o111).toBe(0o111);
    }
    expect(readFileSync(unrelated, "utf8")).toBe("existing unrelated hook\n");
  });

  it("replaces old hooks and makes existing non-executable files executable", () => {
    initializeRepository();
    for (const { name } of HOOK_COMMANDS) {
      const hook = join(directory, ".git/hooks", name);
      writeFileSync(hook, "old hook\n");
      chmodSync(hook, 0o644);
    }
    expect(runScript(INSTALLER).status).toBe(0);
    for (const { name, command } of HOOK_COMMANDS) {
      const hook = join(directory, ".git/hooks", name);
      expect(readFileSync(hook, "utf8")).toBe(`#!/bin/sh\n${command}\n`);
      expect(statSync(hook).mode & 0o111).toBe(0o111);
    }
  });

  it("creates the hooks directory when it is missing", () => {
    initializeRepository();
    rmSync(join(directory, ".git/hooks"), { recursive: true });
    expect(runScript(INSTALLER).status).toBe(0);
    for (const { name } of HOOK_COMMANDS) expect(existsSync(join(directory, ".git/hooks", name))).toBe(true);
  });

  it("reports an unwritable hooks location as a failed install", () => {
    initializeRepository();
    rmSync(join(directory, ".git/hooks"), { recursive: true });
    writeFileSync(join(directory, ".git/hooks"), "not a directory\n");
    expect(runScript(INSTALLER)).toEqual({ status: 1, output: "Git hook installation failed.\n" });
  });

  it("keeps the guarded prepare script without the third-party hook installer", () => {
    expect(PACKAGE).not.toHaveProperty("simple-git-hooks");
    expect(PACKAGE.devDependencies).not.toHaveProperty("simple-git-hooks");
    expect(PACKAGE.scripts.prepare).toBe("node scripts/install-hooks.mjs");
  });
});

describe("required commit identity", () => {
  beforeEach(initializeRepository);

  it("accepts the exact required configuration and effective author", () => {
    expect(runScript(AUTHOR_CHECK, authorEnvironment()).status).toBe(0);
  });

  it.each([
    authorEnvironment("Wrong Author"), authorEnvironment("Devin Deng", "wrong@example.com"),
    { ...authorEnvironment(), GIT_AUTHOR_NAME: "Wrong Override" },
    { ...authorEnvironment(), GIT_AUTHOR_EMAIL: "wrong@example.com" },
    {},
  ])("blocks missing, wrong, or overridden author identity without echoing values", (environment) => {
    const result = runScript(AUTHOR_CHECK, environment);
    expect(result.status).toBe(1);
    expect(result.output).toContain("Commit blocked");
    expect(result.output).not.toContain("Wrong");
    expect(result.output).not.toContain("wrong@example.com");
  });
});
