// Checks shared header offsets protect navigation and reset focus from the sticky bar.
// Called by: npm test; static layout rendering and local source checks need no browser or services
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import RootLayout from "@/app/layout";
import { PAGE_SCROLL_GAP_PX, PAGE_SCROLL_OFFSET_PX, TOP_BAR_HEIGHT_PX, TOP_BAR_Z_INDEX } from "@/lib/config";

it("uses one header height and gap with stacking above Leaflet controls", () => {
  expect(TOP_BAR_HEIGHT_PX).toBe(48);
  expect(PAGE_SCROLL_GAP_PX).toBe(24);
  expect(PAGE_SCROLL_OFFSET_PX).toBe(TOP_BAR_HEIGHT_PX + PAGE_SCROLL_GAP_PX);
  expect(TOP_BAR_Z_INDEX).toBeGreaterThan(1000);
});

it("applies the shared scroll padding at the document root for every navigation and reset target", () => {
  const markup = renderToStaticMarkup(RootLayout({ children: createElement("main", null, "Fake page") }));
  const html = markup.match(/<html\b[^>]*>/)?.[0];
  expect(html).toContain(`scroll-padding-top:${PAGE_SCROLL_OFFSET_PX}px`);
});

it.each([
  "src/app/page.tsx", "src/components/ProfileForm.tsx", "src/components/CategoryConfirm.tsx",
  "src/components/AgentTrace.tsx", "src/components/MerchantCard.tsx", "src/components/MerchantMap.tsx",
])("does not add the old per-target margin to document scroll padding in %s", (path) => {
  expect(readFileSync(path, "utf8")).not.toMatch(/\bscroll-mt-6\b/);
});
