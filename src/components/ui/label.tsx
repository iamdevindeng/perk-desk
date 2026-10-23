// Provides a hand-written native label fallback while the shadcn registry is unavailable.
// Called by: Perk Desk form components
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">): ReactElement {
  return <label className={cn("block text-sm font-medium text-slate-800", className)} {...props} />;
}
