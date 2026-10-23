// Provides hand-written card containers while the shadcn registry is unavailable.
// Called by: Perk Desk profile, confirmation, and merchant components
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("space-y-1.5 px-6 pt-6 pb-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">): ReactElement {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">): ReactElement {
  return <p className={cn("text-sm text-slate-600", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div className={cn("flex items-center gap-2 px-6 pb-6", className)} {...props} />;
}
