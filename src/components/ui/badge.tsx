// Provides a hand-written badge fallback while the shadcn registry is unavailable.
// Called by: Perk Desk category and merchant components
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline" | "destructive";
};

const VARIANT_CLASSES = {
  default: "bg-slate-900 text-white",
  secondary: "bg-slate-100 text-slate-700",
  outline: "border border-slate-300 text-slate-700",
  destructive: "bg-red-100 text-red-800",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps): ReactElement {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASSES[variant], className)} {...props} />;
}
