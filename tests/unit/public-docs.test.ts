// Keeps retired access-code configuration out of application files and current public documentation.
// Called by: npm test; reads only source files, the environment example, and public Markdown
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

it("keeps the R16 source and environment-example absence check green", () => {
  const matches = [...filesIn("src"), ".env.example"].filter((path) => readFileSync(path, "utf8").includes("JUDGE"));
  expect(matches).toEqual([]);
});

it("limits retired variable references in public docs to historical tasks and fix specifications", () => {
  const retiredName = ["JUDGE", "BYPASS", "CODE"].join("_");
  const documents = ["README.md", "AGENTS.md", ...filesIn("docs").filter((path) => path.endsWith(".md"))];
  const currentDocuments = documents.filter((path) => path !== "docs/TASKS.md" && !/^docs\/FIXES-.*\.md$/.test(path));
  // Privacy scripts/tests still recognize retired secrets; this check concerns public guidance only.
  expect(currentDocuments.filter((path) => readFileSync(path, "utf8").includes(retiredName))).toEqual([]);
});
