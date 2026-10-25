// Renders keyed component trees with fake hooks and effect cleanup for offline interaction tests.
// Called by: branch-lookup UI tests; no browser or network is used
import type { ReactElement } from "react";

export type TestElement = ReactElement<Record<string, unknown>>;
type Effect = { dependencies?: readonly unknown[]; cleanup?: () => void };
type Frame = { slots: unknown[]; cursor: number; effects: Map<number, Effect> };
const frames = new Map<string, Frame>();
let current: Frame;
let visited = new Set<string>();
let pendingEffects: (() => void)[] = [];

export function componentState(initial: unknown): [unknown, (update: unknown) => void] {
  const frame = current;
  const index = frame.cursor++;
  if (!(index in frame.slots)) frame.slots[index] = typeof initial === "function" ? initial() : initial;
  return [frame.slots[index], (update) => {
    frame.slots[index] = typeof update === "function" ? update(frame.slots[index]) : update;
  }];
}

export function componentRef(initial: unknown): unknown {
  const index = current.cursor++;
  if (!(index in current.slots)) current.slots[index] = { current: initial };
  return current.slots[index];
}

export function componentEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void {
  const frame = current;
  const index = frame.cursor++;
  const previous = frame.effects.get(index);
  if (previous && dependencies && previous.dependencies?.length === dependencies.length &&
    dependencies.every((value, position) => Object.is(value, previous.dependencies![position]))) return;
  pendingEffects.push(() => {
    previous?.cleanup?.();
    frame.effects.set(index, { dependencies, cleanup: effect() || undefined });
  });
}

function expand(node: unknown, path: string): unknown {
  if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}/${index}`));
  if (!node || typeof node !== "object" || !("props" in node)) return node;
  const element = node as TestElement;
  const key = `${path}/${typeof element.type === "function" ? element.type.name : String(element.type)}:${element.key ?? ""}`;
  if (typeof element.type === "function") {
    const frame = frames.get(key) ?? { slots: [], cursor: 0, effects: new Map() };
    frame.cursor = 0; frames.set(key, frame); visited.add(key); current = frame;
    return expand((element.type as (props: Record<string, unknown>) => ReactElement)(element.props), key);
  }
  return { ...element, props: { ...element.props, children: expand(element.props.children, key) } };
}

export function renderComponents(element: ReactElement): TestElement {
  visited = new Set(); pendingEffects = [];
  const tree = expand(element, "root") as TestElement;
  for (const [key, frame] of frames) {
    if (visited.has(key)) continue;
    for (const effect of frame.effects.values()) effect.cleanup?.();
    frames.delete(key);
  }
  for (const effect of pendingEffects) effect();
  return tree;
}

export function resetComponents(): void {
  for (const frame of frames.values()) for (const effect of frame.effects.values()) effect.cleanup?.();
  frames.clear(); pendingEffects = [];
}

export function findComponents(root: unknown, predicate: (element: TestElement) => boolean): TestElement[] {
  if (Array.isArray(root)) return root.flatMap((child) => findComponents(child, predicate));
  if (!root || typeof root !== "object" || !("props" in root)) return [];
  const element = root as TestElement;
  return [...(predicate(element) ? [element] : []), ...findComponents(element.props.children, predicate)];
}

export function componentText(root: unknown): string {
  if (typeof root === "string" || typeof root === "number") return String(root);
  if (Array.isArray(root)) return root.map(componentText).join("");
  if (!root || typeof root !== "object" || !("props" in root)) return "";
  return componentText((root as TestElement).props.children);
}
