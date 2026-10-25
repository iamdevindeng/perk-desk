"use client";
// Introduces merchant research and returns to the top without losing page state.
// Called by: the main Perk Desk page
import type { ReactElement } from "react";

function scrollToTop(): void {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
}

export default function ProgramIntro(): ReactElement {
  return <header className="mb-8 max-w-3xl">
    <button type="button" aria-label="Perk Desk, back to top" onClick={scrollToTop}
      className="mb-3 block w-fit cursor-pointer text-sm font-bold uppercase tracking-[0.2em] text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Perk Desk</button>
    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Find your next local partners.</h1>
    <p className="mt-3 text-base leading-7 text-slate-600">Turn the brands your members love into a focused list of local merchants near your branches.</p>
  </header>;
}
