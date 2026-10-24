// Detects privacy violations in one Git file without including matched values in findings.
// Called by: scripts/check-privacy.mjs and privacy scanner unit tests
import path from "node:path";
import * as nodeUtil from "node:util";

const SECRET_NAMES = ["QLOO_API_KEY", "DEEPSEEK_API_KEY", "UPSTASH_REDIS_REST_TOKEN", "JUDGE_BYPASS_CODE"];
const FAKE_UUID = /^00000000-0000-4000-8000-0000000000[0-9]{2}$/;
const UUID = /\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/gi;
const AUTHOR_EMAIL = "99384331+iamdevindeng@users.noreply.github.com";
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}/g,
  /\b(?:ghp_|github_pat_)[A-Za-z0-9_]+/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g,
  /\bxox[bpas]-[A-Za-z0-9-]+/g,
  /\bBearer[ \t]+[A-Za-z0-9._-]{20,}/gi,
  /(?:UPSTASH[A-Z0-9_]*|[A-Za-z_]*token[A-Za-z_]*)["' \t]*[:=]["' \t]*[A-Za-z0-9+/=_-]{40,}/gi,
];
const LOCAL_PATH = /\/(?:Users|home)\/[^/\s]+\/|C:(?:\\{1,2})Users(?:\\{1,2})/gi;
const EMAIL = /\b[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}\b/g;
const PHONE_PATTERNS = [
  /(?<![\w.-])(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?![\w.-])/g,
  /(?<![\w.-])\+\d(?:[ ()-]*\d){7,14}(?![\w.-])/g,
  /(?<![\w.-])\d{10,15}(?![\w.-])/g,
];
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?!\w|\.\d)/g;
const SVG_PATH_FILES = new Set([
  "public/file.svg", // Generated file icon coordinates can resemble IPs or phone numbers.
  "public/globe.svg", // Generated globe icon coordinates can resemble IPs or phone numbers.
  "public/next.svg", // Generated Next.js logo coordinates can resemble IPs or phone numbers.
  "public/vercel.svg", // Generated Vercel logo coordinates can resemble IPs or phone numbers.
  "public/window.svg", // Generated window icon coordinates can resemble IPs or phone numbers.
]);
const DOCUMENTATION_NETWORKS = [
  "192.0.2", // RFC 5737 TEST-NET-1 reserves this exact /24 for documentation.
  "198.51.100", // RFC 5737 TEST-NET-2 reserves this exact /24 for documentation.
  "203.0.113", // RFC 5737 TEST-NET-3 reserves this exact /24 for documentation.
];

function legacyDotenv(dotenvText) {
  const environment = {};
  const assignment = /(?:^|\n)[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^\r\n]*))/g;
  for (const match of dotenvText.matchAll(assignment)) {
    if (!SECRET_NAMES.includes(match[1])) continue;
    environment[match[1]] = match[2] !== undefined ? match[2].replace(/\\n/g, "\n")
      : match[3] ?? match[4] ?? match[5].split("#", 1)[0].trim();
  }
  return environment;
}

export function collectSecretValues(environment, dotenvText) {
  // Prefer Node's actual --env-file semantics; the fallback supports Node 20.9–20.11.
  const localEnvironment = typeof nodeUtil.parseEnv === "function" ? nodeUtil.parseEnv(dotenvText) : legacyDotenv(dotenvText);
  const values = SECRET_NAMES.flatMap((name) => [environment[name], localEnvironment[name]])
    .filter((value) => typeof value === "string" && value.length > 0);
  return [...new Set(values)];
}

function forbiddenFile(file) {
  const basename = path.posix.basename(file);
  if (basename.startsWith(".env") && basename !== ".env.example") return true;
  if (/\.(?:log|har|pem|key|p12|zip|tar[^/]*)$/i.test(file)) return true;
  // Next.js discovers the application icon at this exact source path.
  const applicationIcon = file === "src/app/favicon.ico";
  if (/\.(?:png|jpg|jpeg|gif|ico|mov|mp4|webm)$/i.test(file) && !file.startsWith("public/") && !applicationIcon) return true;
  return /(?:^|\/)(?:\.next|node_modules|coverage)\//.test(file) || file.startsWith("docs/translate/");
}

