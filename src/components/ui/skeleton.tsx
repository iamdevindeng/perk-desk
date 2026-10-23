// Provides a hand-written loading placeholder while the shadcn registry is unavailable.
// Called by: Perk Desk loading states
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none", className)} {...props} />;
}
