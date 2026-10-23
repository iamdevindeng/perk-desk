"use client";
// Provides a hand-written native switch fallback while the shadcn registry is unavailable.
// Called by: Perk Desk result filters with checked and onCheckedChange
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = ComponentProps<"input"> & {
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ className, onCheckedChange, onChange, ...props }: SwitchProps): ReactElement {
  return <input {...props} type="checkbox" role="switch" className={cn(
    "h-5 w-5 cursor-pointer accent-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  )} onChange={(event) => {
    onCheckedChange?.(event.currentTarget.checked);
    onChange?.(event);
  }} />;
}
