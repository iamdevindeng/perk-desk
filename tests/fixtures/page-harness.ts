// Runs the page's hooks with deferred transports to exercise request races without browser dependencies.
// Called by: tests/unit/page-races.test.ts; all profiles, responses, and transport operations are fake
import type { ReactElement } from "react";
import type { PlanResponse, RunRequest, TraceEvent } from "@/lib/types";

type TestElement = ReactElement<Record<string, unknown>>;
type EffectState = { dependencies?: readonly unknown[]; cleanup?: () => void };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void };
type PendingRun = Deferred<void> & { request: RunRequest; emit: (event: TraceEvent) => void };
export const pageHarness = {
  slots: [] as unknown[], cursor: 0, changes: 0, effects: new Map<number, EffectState>(),
  queuedEffects: [] as (() => void)[], plans: [] as Deferred<PlanResponse>[], runs: [] as PendingRun[],
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

export function fakeState(initial: unknown): [unknown, (update: unknown) => void] {
  const index = pageHarness.cursor++;
  if (!(index in pageHarness.slots)) pageHarness.slots[index] = typeof initial === "function" ? initial() : initial;
  return [pageHarness.slots[index], (update) => {
    pageHarness.slots[index] = typeof update === "function" ? update(pageHarness.slots[index]) : update;
    pageHarness.changes += 1;
  }];
}

export function fakeRef(initial: unknown): unknown {
  const index = pageHarness.cursor++;
  if (!(index in pageHarness.slots)) pageHarness.slots[index] = { current: initial };
  return pageHarness.slots[index];
}

export function fakeEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void {
  const index = pageHarness.cursor++;
  const previous = pageHarness.effects.get(index);
  if (previous && dependencies && previous.dependencies?.length === dependencies.length &&
    dependencies.every((value, position) => Object.is(value, previous.dependencies![position]))) return;
  pageHarness.queuedEffects.push(() => {
    previous?.cleanup?.();
    pageHarness.effects.set(index, { dependencies, cleanup: effect() || undefined });
  });
}

export function fakePlan(): Promise<PlanResponse> {
  const pending = deferred<PlanResponse>();
  pageHarness.plans.push(pending);
  return pending.promise;
}

export function fakeRun(request: RunRequest, emit: (event: TraceEvent) => void): Promise<void> {
  const pending = { ...deferred<void>(), request, emit };
  pageHarness.runs.push(pending);
  return pending.promise;
}

export function unmountPage(): void {
  for (const effect of pageHarness.effects.values()) effect.cleanup?.();
  pageHarness.effects.clear();
}

export function resetPage(): void {
  unmountPage(); pageHarness.slots = []; pageHarness.cursor = 0; pageHarness.changes = 0;
  pageHarness.queuedEffects = []; pageHarness.plans = []; pageHarness.runs = [];
}

export function renderPage(page: () => ReactElement): TestElement {
  pageHarness.cursor = 0;
  const tree = page() as TestElement;
  for (const effect of pageHarness.queuedEffects.splice(0)) effect();
  return tree;
}

export function findElement(root: unknown, type: string): TestElement | undefined {
  if (Array.isArray(root)) {
    for (const child of root) { const found = findElement(child, type); if (found) return found; }
    return;
  }
  if (!root || typeof root !== "object" || !("props" in root)) return;
  const element = root as TestElement;
  return element.type === type ? element : findElement(element.props.children, type);
}

export function elementProps(root: TestElement, type: string): Record<string, unknown> {
  const element = findElement(root, type);
  if (!element) throw new Error(`Expected ${type}`);
  return element.props;
}

export function invoke(callback: unknown, ...values: unknown[]): void {
  if (typeof callback !== "function") throw new Error("Expected a callback");
  callback(...values);
}

export async function flushPage(): Promise<void> {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}
