"use client";
// Shows planning activity and elapsed seconds without announcing each timer tick.
// Called by: the main page while resolving member brands and categories
import { useEffect, useState, type ReactElement } from "react";
import { MILLISECONDS_PER_SECOND } from "@/lib/config";

export function PlanningSpinner(): ReactElement {
  return <span aria-hidden="true" className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />;
}

function PlanningSeconds(): ReactElement {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / MILLISECONDS_PER_SECOND)), MILLISECONDS_PER_SECOND);
    return () => clearInterval(timer);
  }, []);
  return <span aria-hidden="true" className="inline-block min-w-[3ch] tabular-nums">{seconds}s</span>;
}

export default function PlanningStatus(): ReactElement {
  return <p role="status" className="flex items-center gap-2 text-sm text-teal-800">
    <PlanningSpinner />
    <span>Resolving brands and finding supported categories…{" "}
      <PlanningSeconds />
    </span>
  </p>;
}
