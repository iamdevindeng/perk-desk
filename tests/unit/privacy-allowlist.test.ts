// Verifies exact privacy exemptions without allowing private content through them.
// Called by: npm test using synthetic staged files in disposable Git repositories
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrivacyRepository, runPrivacyCheck, writePrivacyFile } from "../fixtures/privacy-repository";

const SVG_FILES = ["public/file.svg", "public/globe.svg", "public/next.svg", "public/vercel.svg", "public/window.svg"];
const CONTENT_RULES = [
  { rule: "secret-format", make: (): string => "sk-" + "f".repeat(24) },
  { rule: "local-path", make: (): string => ["", "Users", "fictional", "notes.txt"].join("/") },
  { rule: "email-address", make: (): string => ["private", "fictional.invalid"].join("@") },
];
let directory = "";
beforeEach(() => { directory = createPrivacyRepository(); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

function privateAddress(): string { return [10, 20, 30, 40].join("."); }
function phoneNumber(): string { return ["+65", "8123", "4567"].join(" "); }
function pathData(): string { return `M ${privateAddress()} L ${phoneNumber()} 0`; }

function wrappedContents(file: string, value: string): string | Buffer {
  if (file === "package-lock.json") return JSON.stringify({ padding: "x".repeat(50_001), value });
  if (file.endsWith(".ico")) return Buffer.concat([Buffer.from([0, 255]), Buffer.from(value), Buffer.from([0])]);
  return `<svg><path d="${value}"/></svg>`;
}

function expectBlocked(file: string, contents: string | Buffer, rules: string[]): void {
  writePrivacyFile(directory, file, contents);
  const result = runPrivacyCheck(directory);
  expect(result.status).toBe(1);
  for (const rule of rules) expect(result.output).toContain(`${file}:1 ${rule}`);
}

describe("exact application icon exemption", () => {
  it("allows the conventional Next.js source icon", () => {
    writePrivacyFile(directory, "src/app/favicon.ico", Buffer.from([0, 255, 1]));
    expect(runPrivacyCheck(directory).status).toBe(0);
  });

  it.each([
    "favicon.ico", "src/app/other.ico", "src/app/icons/favicon.ico",
    "src/pages/favicon.ico", "src/app/favicon.ICO", "nested/src/app/favicon.ico",
  ])("rejects nearby image path %s", (file) => {
    expectBlocked(file, Buffer.from([0, 255, 1]), ["forbidden-file"]);
  });
});

describe("content rules remain active inside exempted files", () => {
  describe.each(["src/app/favicon.ico", ...SVG_FILES])("%s", (file) => {
    it.each(CONTENT_RULES)("blocks $rule", ({ rule, make }) => {
      const value = make();
      writePrivacyFile(directory, file, wrappedContents(file, value));
      const result = runPrivacyCheck(directory);
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${file}:1 ${rule}`);
      expect(result.output).not.toContain(value);
    });
  });

  it.each(["package-lock.json", "src/app/favicon.ico", ...SVG_FILES])("compares known secrets in %s", (file) => {
    // A numeric known secret must stay blocked even when SVG phone scanning is masked.
    const secret = "7".repeat(12);
    writePrivacyFile(directory, file, wrappedContents(file, secret));
    const result = runPrivacyCheck(directory, [], { QLOO_API_KEY: secret });
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${file}:1 known-secret`);
    expect(result.output).not.toContain(secret);
  });
});

describe("SVG numeric path data exemptions", () => {
  it.each(SVG_FILES)("allows numeric path data only in %s", (file) => {
    const data = pathData();
    writePrivacyFile(directory, file, `<svg><path d="${data}"/><path d = '${data}'/></svg>`);
    expect(runPrivacyCheck(directory).status).toBe(0);
  });

  it.each([
    "public/other.svg", "public/nested/file.svg", "public/File.svg",
    "public/file.SVG", "public/file.svg.bak", "outside/file.svg",
  ])("still scans numeric path data in %s", (file) => {
    expectBlocked(file, wrappedContents(file, pathData()), ["ipv4-address", "phone-number"]);
  });

  it.each([
    { name: "metadata", markup: (value: string): string => `<metadata>${value}</metadata>` },
    { name: "comment", markup: (value: string): string => `<!-- <path d="${value}"/> -->` },
    { name: "CDATA", markup: (value: string): string => `<![CDATA[<path d="${value}"/>]]>` },
    { name: "text", markup: (value: string): string => `<text>${value}</text>` },
    { name: "non-path d", markup: (value: string): string => `<circle d="${value}"/>` },
    { name: "data-d", markup: (value: string): string => `<path data-d="${value}"/>` },
    { name: "other attribute", markup: (value: string): string => `<path d="M0 0" title="${value}"/>` },
    { name: "attribute markup", markup: (value: string): string => `<svg title='<path d="${value}"/>'/>` },
    { name: "nonnumeric d", markup: (value: string): string => `<path d="private ${value}"/>` },
  ])("still scans $name", ({ markup }) => {
    expectBlocked("public/file.svg", `<svg>${markup(pathData())}</svg>`, ["ipv4-address", "phone-number"]);
  });

  it("preserves line numbers after masking multiline path data", () => {
    writePrivacyFile(directory, "public/file.svg", `<svg><path d="M0\n${pathData()}"/>\n<text>${privateAddress()}</text></svg>`);
    const result = runPrivacyCheck(directory);
    expect(result.status).toBe(1);
    expect(result.output).toContain("public/file.svg:3 ipv4-address");
    expect(result.output).not.toContain("phone-number");
  });
});

describe("exact RFC 5737 ranges", () => {
  it.each([[192, 0, 2], [198, 51, 100], [203, 0, 113]])("allows both endpoints of %j", (...network) => {
    const addresses = [0, 255].map((last) => [...network, last].join("."));
    writePrivacyFile(directory, "notes.txt", addresses.join("\n"));
    expect(runPrivacyCheck(directory).status).toBe(0);
  });

  it.each([
    [192, 0, 1, 255], [192, 0, 3, 0], [198, 51, 99, 255],
    [198, 51, 101, 0], [203, 0, 112, 255], [203, 0, 114, 0],
  ])("blocks the neighboring address %j", (...octets) => {
    expectBlocked("notes.txt", octets.join("."), ["ipv4-address"]);
  });

  it.each([["198", "051", "100", "1"], ["192", "00", "2", "1"]])(
    "does not broaden the exemption to a leading-zero prefix %j", (...octets) => {
      expectBlocked("notes.txt", octets.join("."), ["ipv4-address"]);
    },
  );
});
