// Checks that privacy enforcement reads Git snapshots and covers every tracked file on push.
// Called by: npm test; each test uses an isolated index and synthetic content
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrivacyRepository, privacyGit, runPrivacyCheck, writePrivacyFile } from "../fixtures/privacy-repository";

let directory = "";
beforeEach(() => { directory = createPrivacyRepository(); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });
const makeSecret = (): string => "sk-" + "s".repeat(24);

describe("Git snapshot privacy checks", () => {
  it("ignores unstaged and untracked content in a normal pre-commit scan", () => {
    writePrivacyFile(directory, "tracked.txt", "Clean baseline\n");
    privacyGit(directory, ["commit", "--quiet", "-m", "Synthetic baseline"]);
    writePrivacyFile(directory, "tracked.txt", makeSecret(), false);
    writePrivacyFile(directory, "untracked.txt", makeSecret(), false);
    expect(runPrivacyCheck(directory).status).toBe(0);
  });

  it("still blocks a staged secret after the working file is cleaned", () => {
    const secret = makeSecret();
    writePrivacyFile(directory, "notes.txt", secret);
    writePrivacyFile(directory, "notes.txt", "Clean worktree\n", false);
    const result = runPrivacyCheck(directory);
    expect(result.status).toBe(1);
    expect(result.output).toContain("notes.txt:1");
    expect(result.output).toContain("secret-format");
    expect(result.output).not.toContain(secret);
  });

  it("scans the staged clean blob even when its worktree copy contains a secret", () => {
    writePrivacyFile(directory, "notes.txt", "Clean staged text\n");
    writePrivacyFile(directory, "notes.txt", makeSecret(), false);
    expect(runPrivacyCheck(directory).status).toBe(0);
    expect(runPrivacyCheck(directory, ["--all"]).status).toBe(1);
  });

  it("full-tree scanning catches a committed secret with no staged changes", () => {
    writePrivacyFile(directory, "notes.txt", makeSecret());
    privacyGit(directory, ["commit", "--quiet", "-m", "Synthetic baseline"]);
    expect(runPrivacyCheck(directory).status).toBe(0);
    expect(runPrivacyCheck(directory, ["--all"]).status).toBe(1);
  });

  it("full-tree scanning cannot hide a staged secret behind clean worktree content", () => {
    writePrivacyFile(directory, "notes.txt", makeSecret());
    writePrivacyFile(directory, "notes.txt", "Clean worktree\n", false);
    expect(runPrivacyCheck(directory, ["--all"]).status).toBe(1);
  });

  it("does not scan untracked files in full-tree mode", () => {
    writePrivacyFile(directory, "tracked.txt", "Clean\n");
    writePrivacyFile(directory, "untracked.txt", makeSecret(), false);
    expect(runPrivacyCheck(directory, ["--all"]).status).toBe(0);
  });

  it("allows staged removal of a previously tracked forbidden file", () => {
    writePrivacyFile(directory, "old.log", "Clean\n");
    privacyGit(directory, ["commit", "--quiet", "-m", "Synthetic baseline"]);
    privacyGit(directory, ["rm", "--quiet", "--", "old.log"]);
    expect(runPrivacyCheck(directory).status).toBe(0);
    expect(runPrivacyCheck(directory, ["--all"]).status).toBe(0);
  });

  it("checks renamed staged content and handles paths without shell interpolation", () => {
    writePrivacyFile(directory, "notes.txt", "Clean\n");
    privacyGit(directory, ["commit", "--quiet", "-m", "Synthetic baseline"]);
    privacyGit(directory, ["mv", "--", "notes.txt", "notes with spaces.txt"]);
    writePrivacyFile(directory, "notes with spaces.txt", makeSecret());
    const result = runPrivacyCheck(directory);
    expect(result.status).toBe(1);
    expect(result.output).toContain("notes with spaces.txt:1");
  });

  it.each(["-dash-name.txt", "notes\nnewline.txt", "notes $(echo unsafe).txt"])("scans an unusual filename", (filename) => {
    writePrivacyFile(directory, filename, makeSecret());
    const result = runPrivacyCheck(directory);
    expect(result.status).toBe(1);
    expect(result.output).toContain("secret-format");
    expect(result.output).not.toContain(makeSecret());
  });

  it("can read staged bytes after the working copy has been removed", () => {
    writePrivacyFile(directory, "notes.txt", makeSecret());
    rmSync(join(directory, "notes.txt"));
    expect(runPrivacyCheck(directory).status).toBe(1);
  });

  it.each([false, true])("blocks a format-secret filename without echoing it (also in content: %s)", (inContent) => {
    const secret = makeSecret();
    writePrivacyFile(directory, `${secret}.txt`, inContent ? secret : "Clean content\n");
    const result = runPrivacyCheck(directory);
    expect(result.status).toBe(1);
    expect(result.output).toContain("secret-format");
    expect(result.output).not.toContain(secret);
  });

  it("blocks an IPv4 filename after a hyphen and before a text extension without exposing it", () => {
    const address = ["10", "2", "3", "4"].join(".");
    writePrivacyFile(directory, `report-${address}.txt`, "Clean content\n");
    const result = runPrivacyCheck(directory);
    expect(result.status).toBe(1);
    expect(result.output).toContain("ipv4-address");
    expect(result.output).not.toContain(address);
  });

  it("does not mistake invalid octets in a dotted numeric filename for an IPv4 address", () => {
    writePrivacyFile(directory, `report-${["256", "400", "3", "4"].join(".")}.txt`, "Clean content\n");
    expect(runPrivacyCheck(directory).status).toBe(0);
  });

  it("scans a modified broken symlink's text without reading its target", () => {
    const filename = "reference.txt";
    symlinkSync("safe-target", join(directory, filename));
    privacyGit(directory, ["add", "--", filename]);
    rmSync(join(directory, filename));
    symlinkSync(["", "Users", "fictional", "missing-target"].join("/"), join(directory, filename));
    expect(runPrivacyCheck(directory).status).toBe(0);
    const result = runPrivacyCheck(directory, ["--all"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("reference.txt:1 local-path");
  });

  it("fails closed outside a Git repository", () => {
    rmSync(join(directory, ".git"), { recursive: true, force: true });
    expect(runPrivacyCheck(directory).status).toBe(1);
  });

  it("rejects unknown CLI arguments instead of silently skipping checks", () => {
    expect(runPrivacyCheck(directory, ["--unknown"]).status).toBe(1);
  });
});
