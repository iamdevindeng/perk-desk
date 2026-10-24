import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true }],
      "max-depth": ["error", 3],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "no-restricted-syntax": ["error",
        { selector: "ClassDeclaration", message: "No classes (AGENTS.md §5.7). Use plain functions." },
        { selector: "ClassExpression", message: "No classes (AGENTS.md §5.7). Use plain functions." },
        { selector: "TSConditionalType", message: "No conditional types (AGENTS.md §5.5)." }],
    },
  },
  {
    files: ["src/components/**/*.tsx", "src/app/page.tsx"],
    rules: { "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }] },
  },
  { files: ["tests/**/*.ts"], rules: { "max-lines-per-function": "off" } },
  {
    files: ["src/components/**/*.tsx", "src/app/page.tsx", "src/lib/profile-storage.ts", "src/lib/run-client.ts", "src/lib/request-builders.ts", "src/lib/csv.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [{
      // This exact helper only transforms result data; other merchant modules remain server-only.
      group: ["@/lib/env", "@/lib/qloo/*", "@/lib/agent/*", "@/lib/store/*", "@/lib/fallback/*", "@/lib/merchants/*", "!@/lib/merchants/dedupe"],
      message: "Client code must not import server code (ARCHITECTURE §2).",
    }] }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/components/ui/**",
  ]),
]);

export default eslintConfig;
