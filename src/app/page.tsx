// Presents the initial Perk Desk landing placeholder.
// Called by: Next.js App Router
import type { ReactNode } from "react";

export default function Home(): ReactNode {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
      <h1 className="text-4xl font-semibold">Perk Desk</h1>
      <p className="mt-4 max-w-2xl text-lg">Cardlytics tells you where members spend; Perk Desk tells you which unsigned local merchants to sign first.</p>
    </main>
  );
}
