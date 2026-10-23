// Joins optional CSS classes without extra dependencies.
// Called by: hand-written UI fallbacks in src/components/ui
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
