"use client";
// Downloads the current merchant list as CSV and reports browser download failures.
// Called by: the results section on the main Perk Desk page
import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { CSV_DOWNLOAD_REVOKE_DELAY_MS } from "@/lib/config";
import { toCsv } from "@/lib/csv";
import type { MerchantResult, Profile, ResolvedBrand } from "@/lib/types";

type ExportButtonProps = { merchants: MerchantResult[]; merchantStatus: Profile["merchantStatus"]; brands?: ResolvedBrand[] };

function downloadFilename(): string {
  const date = new Date();
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return `perk-desk-${day}.csv`;
}

function downloadCsv(csv: string): void {
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  try {
    anchor.href = url;
    anchor.download = downloadFilename();
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to start the download before releasing the Blob URL.
    window.setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch { /* Cleanup failure must not interrupt the page after download. */ }
    }, CSV_DOWNLOAD_REVOKE_DELAY_MS);
  }
}

export default function ExportButton({ merchants, merchantStatus, brands = [] }: ExportButtonProps): ReactElement {
  const [errorMessage, setErrorMessage] = useState("");
  function exportMerchants(): void {
    setErrorMessage("");
    try { downloadCsv(toCsv(merchants, merchantStatus, brands)); }
    catch { setErrorMessage("Could not export this list. Please try again."); }
  }
  return <div className="space-y-2">
    <Button variant="outline" disabled={!merchants.length} onClick={exportMerchants}>Export CSV</Button>
    {errorMessage && <p role="alert" className="text-sm text-red-800">{errorMessage}</p>}
  </div>;
}
