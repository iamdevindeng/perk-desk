// Verifies forbidden filenames, Qloo data detection, and empty environment templates.
// Called by: npm test using synthetic files in disposable Git repositories
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrivacyRepository, runPrivacyCheck, writePrivacyFile } from "../fixtures/privacy-repository";

let directory = "";
beforeEach(() => { directory = createPrivacyRepository(); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

function expectFileRule(file: string, contents: string | Buffer, rule: string): void {
  writePrivacyFile(directory, file, contents);
  const result = runPrivacyCheck(directory);
  expect(result.status).toBe(1);
  expect(result.output).toContain(rule);
  expect(result.output).toContain(`${file}:`);
}

function responseWithId(identifier: string): string {
  return JSON.stringify({ results: [{ entity_id: identifier, name: "Fake Coffee Co", popularity: 0.5 }] });
}

describe("forbidden staged files", () => {
  it.each([
    ".env", ".env.local", ".env.production", "nested/.env.test", "debug.log", "request.har",
    "certificate.pem", "private.key", "certificate.p12", "backup.zip", "backup.tar", "backup.tar.gz",
    "screen.png", "screen.jpg", "screen.jpeg", "screen.gif", "screen.mov", "screen.mp4", "screen.webm",
    ".next/output.txt", "node_modules/dependency/index.js", "coverage/results.txt", "docs/translate/notes.md",
  ])("blocks %s even with binary contents", (file) => {
    expectFileRule(file, Buffer.from([0, 255, 1]), "forbidden-file");
  });

  it("allows public images and ordinary text without exempting their content", () => {
    writePrivacyFile(directory, "public/sample.png", Buffer.from([0, 255, 1]));
    writePrivacyFile(directory, "README.md", "Safe public documentation.\n");
    expect(runPrivacyCheck(directory).status).toBe(0);
    const secret = "sk-" + "x".repeat(30);
    expectFileRule("public/asset.svg", `<svg>${secret}</svg>`, "secret-format");
  });
});

describe("likely Qloo response data", () => {
  it("rejects JSON strictly larger than the size threshold", () => {
    const threshold = 50_000;
    writePrivacyFile(directory, "payload.json", " ".repeat(threshold));
    expect(runPrivacyCheck(directory).status).toBe(0);
    expectFileRule("payload.json", " ".repeat(threshold + 1), "large-json");
  });

  it("exempts only the root package lockfile from size and still scans its content", () => {
    writePrivacyFile(directory, "package-lock.json", JSON.stringify({ padding: "x".repeat(50_001) }));
    expect(runPrivacyCheck(directory).status).toBe(0);
    expectFileRule("nested/package-lock.json", " ".repeat(50_001), "large-json");
  });

  it.each([
    ["secret-format", () => "sk-" + "x".repeat(30)],
    ["local-path", () => ["", "Users", "fictional", "note"].join("/")],
    ["email-address", () => ["private", "fictional.invalid"].join("@")],
    ["qloo-response-data", () => responseWithId("00000000-0000-4000-8000-000000000001")],
  ])("still enforces %s in the root package lockfile", (rule, makeValue) => {
    expectFileRule("package-lock.json", (makeValue as () => string)(), rule as string);
  });

  it.each(["json", "txt", "ts"])("blocks response markers in a .%s file", (extension) => {
    expectFileRule(`payload.${extension}`, responseWithId("00000000-0000-4000-8000-000000000001"), "qloo-response-data");
  });

  it("also blocks entity identifiers paired with popularity without results", () => {
    expectFileRule("payload.txt", JSON.stringify({ entity_id: "fake", popularity: 0.5 }), "qloo-response-data");
  });

  it("does not reject an unrelated use of only one response marker", () => {
    writePrivacyFile(directory, "notes.txt", JSON.stringify({ results: ["Fake Coffee Co"] }));
    expect(runPrivacyCheck(directory).status).toBe(0);
  });

  it.each(["src/data/catalog.json", "tests/eval/cases.json", "tests/fixtures/qloo-fake.json"])(
    "permits hand-written fake response data in %s", (file) => {
      writePrivacyFile(directory, file, responseWithId("00000000-0000-4000-8000-000000000001"));
      expect(runPrivacyCheck(directory).status).toBe(0);
    },
  );

  it("rejects a fixture containing an identifier outside the permitted fake range", () => {
    const identifier = ["1".repeat(8), "2".repeat(4), "4".repeat(4), "8".repeat(4), "3".repeat(12)].join("-");
    expectFileRule("tests/fixtures/qloo-fake.json", responseWithId(identifier), "qloo-response-data");
  });

  it("does not exempt secrets inside an allowed fake-data directory", () => {
    const secret = "ghp_" + "f".repeat(30);
    expectFileRule("tests/fixtures/qloo-fake.json", JSON.stringify({ note: secret }), "secret-format");
  });
});

describe("environment example contents", () => {
  it("accepts only comments, blank lines and empty assignments", () => {
    writePrivacyFile(directory, ".env.example", "# Safe names only\n\nQLOO_API_KEY=\nDEEPSEEK_API_KEY=\n");
    expect(runPrivacyCheck(directory).status).toBe(0);
  });

  it.each(["QLOO_API_KEY=placeholder", "PUBLIC_LABEL=example", "not an assignment"])(
    "rejects a nonempty or invalid template line", (line) => {
      expectFileRule(".env.example", `# Comment\n${line}\n`, "env-example-value");
    },
  );
});
