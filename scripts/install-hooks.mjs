// Installs the repository's Git hooks only in local Git checkouts.
// Called by: npm prepare; CI and Vercel installs do not install hooks
import { existsSync } from "node:fs";

// Deployment archives and CI jobs do not need local commit/push hooks (FIXES-R4 R12b).
async function main() {
  if (process.env.VERCEL || process.env.CI || !existsSync(".git")) {
    console.info("Git hook installation skipped for CI, Vercel, or a non-Git install.");
    return;
  }
  const { default: hooks } = await import("simple-git-hooks");
  // The library rejects installation errors; its CLI logs them but exits successfully.
  await hooks.setHooksFromConfig();
}

main().catch(() => {
  console.error("Git hook installation failed.");
  process.exitCode = 1;
});
