// Creates disposable Git repositories for privacy guard tests without inheriting credentials.
// Called by: tests/unit/privacy-*.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CHECKER_PATH = resolve("scripts/check-privacy.mjs");
const TEST_ENVIRONMENT: NodeJS.ProcessEnv = {
  PATH: "/usr/bin:/bin", NODE_ENV: "test", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Fake Author", GIT_AUTHOR_EMAIL: "fake@example.com",
  GIT_COMMITTER_NAME: "Fake Author", GIT_COMMITTER_EMAIL: "fake@example.com",
};

export function privacyGit(directory: string, argumentsList: string[]): void {
  execFileSync("git", argumentsList, { cwd: directory, env: TEST_ENVIRONMENT, stdio: "pipe" });
}

export function createPrivacyRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "perk-desk-privacy-"));
  privacyGit(directory, ["init", "--quiet", "--template="]);
  return directory;
}

export function writePrivacyFile(directory: string, file: string, contents: string | Buffer, staged = true): void {
  const filename = join(directory, file);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, contents);
  if (staged) privacyGit(directory, ["add", "--", file]);
}

export function runPrivacyCheck(directory: string, argumentsList: string[] = [],
  environment: Record<string, string> = {}): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [CHECKER_PATH, ...argumentsList], {
    cwd: directory, env: { ...TEST_ENVIRONMENT, ...environment }, encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}
