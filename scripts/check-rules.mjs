// Checks repo rules that ESLint cannot, including headers, directories, fake IDs, secrets, and local paths.
// Called by: `npm run check:rules` (AGENTS.md §2, after every task). Exit code 1 = at least one violation.
import { isUtf8 } from "node:buffer";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSecretValues, scanPrivacyFile } from "./privacy-rules.mjs";

// WHY: only the documented tree and FIXES-R10's explicit branch lookup endpoint are allowed.
const ALLOWED_DIRECTORIES = [
  "docs", "scripts", "public", "public/samples", "tests", "tests/unit", "tests/eval", "tests/fixtures",
  "src", "src/app", "src/app/api", "src/app/api/plan", "src/app/api/run", "src/app/api/branches",
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
const FAKE_UUID = /^00000000-0000-4000-8000-0000000000[0-9]{2}$/;
const ENV_READ_ALLOWED = ["src/lib/env.ts", "vitest.eval.config.ts", "scripts/check-rules.mjs", "next.config.ts",
  "scripts/check-privacy.mjs", "scripts/install-hooks.mjs"];

const problems = [];

function listRepoFiles() {
  // Tracked + untracked-but-not-ignored files: exactly what the next commit could contain.
  const output = execSync("git ls-files -z --cached --others --exclude-standard", { encoding: "utf8" });
  return output.split("\0").filter((file) => file && existsSync(file) && statSync(file).isFile());
}

function checkLocalPaths(file, contents) {
  // Scan every text file, including lockfiles/SVGs, but avoid decoding binary assets as text.
  if (contents.includes(0) || !isUtf8(contents)) return;
  const lines = contents.toString("utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (/\/(?:Users|home)\//.test(line)) problems.push(`local machine path in ${file}:${index + 1}`);
  }
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
    if (!FAKE_UUID.test(match)) problems.push(`non-fake UUID in ${file} (use the documented fake UUID form)`);
  }
}

function checkEnvAccess(file, text) {
  if (!CODE_FILE.test(file) || ENV_READ_ALLOWED.includes(file)) return;
  if (/process\.env/.test(text)) problems.push(`process.env used outside src/lib/env.ts: ${file}`);
  if (/NEXT_PUBLIC_[A-Z_]*(KEY|TOKEN|SECRET|CODE)/.test(text)) problems.push(`secret-like NEXT_PUBLIC_ variable in ${file}`);
}

function readSecretValues() {
  // Values are only compared, never printed.
  const dotenvText = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  return collectSecretValues(process.env, dotenvText);
}

function checkSecrets(file, text, secretValues) {
  if (/^\.env/.test(path.posix.basename(file)) && file !== ".env.example") problems.push(`env file would be committed: ${file}`);
  if (/\bsk-[A-Za-z0-9]{24,}\b/.test(text)) problems.push(`API-key-like string (sk-…) in ${file}`);
  if (secretValues.some((value) => text.includes(value))) problems.push(`a value from .env.local appears in ${file}`);
}

function printProblems(files, secretValues) {
  // Legacy rule diagnostics must not undo the privacy scanner's filename redaction.
  const names = new Set(files);
  for (const file of files) {
    let directory = path.posix.dirname(file);
    while (directory !== ".") { names.add(directory); directory = path.posix.dirname(directory); }
  }
  const privateNames = [...names].filter((file) => scanPrivacyFile("filename.txt", file, secretValues).length > 0)
    .sort((first, second) => second.length - first.length);
  for (const problem of problems) {
    let message = problem;
    for (const file of privateNames) message = message.split(file).join("[redacted filename]");
    console.error(`✗ ${message}`);
  }
}

function main() {
  const files = listRepoFiles();
  const secretValues = readSecretValues();
  checkDirectories(files);
  for (const file of files) {
    const contents = readFileSync(file);
    checkLocalPaths(file, contents);
    if (file === "package-lock.json" || /\.(png|ico|svg|woff2?)$/.test(file)) continue;
    const text = contents.toString("utf8");
    checkHeader(file, text);
    checkJson(file);
    checkFixtureIds(file, text);
    checkEnvAccess(file, text);
    checkSecrets(file, text, secretValues);
  }
  const privacyScript = fileURLToPath(new URL("./check-privacy.mjs", import.meta.url));
  const privacy = spawnSync(process.execPath, [privacyScript, "--all"], { stdio: "inherit" });
  if (privacy.error || privacy.status !== 0) problems.push("privacy scan failed (see rule diagnostics above)");
  if (problems.length === 0) {
    console.log(`check:rules OK (${files.length} files)`);
    return;
  }
  printProblems(files, secretValues);
  console.error(`check:rules FAILED: ${problems.length} problem(s)`);
  process.exit(1);
}

main();
