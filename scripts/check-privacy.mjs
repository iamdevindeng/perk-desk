// Checks staged Git blobs, or every tracked index and working copy, for private content.
// Called by: npm run check:privacy, Git hooks, check-rules.mjs, and scanner unit tests
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { collectSecretValues, scanPrivacyFile } from "./privacy-rules.mjs";

function readGit(argumentsList) {
  const result = spawnSync("git", argumentsList, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  // Git failures can include file content or local paths; never expose its output.
  if (result.error || result.status !== 0) throw new Error("Unable to read the Git index.");
  return result.stdout;
}

function listFiles(all) {
  const argumentsList = all ? ["ls-files", "--cached", "-z"]
    : ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"];
  return [...new Set(readGit(argumentsList).toString("utf8").split("\0").filter(Boolean))];
}

function workingContents(file) {
  const status = lstatSync(file, { throwIfNoEntry: false });
  if (!status) return undefined;
  // A tracked symlink is its link text, never permission to read the target.
  if (status.isSymbolicLink()) return Buffer.from(readlinkSync(file));
  return status.isFile() ? readFileSync(file) : undefined;
}

function scanFile(file, all, secretValues) {
  const staged = readGit(["show", `:${file}`]);
  const findings = scanPrivacyFile("filename.txt", file, secretValues)
    .map((finding) => ({ ...finding, file, line: 1 }));
  findings.push(...scanPrivacyFile(file, staged, secretValues));
  const working = all ? workingContents(file) : undefined;
  if (working && !working.equals(staged)) findings.push(...scanPrivacyFile(file, working, secretValues));
  return findings;
}

function diagnosticFile(file, secretValues) {
  if (scanPrivacyFile("filename.txt", file, secretValues).length > 0) return "[redacted filename]";
  // Keep filenames containing newlines on one line without printing secret values.
  return JSON.stringify(file).slice(1, -1);
}

function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length > 1 || (argumentsList.length === 1 && argumentsList[0] !== "--all")) {
    throw new Error("Expected no arguments or --all.");
  }
  const dotenvText = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const secretValues = collectSecretValues(process.env, dotenvText);
  const all = argumentsList.includes("--all");
  const files = listFiles(all);
  const findings = files.flatMap((file) => scanFile(file, all, secretValues));
  const diagnostics = new Set(findings.map((finding) => `${diagnosticFile(finding.file, secretValues)}:${finding.line} ${finding.rule}`));
  for (const diagnostic of diagnostics) console.error(diagnostic);
  if (diagnostics.size > 0) {
    console.error(`check:privacy FAILED (${diagnostics.size} violations)`);
    process.exitCode = 1;
    return;
  }
  console.log(`check:privacy OK (${files.length} ${all ? "tracked" : "staged"} files)`);
}

try {
  main();
} catch {
  // Do not stringify exceptions: filesystem/Git errors may reveal private paths.
  console.error("check:privacy FAILED (unable to complete the scan)");
  process.exitCode = 1;
}
