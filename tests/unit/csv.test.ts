// Checks exact export columns, text escaping, numeric values, and follow-up statuses with fake data.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { FAKE_MERCHANT } from "../fixtures/fake-plan";

const HEADER = "branch,distance_km,name,category,address,phone,website,google_maps_url,member_brands,rank_lift,business_rating,tripadvisor_rating,multi_location,business_member,status,pitch";

describe("merchant CSV export", () => {
  it("exports all sixteen columns in order with CRLF records and one decimal kilometre distances", () => {
    const merchant = { ...FAKE_MERCHANT, distanceMeters: 1250, multiLocation: true };
    const csv = toCsv([merchant], {});
    expect(csv).toBe(`${HEADER}\r\nFake Central Branch,1.3,Fake Corner Cafe,Coffee shop,2 Example Lane,555-0100,https://example.invalid/cafe,https://www.google.com/maps/search/?api=1&query=Fake+Corner+Cafe,Fake Coffee Co 100%,2,4.5,4,yes,no,to_contact,${merchant.pitch}\r\n`);
    expect(csv.split("\r\n")[0].split(",")).toHaveLength(16);
  });

  it("returns a valid header-only CSV for an empty list", () => {
    expect(toCsv([], {})).toBe(`${HEADER}\r\n`);
  });

  it("quotes commas, quotes, CR and LF without altering the cell contents", () => {
    const merchant = { ...FAKE_MERCHANT, branchName: 'Fake, "Central"',
      place: { ...FAKE_MERCHANT.place, name: 'Fake "Quoted" Cafe', address: "Fake street\r\nSecond line" },
      pitch: "First fake line\nSecond fake line", brandShares: [{ brandName: "Fake, Brand", sharePercent: 100 }] };
    const csv = toCsv([merchant], {});
    expect(csv).toContain('"Fake, ""Central""",0.1,"Fake ""Quoted"" Cafe"');
    expect(csv).toContain('"Fake street\r\nSecond line"');
    expect(csv).toContain('"Fake, Brand 100%"');
    expect(csv).toContain('"First fake line\nSecond fake line"\r\n');
  });

  it.each(["=FAKE()", "+FAKE", "-Fake Name", "@FAKE"])("prefixes formula-like text %s", (name) => {
    const merchant = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name } };
    expect(toCsv([merchant], {}).split("\r\n")[1].split(",")[2]).toBe(`'${name}`);
  });

  it("escapes formula text before RFC quoting while leaving negative numbers numeric", () => {
    const merchant = { ...FAKE_MERCHANT, rankLift: -3, pitch: '=FAKE("offer", "test")',
      place: { ...FAKE_MERCHANT.place, phone: "+1 555 0100" } };
    const csv = toCsv([merchant], {});
    expect(csv).toContain(",'+1 555 0100,");
    expect(csv).toContain(",-3,4.5,4,");
    expect(csv).not.toContain("'-3");
    expect(csv).toContain('"\'=FAKE(""offer"", ""test"")"\r\n');
  });

  it("keeps missing optional values blank and both true/false boolean values readable", () => {
    const merchant = { ...FAKE_MERCHANT, brandShares: [], rankLift: null, multiLocation: false, businessMember: true,
      place: { ...FAKE_MERCHANT.place, phone: undefined, website: undefined, businessRating: undefined, tripadvisorRating: undefined } };
    const cells = toCsv([merchant], {}).split("\r\n")[1].split(",");
    expect(cells.slice(5, 7)).toEqual(["", ""]);
    expect(cells.slice(8, 14)).toEqual(["", "", "", "", "no", "yes"]);
    expect(toCsv([merchant], {})).not.toMatch(/undefined|null/);
  });

  it("uses the latest saved follow-up status and keeps all brand shares", () => {
    const merchant = { ...FAKE_MERCHANT, brandShares: [{ brandName: "Fake Coffee", sharePercent: 53 }, { brandName: "Fake Tea", sharePercent: 47 }] };
    const csv = toCsv([merchant], { [merchant.place.entityId]: { name: merchant.place.name, status: "not_a_fit", updatedAt: "2026-10-23" } });
    const cells = csv.split("\r\n")[1].split(",");
    expect(cells[8]).toBe("Fake Coffee 53% · Fake Tea 47%");
    expect(cells[14]).toBe("not_a_fit");
  });
});
