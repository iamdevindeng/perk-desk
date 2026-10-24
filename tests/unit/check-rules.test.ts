// Verifies local machine paths are rejected in every kind of tracked text file.
// Called by: npm test; each check uses an isolated temporary Git repository
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CHECKER_PATH = resolve("scripts/check-rules.mjs");
const TEXT_FILES = [
  "docs/PROGRESS.md", "docs/FIXES-R3.md", "package-lock.json", "public/example.svg",
  "scripts/check-rules.mjs", "src/components/ui/Example.tsx",
  "docs/with spaces.txt", "docs/with\nnewline.txt",
];
let repositoryDirectory = "";

beforeEach(() => {
  repositoryDirectory = mkdtempSync(join(tmpdir(), "perk-desk-rules-"));
  execFileSync("git", ["init", "--quiet"], { cwd: repositoryDirectory, stdio: "ignore" });
});

afterEach(() => {
  if (repositoryDirectory) rmSync(repositoryDirectory, { recursive: true, force: true });
  repositoryDirectory = "";
});

function runChecker(files: { file: string; contents: string | Buffer }[]): { status: number | null; output: string } {
  for (const fixture of files) {
    const filename = join(repositoryDirectory, fixture.file);
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, fixture.contents);
  }
  execFileSync("git", ["add", "--", "."], { cwd: repositoryDirectory, stdio: "ignore" });
  const result = spawnSync(process.execPath, [CHECKER_PATH], { cwd: repositoryDirectory, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

function textFixture(file: string, value: string): string {
  if (file.endsWith(".svg")) return `<svg xmlns="http://www.w3.org/2000/svg">\n<title>${value}</title>\n</svg>\n`;
  if (file.endsWith(".json")) return `{\n  "fixture": ${JSON.stringify(value)}\n}\n`;
  return `// Synthetic tracked fixture.\n// ${value}\n`;
}

describe("tracked local machine path checks", () => {
  it("accepts neutral descriptions, relative paths, and ordinary clean text", () => {
    const files = TEXT_FILES.map((file) => ({ file, contents: textFixture(file, "local screenshot, not committed") }));
    files.push({ file: "README.md", contents: "Users/example/file\nhome/example/file\ndocs/example.md\n" });
    const result = runChecker(files);
    expect(result.status).toBe(0);
    expect(result.output).toContain("check:rules OK");
  });

  describe.each(["Users", "home"])("%s home-directory prefix", (directory) => {
    it.each(TEXT_FILES)("rejects tracked text in %s without an allowlist", (file) => {
      // Build synthetic paths so this test source also passes the repository rule.
      const localPath = ["", directory, "example", "file"].join("/");
      const result = runChecker([{ file, contents: textFixture(file, localPath) }]);
      expect(result.status).toBe(1);
      expect(result.output).toContain("local machine path");
      expect(result.output).toContain(`${file}:2`);
      expect(result.output).not.toContain(localPath);
    });
  });

  it.each(["nul", "non-utf8"])("skips %s binary content even if its bytes contain a local path", (kind) => {
    const localPath = ["", "Users", "example", "file"].join("/");
    const prefix = kind === "nul" ? Buffer.from([0]) : Buffer.from([255]);
    const contents = Buffer.concat([prefix, Buffer.from(localPath)]);
    const result = runChecker([{ file: "public/example.bin", contents }]);
    expect(result.status).toBe(0);
    expect(result.output).toContain("check:rules OK");
  });
});
