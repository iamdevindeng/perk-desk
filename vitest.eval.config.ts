// Configures explicitly requested live category evaluations.
// Called by: npm run eval
import path from "node:path";
import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";
// Eval loads local credentials without exposing them in output. See TASKS.md T1.
if (existsSync(".env.local") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // The automatic agent reporter hides passing-test logs, including required eval metrics.
  test: { environment: "node", include: ["tests/eval/**/*.test.ts"], testTimeout: 180000,
    fileParallelism: false, reporters: ["default"] },
});
