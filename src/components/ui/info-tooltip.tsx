"use client";
// Shows a small, dismissible explanation beside an information button.
// Called by: MerchantResults; label and text also support other short explanations.
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { INFO_TOOLTIP_Z_INDEX } from "@/lib/config";

type InfoTooltipProps = { label: string; text: string };

export function InfoTooltip({ label, text }: InfoTooltipProps): ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  const openBeforePointer = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggle(): void {
    // A touch can focus the button before click; toggle from its pre-focus state.
    setOpen(!(openBeforePointer.current ?? open));
    openBeforePointer.current = undefined;
  }

  return <span ref={container} className="relative inline-flex shrink-0"
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={label} aria-describedby={id}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-xs font-semibold text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={toggle}
      onPointerDown={() => { openBeforePointer.current = open; }}
      onPointerCancel={() => { openBeforePointer.current = undefined; }}>i</button>
    <span id={id} role="tooltip" hidden={!open} style={{ zIndex: INFO_TOOLTIP_Z_INDEX }}
      className="absolute top-full left-1/2 mt-2 w-60 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-md">
      {text}
    </span>
  </span>;
}
