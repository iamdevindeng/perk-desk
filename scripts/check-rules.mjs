// Checks repo rules that ESLint cannot: file headers, allowed directories, fake fixture IDs, no secrets, no raw data.
// Called by: `npm run check:rules` (AGENTS.md §2, after every task). Exit code 1 = at least one violation.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// WHY: the tree in docs/ARCHITECTURE.md §2 is fixed; Codex must not invent folders.
const ALLOWED_DIRECTORIES = [
  "docs", "scripts", "public", "tests", "tests/unit", "tests/eval", "tests/fixtures",
  "src", "src/app", "src/app/api", "src/app/api/plan", "src/app/api/run",
  "src/lib", "src/lib/qloo", "src/lib/agent", "src/lib/agent/tools", "src/lib/merchants",
  "src/lib/fallback", "src/lib/store", "src/components", "src/components/ui",
  "src/data", "src/data/presets",
];
// WHY: Qloo responses must never be committed; only hand-written JSON files are allowed.
const ALLOWED_JSON = [/^package(-lock)?\.json$/, /^tsconfig\.json$/, /^components\.json$/,
  /^src\/data\/[a-z-]+\.json$/, /^src\/data\/presets\/[a-z-]+\.json$/, /^tests\/eval\/cases\.json$/];
const HEADER_EXEMPT = [/^src\/components\/ui\//, /^next-env\.d\.ts$/, /\.config\.(ts|mjs|js)$/];
const CODE_FILE = /\.(ts|tsx|mjs)$/;
const UUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const ENV_READ_ALLOWED = ["src/lib/env.ts", "vitest.eval.config.ts", "scripts/check-rules.mjs", "next.config.ts"];

const problems = [];

function listRepoFiles() {
  // Tracked + untracked-but-not-ignored files: exactly what the next commit could contain.
  const output = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" });
  return output.split("\n").filter((file) => file && existsSync(file) && statSync(file).isFile());
}

function checkDirectories(files) {
  const directories = new Set(files.map((file) => path.posix.dirname(file)).filter((dir) => dir !== "."));
  for (const directory of directories) {
    if (directory.startsWith("src/components/ui")) continue;
    if (!ALLOWED_DIRECTORIES.includes(directory)) problems.push(`directory not in ARCHITECTURE §2 tree: ${directory}`);
  }
}

function checkHeader(file, text) {
  if (!CODE_FILE.test(file) || HEADER_EXEMPT.some((pattern) => pattern.test(file))) return;
  const lines = text.split("\n");
  // WHY: "use client" / "use server" directives must stay on line 1, so the header may follow them.
  const start = /^["']use (client|server)["'];?\s*$/.test(lines[0] ?? "") ? 1 : 0;
  const first = lines[start] ?? "";
  const second = lines[start + 1] ?? "";
  const ok = first.startsWith("// ") && second.startsWith("// ") && first.length > 6 && second.length > 6;
  if (!ok) problems.push(`missing 2-line header comment (what / who calls it): ${file}`);
}

function checkJson(file) {
  if (!file.endsWith(".json")) return;
  if (!ALLOWED_JSON.some((pattern) => pattern.test(file))) problems.push(`JSON file not allowed (no Qloo data in repo): ${file}`);
}

function checkFixtureIds(file, text) {
  if (!file.startsWith("tests/") && !file.startsWith("src/data/")) return;
  for (const match of text.match(UUID) ?? []) {
    if (!match.startsWith("00000000-")) problems.push(`non-fake UUID ${match.slice(0, 8)}… in ${file} (use 00000000-0000-4000-8000-0000000000NN)`);
  }
}

function checkEnvAccess(file, text) {
  if (!CODE_FILE.test(file) || ENV_READ_ALLOWED.includes(file)) return;
  if (/process\.env/.test(text)) problems.push(`process.env used outside src/lib/env.ts: ${file}`);
  if (/NEXT_PUBLIC_[A-Z_]*(KEY|TOKEN|SECRET|CODE)/.test(text)) problems.push(`secret-like NEXT_PUBLIC_ variable in ${file}`);
}

function readSecretValues() {
  // Values are only compared, never printed.
  if (!existsSync(".env.local")) return [];
  return readFileSync(".env.local", "utf8").split("\n")
    .map((line) => line.replace(/^\s*[A-Z0-9_]+\s*=\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((value) => value.length >= 12);
}

function checkSecrets(file, text, secretValues) {
  if (/^\.env/.test(path.posix.basename(file)) && file !== ".env.example") problems.push(`env file would be committed: ${file}`);
  if (/\bsk-[A-Za-z0-9]{24,}\b/.test(text)) problems.push(`API-key-like string (sk-…) in ${file}`);
  if (secretValues.some((value) => text.includes(value))) problems.push(`a value from .env.local appears in ${file}`);
}

function main() {
  const files = listRepoFiles();
  const secretValues = readSecretValues();
  checkDirectories(files);
  for (const file of files) {
    if (file === "package-lock.json" || /\.(png|ico|svg|woff2?)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    checkHeader(file, text);
    checkJson(file);
    checkFixtureIds(file, text);
    checkEnvAccess(file, text);
    checkSecrets(file, text, secretValues);
  }
  if (problems.length === 0) {
    console.log(`check:rules OK (${files.length} files)`);
    return;
  }
  for (const problem of problems) console.error(`✗ ${problem}`);
  console.error(`check:rules FAILED: ${problems.length} problem(s)`);
  process.exit(1);
}

main();
