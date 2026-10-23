// Creates stable JSON and hashed cache keys for equivalent server requests.
// Called by: Qloo client, API routes, agent tools, and tests/unit/hash.test.ts
import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item: unknown) => canonicalJson(item ?? null)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Cache keys require JSON-compatible values.");
  return encoded;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function cacheKey(kind: string, value: unknown): string {
  return `pd:v1:${kind}:${sha256Hex(canonicalJson(value))}`;
}

export function citySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
