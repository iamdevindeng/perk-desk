// Exercises HTTP and network failures through the real client, page, and research error panel.
// Called by: npm test; fake fetch and React hooks prevent live network or browser access
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import Home from "@/app/page";
import { streamRun } from "@/lib/run-client";
import type { TraceEvent } from "@/lib/types";
import { FAKE_BRAND, FAKE_PLAN_RESPONSE } from "../fixtures/fake-plan";
import { elementProps, flushPage, invoke, pageHarness, renderPage, resetPage, unmountPage } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, useState: fake.fakeState, useRef: fake.fakeRef, useEffect: fake.fakeEffect, useMemo: (calculate: () => unknown) => calculate() };
});
vi.mock("next/dynamic", () => ({ default: () => "MerchantMap" }));
vi.mock("@/components/PresetPicker", () => ({ default: "PresetPicker" }));
vi.mock("@/components/ProfileForm", () => ({ default: "ProfileForm" }));
vi.mock("@/components/TasteInput", () => ({ default: "TasteInput" }));
vi.mock("@/components/CategoryConfirm", () => ({ default: "CategoryConfirm" }));
vi.mock("@/components/AgentTrace", () => ({ default: "AgentTrace" }));
vi.mock("@/components/MerchantCard", () => ({ MerchantResults: "MerchantResults" }));
vi.mock("@/components/ui/button", () => ({ Button: "Button" }));
vi.mock("@/lib/profile-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-storage")>();
  const { FAKE_PROFILE } = await import("../fixtures/fake-plan");
  return { ...actual, loadProfile: () => structuredClone(FAKE_PROFILE), saveProfile: vi.fn() };
});
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: vi.fn(actual.streamRun) };
});

const fetchMock = vi.fn<typeof fetch>();
let traceModule: typeof import("@/components/AgentTrace");
function render(): ReturnType<typeof renderPage> { return renderPage(Home); }
function props(type: string): Record<string, unknown> { return elementProps(render(), type); }

function textContent(root: unknown): string {
  if (typeof root === "string" || typeof root === "number") return String(root);
  if (Array.isArray(root)) return root.map(textContent).join(" ");
  if (!root || typeof root !== "object" || !("props" in root)) return "";
  return textContent((root as ReactElement<Record<string, unknown>>).props.children);
}

function traceText(events: TraceEvent[]): string {
  return textContent(traceModule.default({ events, onRetry: vi.fn() }));
}

async function failResearch(): Promise<TraceEvent[]> {
  invoke(props("CategoryConfirm").onConfirm);
  try { await vi.mocked(streamRun).mock.results.at(-1)!.value; }
  catch { /* The real page consumes this rejected request and renders its safe error. */ }
  await flushPage();
  return props("AgentTrace").events as TraceEvent[];
}

beforeEach(async () => {
  resetPage(); vi.clearAllMocks(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  traceModule = await vi.importActual<typeof import("@/components/AgentTrace")>("@/components/AgentTrace");
  render(); await flushPage(); invoke(props("TasteInput").onChange, FAKE_BRAND.name);
  invoke(props("Button").onClick);
  pageHarness.plans[0].resolve(structuredClone(FAKE_PLAN_RESPONSE)); await flushPage();
});
afterEach(() => { unmountPage(); vi.unstubAllGlobals(); });

it.each([
  { status: 503, code: "config", message: "Live research is disabled: shared rate-limit store not configured." },
  { status: 400, code: "bad_request", message: "Choose valid place categories that are allowed for merchant research." },
  { status: 429, code: "quota", message: "Today's live-research limit has been reached. The demos still work." },
])("shows the HTTP $status server message and code in the real trace panel", async ({ status, code, message }) => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "internal", message }, { status }));
  const events = await failResearch();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/run", expect.any(Object));
  expect(events).toContainEqual({ type: "error", at: 0, code, message });
  expect(traceText(events)).toContain(message);
  expect(traceText(events)).not.toContain("Something went wrong.");
});

it("keeps network failures generic and never displays private transport details", async () => {
  fetchMock.mockRejectedValueOnce(new Error("private transport credential detail"));
  const events = await failResearch();
  expect(events).toContainEqual({ type: "error", at: 0, code: "internal", message: "Something went wrong." });
  expect(traceText(events)).toContain("Something went wrong.");
  expect(JSON.stringify(render())).not.toContain("private transport credential detail");
  expect(traceText(events)).not.toContain("private transport credential detail");
});

it.each(["", "   "])("uses the code fallback when the error message is blank %j", (message) => {
  const events: TraceEvent[] = [{ type: "error", at: 0, code: "upstream", message }];
  expect(traceText(events)).toContain("Qloo is having trouble; try again in a minute.");
});
