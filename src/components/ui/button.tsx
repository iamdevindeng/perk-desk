// Provides a hand-written native button fallback while the shadcn registry is unavailable.
// Called by: Perk Desk forms, controls, and action components
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
};

const VARIANT_CLASSES = {
  default: "bg-slate-900 text-white hover:bg-slate-700",
  outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
  ghost: "text-slate-700 hover:bg-slate-100",
  destructive: "bg-red-700 text-white hover:bg-red-800",
};

export function Button({ className, variant = "default", type = "button", ...props }: ButtonProps): ReactElement {
  return <button type={type} className={cn(
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASSES[variant], className,
  )} {...props} />;
}
