// Provides a hand-written native textarea fallback while the shadcn registry is unavailable.
// Called by: Perk Desk merchant-list and taste-input components
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">): ReactElement {
  return <textarea className={cn(
    "min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  )} {...props} />;
}
