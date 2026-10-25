"use client";
// Keeps the back-to-top logo reachable while the page scrolls.
// Called by: the main Perk Desk page
import type { ReactElement } from "react";
import { TOP_BAR_HEIGHT_PX, TOP_BAR_Z_INDEX } from "@/lib/config";

function scrollToTop(): void {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
}

export default function ProgramHeader(): ReactElement {
  return <header className="sticky top-0 w-full shrink-0 border-b border-slate-200 bg-white"
    style={{ height: TOP_BAR_HEIGHT_PX, zIndex: TOP_BAR_Z_INDEX }}>
    <div className="mx-auto flex h-full max-w-[1440px] items-center px-5 sm:px-8">
      <button type="button" aria-label="Perk Desk, back to top" onClick={scrollToTop}
        className="block w-fit cursor-pointer text-sm font-bold uppercase tracking-[0.2em] text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Perk Desk</button>
    </div>
  </header>;
}