function handWrittenData(file, text) {
  if (file.startsWith("src/data/") || file === "tests/eval/cases.json") return true;
  if (!file.startsWith("tests/fixtures/")) return false;
  const identifiers = text.match(UUID) ?? [];
  return identifiers.length > 0 && identifiers.every((identifier) => FAKE_UUID.test(identifier));
}

function allowedEmail(value) {
  const lower = value.toLowerCase();
  return lower === AUTHOR_EMAIL || lower === "testing@devpost.com" || lower.endsWith("@example.com");
}

function privateIpv4(value) {
  const octets = value.split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  if (value === "127.0.0.1" || value === "0.0.0.0") return false;
  return !DOCUMENTATION_NETWORKS.some((network) => value.startsWith(`${network}.`));
}

function maskPathAttribute(attribute, name, assignment, quote, value) {
  // Only numeric SVG path commands qualify; text in other attributes stays visible.
  if (name !== "d" || !/^[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]*$/.test(value)) return attribute;
  return name + assignment + quote + value.replace(/[^\r\n]/g, " ") + quote;
}

function numericScanText(file, text) {
  if (!SVG_PATH_FILES.has(file)) return text;
  // Consume comments, CDATA, and quoted attributes whole so embedded markup is never exempted.
  const markup = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*>/g;
  const attribute = /([^\s"'<>/=]+)(\s*=\s*)(["'])([\s\S]*?)\3/g;
  return text.replace(markup, (tag) => {
    if (!/^<path(?:\s|\/?>)/.test(tag)) return tag;
    return tag.replace(attribute, maskPathAttribute);
  });
}

function lineAt(text, position) {
  return text.slice(0, position).split("\n").length;
}

function checkMatches(file, text, pattern, rule, findings, shouldFlag = () => true) {
  for (const match of text.matchAll(pattern)) {
    if (shouldFlag(match[0])) findings.push({ file, line: lineAt(text, match.index), rule });
  }
}

function checkKnownSecrets(file, text, values, findings) {
  for (const value of values) {
    if (!value) continue;
    let position = text.indexOf(value);
    while (position !== -1) {
      findings.push({ file, line: lineAt(text, position), rule: "known-secret" });
      position = text.indexOf(value, position + value.length);
    }
  }
}

function checkExample(file, text, findings) {
  if (path.posix.basename(file) !== ".env.example") return;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/^\s*(?:#.*)?$/.test(line) || /^[A-Z][A-Z0-9_]*=$/.test(line)) continue;
    findings.push({ file, line: index + 1, rule: "env-example-value" });
  }
}

function checkQlooData(file, text, size, findings) {
  if (handWrittenData(file, text)) return;
  // R12: the user approved only the root dependency lockfile's size exemption.
  if (file.endsWith(".json") && file !== "package-lock.json" && size > 50_000) findings.push({ file, line: 1, rule: "large-json" });
  const marker = text.indexOf('"' + "entity_id" + '"');
  if (marker >= 0 && /"(?:results|popularity)"/.test(text)) {
    findings.push({ file, line: lineAt(text, marker), rule: "qloo-response-data" });
  }
}

export function scanPrivacyFile(file, contents, secretValues = []) {
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  const text = buffer.toString("utf8");
  const findings = [];
  if (forbiddenFile(file)) findings.push({ file, line: 1, rule: "forbidden-file" });
  checkKnownSecrets(file, text, secretValues, findings);
  for (const pattern of SECRET_PATTERNS) checkMatches(file, text, pattern, "secret-format", findings);
  checkMatches(file, text, LOCAL_PATH, "local-path", findings);
  checkMatches(file, text, EMAIL, "email-address", findings, (email) => !allowedEmail(email));
  const numericText = numericScanText(file, text);
  for (const pattern of PHONE_PATTERNS) checkMatches(file, numericText, pattern, "phone-number", findings);
  checkMatches(file, numericText, IPV4, "ipv4-address", findings, privateIpv4);
  checkExample(file, text, findings);
  checkQlooData(file, text, buffer.length, findings);
  return findings.filter((finding, index) => findings.findIndex((other) => other.line === finding.line && other.rule === finding.rule) === index);
}
