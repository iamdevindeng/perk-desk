// Checks each merchant card's mobile map link selects its pin and navigates to the map.
// Called by: npm test using fictional results and the offline component harness
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MerchantResults } from "@/components/MerchantCard";
import { FAKE_MERCHANT, FAKE_PROFILE, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { invoke } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: fake.componentState, useRef: fake.componentRef, useEffect: fake.componentEffect,
    useId: () => "fake-tooltip" };
});
let tree: TestElement;
const onSelectMerchant = vi.fn();
const target = { scrollIntoView: vi.fn(), focus: vi.fn() };
function button(): TestElement {
  return findComponents(tree, (element) => element.props["aria-label"] === `View ${FAKE_MERCHANT.place.name} on map`)[0];
}
beforeEach(() => {
  resetComponents(); vi.clearAllMocks();
  vi.stubGlobal("document", { getElementById: vi.fn((id: string) => id === "merchant-map-card" ? target : null) });
  vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
  tree = renderComponents(createElement(MerchantResults, {
    result: FAKE_RUN_RESULT, profile: FAKE_PROFILE, independentsOnly: false,
    onIndependentsOnlyChange: vi.fn(), onSelectMerchant, onStatusChange: vi.fn(),
  }));
});
afterEach(() => { resetComponents(); vi.unstubAllGlobals(); });

it("renders a mobile-only named button beside the card links and retains the header map link", () => {
  expect(button().type).toBe("button"); expect(button().props.type).toBe("button");
  expect(button().props.className).toContain("lg:hidden");
  expect(componentText(button())).toBe("View on map");
  const links = findComponents(tree, (element) => element.type === "div"
    && findComponents(element, (child) => child === button()).length > 0).at(-1)!;
  expect(componentText(links)).toContain("Website ↗"); expect(componentText(links)).toContain("Google Maps ↗");
  expect(findComponents(tree, (element) => element.type === "a" && componentText(element) === "View map")).toHaveLength(1);
});

it("selects the merchant id once and scrolls to and focuses the map", () => {
  const stopPropagation = vi.fn();
  invoke(button().props.onClick, { stopPropagation });
  expect(onSelectMerchant).toHaveBeenCalledExactlyOnceWith(FAKE_MERCHANT.place.entityId);
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(document.getElementById).toHaveBeenCalledWith("merchant-map-card");
  expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "start" });
  expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
});
