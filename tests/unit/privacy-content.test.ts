// Verifies secret, local path, and personal-data rules through the public privacy CLI.
// Called by: npm test; all inspected values are synthetic and created at runtime
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPrivacyRepository, runPrivacyCheck, writePrivacyFile } from "../fixtures/privacy-repository";

const SECRET_NAMES = ["QLOO_API_KEY", "DEEPSEEK_API_KEY", "UPSTASH_REDIS_REST_TOKEN", "JUDGE_BYPASS_CODE"];
let directory = "";
beforeEach(() => { directory = createPrivacyRepository(); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

function expectBlocked(value: string, rule: string): void {
  writePrivacyFile(directory, "notes.txt", `Safe first line\n${value}\n`);
  const result = runPrivacyCheck(directory);
  expect(result.status).toBe(1);
  expect(result.output).toContain("notes.txt:2");
  expect(result.output).toContain(rule);
  expect(result.output).not.toContain(value);
}

describe("known secret comparison", () => {
  describe.each(SECRET_NAMES)("%s", (name) => {
    it.each([3, 36])("rejects an exact %i-character environment value without printing it", (length) => {
      const secret = "q".repeat(length);
      writePrivacyFile(directory, "notes.txt", `Safe\nprefix ${secret} suffix\n`);
      const result = runPrivacyCheck(directory, [], { [name]: secret });
      expect(result.status).toBe(1);
      expect(result.output).toContain("notes.txt:2");
      expect(result.output).toContain("known-secret");
      expect(result.output).not.toContain(secret);
    });

    it.each([3, 36])("rejects an exact %i-character local dotenv value without printing it", (length) => {
      const secret = "z".repeat(length);
      writePrivacyFile(directory, ".env.local", `export ${name}="${secret}" # synthetic\n`, false);
      expectBlocked(secret, "known-secret");
    });
  });

  it("compares both local and environment values when the same key is set twice", () => {
    const localSecret = "local" + "v".repeat(20);
    const environmentSecret = "environment" + "w".repeat(20);
    writePrivacyFile(directory, ".env.local", `QLOO_API_KEY='${localSecret}'\n`, false);
    writePrivacyFile(directory, "notes.txt", `${localSecret}\n${environmentSecret}\n`);
    const result = runPrivacyCheck(directory, [], { QLOO_API_KEY: environmentSecret });
    expect(result.status).toBe(1);
    expect(result.output).toContain("notes.txt:1");
    expect(result.output).toContain("notes.txt:2");
    expect(result.output).not.toContain(localSecret);
    expect(result.output).not.toContain(environmentSecret);
  });

  it("ignores empty values and public settings in a local dotenv file", () => {
    writePrivacyFile(directory, ".env.local", "QLOO_API_KEY=\nPUBLIC_LABEL=harmless\n", false);
    writePrivacyFile(directory, "notes.txt", "harmless\n");
    expect(runPrivacyCheck(directory, [], { DEEPSEEK_API_KEY: "" }).status).toBe(0);
  });

  it("finds an exact secret embedded in an allowed public binary file", () => {
    const secret = "binary" + "v".repeat(16);
    const contents = Buffer.concat([Buffer.from([0, 255]), Buffer.from(secret), Buffer.from([0, 1])]);
    writePrivacyFile(directory, "public/icon.png", contents);
    const result = runPrivacyCheck(directory, [], { QLOO_API_KEY: secret });
    expect(result.status).toBe(1);
    expect(result.output).toContain("public/icon.png:1 known-secret");
    expect(result.output).not.toContain(secret);
  });

  it.each(["single", "double", "crlf"])("preserves a quoted hash in %s dotenv syntax", (syntax) => {
    const secret = "quoted" + "#" + "v".repeat(16);
    const quote = syntax === "single" ? "'" : '"';
    const newline = syntax === "crlf" ? "\r\n" : "\n";
    writePrivacyFile(directory, ".env.local", `QLOO_API_KEY=${quote}${secret}${quote} # comment${newline}`, false);
    expectBlocked(secret, "known-secret");
  });

  it.each(["literal", "escaped"])("compares a %s multiline dotenv secret exactly", (syntax) => {
    const secret = ["first" + "v".repeat(16), "second" + "w".repeat(16)].join("\n");
    const dotenvValue = syntax === "escaped" ? secret.replace("\n", "\\n") : secret;
    writePrivacyFile(directory, ".env.local", `QLOO_API_KEY="${dotenvValue}"\n`, false);
    expectBlocked(secret, "known-secret");
  });
});

describe("secret formats", () => {
  it.each([
    ["model key", () => "sk-" + "a".repeat(20)],
    ["GitHub classic", () => "ghp_" + "b".repeat(30)],
    ["GitHub fine-grained", () => "github_pat_" + "c".repeat(30)],
    ["AWS access key", () => "AKIA" + "D".repeat(16)],
    ["RSA private key", () => ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ")],
    ["EC private key", () => ["-----BEGIN", "EC PRIVATE KEY-----"].join(" ")],
    ["generic private key", () => ["-----BEGIN", "PRIVATE KEY-----"].join(" ")],
    ["Slack bot", () => "xoxb-" + "5".repeat(20)],
    ["Slack user", () => "xoxp-" + "6".repeat(20)],
    ["Slack app", () => "xoxa-" + "7".repeat(20)],
    ["Slack session", () => "xoxs-" + "8".repeat(20)],
    ["Bearer", () => "Bearer " + "b".repeat(20)],
    ["Upstash assignment", () => "UPSTASH_TOKEN=" + "YWJj".repeat(16)],
    ["JSON token", () => JSON.stringify({ token: "YWJj".repeat(16) })],
  ])("blocks %s", (_name, makeValue) => {
    expectBlocked((makeValue as () => string)(), "secret-format");
  });
});

describe("local paths and personal data", () => {
  it.each(["Users", "home"])("blocks a %s home path", (folder) => {
    expectBlocked(["", folder, "fictional", "notes.txt"].join("/"), "local-path");
  });

  it("blocks a Windows home path", () => {
    expectBlocked(["C:", "Users", "fictional", "notes.txt"].join("\\"), "local-path");
  });

  it("blocks personal email", () => { expectBlocked(["private", "fictional.invalid"].join("@"), "email-address"); });

  it.each([
    () => ["+1", "415", "555", "0199"].join("-"),
    () => ["(415)", "555-0199"].join(" "),
    () => ["+65", "8123", "4567"].join(" "),
  ])("blocks a phone-number format", (makeValue) => { expectBlocked(makeValue(), "phone-number"); });

  it.each([["10", "2", "3", "4"], ["8", "8", "4", "4"]])("blocks IPv4 %j", (...parts) => {
    expectBlocked(parts.join("."), "ipv4-address");
  });

  it("allows only documented email and IPv4 exceptions", () => {
    writePrivacyFile(directory, "notes.txt", [
      "fake@example.com", "testing@devpost.com", "99384331+iamdevindeng@users.noreply.github.com",
      "127.0.0.1", "0.0.0.0", "192.0.2.44", "198.51.100.7", "203.0.113.99",
      "Version 16.4.2, date 2026-10-24, relative docs/example.md",
    ].join("\n"));
    expect(runPrivacyCheck(directory).status).toBe(0);
  });
});
