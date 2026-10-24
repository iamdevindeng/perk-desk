// Installs the repository's Git hooks only in local Git checkouts.
// Called by: npm prepare; CI and Vercel installs do not install hooks
import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HOOKS = [
  { name: "pre-commit", command: "npm run check:privacy && node scripts/check-author.mjs" },
  { name: "pre-push", command: "npm run lint && npm run typecheck && npm test && npm run check:rules && node scripts/check-privacy.mjs --all" },
];

// Deployment archives and CI jobs do not need local commit/push hooks (FIXES-R5 R14).
function main() {
  if (process.env.VERCEL || process.env.CI || !existsSync(".git") || !statSync(".git").isDirectory()) {
    console.info("Git hook installation skipped for CI, Vercel, or a non-Git install.");
    return;
  }
  const directory = join(".git", "hooks");
  mkdirSync(directory, { recursive: true });
  for (const hook of HOOKS) {
    const filename = join(directory, hook.name);
    writeFileSync(filename, `#!/bin/sh\n${hook.command}\n`);
    // Writing an existing hook does not update its mode; always restore executable permissions.
    chmodSync(filename, 0o755);
  }
}

try {
  main();
} catch {
  console.error("Git hook installation failed.");
  process.exitCode = 1;
}
