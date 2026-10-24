// Formats merchant results as spreadsheet-safe CSV with the documented column order.
// Called by: ExportButton and CSV unit tests
import { DISTANCE_DECIMALS, METERS_PER_KILOMETER, RATING_DECIMALS } from "@/lib/config";
import type { MerchantResult, Profile } from "@/lib/types";

const COLUMNS = [
  "branch", "distance_km", "name", "category", "address", "phone", "website", "google_maps_url",
  "member_brands", "rank_lift", "business_rating", "tripadvisor_rating", "multi_location", "business_member", "status", "pitch",
];
type CsvCell = string | number | null | undefined;

function formatCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  // Only text can be a formula: a numeric rank lift such as -3 must remain numeric.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatPhone(phone?: string): string | undefined {
  // National format avoids treating an ordinary US phone as a spreadsheet formula.
  return phone?.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
}

function merchantRow(merchant: MerchantResult, merchantStatus: Profile["merchantStatus"]): CsvCell[] {
  return [
    merchant.branchName, (merchant.distanceMeters / METERS_PER_KILOMETER).toFixed(DISTANCE_DECIMALS),
    merchant.place.name, merchant.categoryLabel, merchant.place.address, formatPhone(merchant.place.phone),
    merchant.place.website, merchant.googleMapsUrl,
    merchant.brandShares.map((brand) => `${brand.brandName} ${brand.sharePercent}%`).join("; "),
    merchant.rankLift, merchant.place.businessRating?.toFixed(RATING_DECIMALS), merchant.place.tripadvisorRating?.toFixed(RATING_DECIMALS),
    merchant.multiLocation ? "yes" : "no", merchant.businessMember ? "yes" : "no",
    merchantStatus[merchant.place.entityId]?.status ?? "to_contact", merchant.pitch,
  ];
}

export function toCsv(merchants: MerchantResult[], merchantStatus: Profile["merchantStatus"]): string {
  const rows = [COLUMNS, ...merchants.map((merchant) => merchantRow(merchant, merchantStatus))];
  return `\uFEFF${rows.map((row) => row.map(formatCell).join(",")).join("\r\n")}\r\n`;
}
