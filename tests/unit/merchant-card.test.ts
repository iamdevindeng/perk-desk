// Checks merchant membership and multi-location badges using fictional rendered cards.
// Called by: npm test
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MerchantCard from "@/components/MerchantCard";
import type { MerchantResult } from "@/lib/types";
import { FAKE_MERCHANT } from "../fixtures/fake-plan";

function renderMerchant(merchant: MerchantResult): string {
  return renderToStaticMarkup(createElement(MerchantCard, {
    merchant, status: "to_contact", selected: false, onSelect: () => {}, onStatusChange: () => {},
  }));
}

describe("merchant relationship badges", () => {
  it("shows the badge for an existing business member", () => {
    const markup = renderMerchant({ ...FAKE_MERCHANT, businessMember: true });
    expect(markup).toContain("Already a business member");
    expect(markup).not.toContain("Multi-location brand");
  });

  it("omits the badge when the merchant is not a business member", () => {
    const markup = renderMerchant({ ...FAKE_MERCHANT, businessMember: false });
    expect(markup).not.toContain("Already a business member");
  });

  it("keeps both badges when the merchant is a business member with multiple locations", () => {
    const markup = renderMerchant({ ...FAKE_MERCHANT, businessMember: true, multiLocation: true });
    expect(markup).toContain("Already a business member");
    expect(markup).toContain("Multi-location brand");
  });
});
