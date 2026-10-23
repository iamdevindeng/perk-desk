// Provides a hand-written separator fallback while the shadcn registry is unavailable.
// Called by: Perk Desk layout and card components
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function Separator({ className, ...props }: ComponentProps<"hr">): ReactElement {
  return <hr className={cn("my-4 border-0 border-t border-slate-200", className)} {...props} />;
}
