// Moves focus and scroll position to the next visible step after React commits it.
// Called by: the main page and the shortlist's map link
import { useEffect, useRef, useState } from "react";

type NavigationRequest = { id: string };
export type PageNavigation = { navigate: (id: string) => void; cancel: () => void };

export function scrollToElement(id: string): void {
  if (typeof document === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

export function usePageNavigation(): PageNavigation {
  const [request, setRequest] = useState<NavigationRequest | null>(null);
  const handled = useRef<NavigationRequest | null>(null);
  useEffect(() => {
    if (!request || handled.current === request) return;
    // Wait for the new heading to exist, then consume this transition only once.
    handled.current = request;
    scrollToElement(request.id);
  }, [request]);
  return { navigate: (id) => setRequest({ id }), cancel: () => setRequest(null) };
}
