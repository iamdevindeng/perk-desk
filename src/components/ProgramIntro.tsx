// Introduces the merchant partner research workflow at the top of the page.
// Called by: the main Perk Desk page
import type { ReactElement } from "react";

export default function ProgramIntro(): ReactElement {
  return <header className="mb-8 max-w-3xl">
    <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-teal-700">Perk Desk</p>
    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Find your next local partners.</h1>
    <p className="mt-3 text-base leading-7 text-slate-600">Turn the brands your members love into a focused list of local merchants near your branches.</p>
  </header>;
}
