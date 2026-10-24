// Verifies hook installation skips deployment environments and enforces the required author.
// Called by: npm test, using isolated temporary Git repositories
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const INSTALLER = resolve("scripts/install-hooks.mjs");
const AUTHOR_CHECK = resolve("scripts/check-author.mjs");
const PACKAGE = JSON.parse(readFileSync("package.json", "utf8"));
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
  writeFileSync(join(directory, "package.json"), JSON.stringify({ "simple-git-hooks": PACKAGE["simple-git-hooks"] }));
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
    expect(runScript(INSTALLER)).toMatchObject({ status: 0 });
    expect(existsSync(join(directory, ".git"))).toBe(false);
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
    for (const name of ["pre-commit", "pre-push"]) {
      const hook = join(directory, ".git/hooks", name);
      expect(readFileSync(hook, "utf8")).toContain(PACKAGE["simple-git-hooks"][name]);
      expect(statSync(hook).mode & 0o111).toBe(0o111);
    }
    expect(readFileSync(unrelated, "utf8")).toBe("existing unrelated hook\n");
  });

  it("reports invalid hook configuration as a failed install", () => {
    initializeRepository();
    writeFileSync(join(directory, "package.json"), "{}");
    expect(runScript(INSTALLER)).toEqual({ status: 1, output: "Git hook installation failed.\n" });
  });

  it("keeps every required check in the installed commands", () => {
    expect(PACKAGE["simple-git-hooks"]["pre-commit"]).toBe("npm run check:privacy && node scripts/check-author.mjs");
    expect(PACKAGE["simple-git-hooks"]["pre-push"]).toBe(
      "npm run lint && npm run typecheck && npm test && npm run check:rules && node scripts/check-privacy.mjs --all",
    );
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
