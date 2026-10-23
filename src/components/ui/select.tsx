// Provides a hand-written native select fallback while the shadcn registry is unavailable.
// Called by: Perk Desk forms using ordinary option children and onChange
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: ComponentProps<"select">): ReactElement {
  return <select className={cn(
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  )} {...props} />;
}
