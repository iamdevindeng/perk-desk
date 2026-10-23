"use client";
// Collects aggregated member-brand names and provides six editable quick-segment starting lists.
// Called by: the main Perk Desk page before category planning.
import type { ReactElement } from "react";
import { TASTE_MAX_BRANDS } from "@/lib/config";
import { getCategoryDefaults } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TasteInputProps = { value: string; onChange: (text: string) => void; disabled?: boolean };

export default function TasteInput({ value, onChange, disabled = false }: TasteInputProps): ReactElement {
  const brandCount = new Set(value.split(/\r?\n/).map((name) => name.trim().toLowerCase()).filter(Boolean)).size;
  const tooMany = brandCount > TASTE_MAX_BRANDS;
  return <Card>
    <CardHeader>
      <CardTitle>What do your members like?</CardTitle>
      <CardDescription>Add favorite brands, or choose a starting segment and edit its list.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <div role="group" aria-label="Quick member taste segments" className="flex flex-wrap gap-2">
        {getCategoryDefaults().quickSegments.map((segment) => <Button key={segment.id} variant="outline" disabled={disabled}
          onClick={() => onChange(segment.seedBrands.join("\n"))} className="rounded-full px-3 py-2 text-xs hover:border-teal-400 hover:text-teal-800">
          {segment.label}
        </Button>)}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="member-brands">Member brands</Label>
          <span className={`text-xs ${tooMany ? "font-medium text-red-700" : "text-slate-500"}`} aria-live="polite">{brandCount} / {TASTE_MAX_BRANDS}</span>
        </div>
        <Textarea id="member-brands" rows={6} value={value} disabled={disabled} placeholder={"REI\nPatagonia\nLululemon"}
          aria-invalid={tooMany} aria-describedby="member-brands-help" onChange={(event) => onChange(event.target.value)} />
        <p id="member-brands-help" className={`text-xs leading-relaxed ${tooMany ? "text-red-700" : "text-slate-500"}`}>
          {tooMany ? `Use at most ${TASTE_MAX_BRANDS} unique brand names.` : `Aggregated brand names only. Enter 1–${TASTE_MAX_BRANDS} brands, one per line.`}
        </p>
      </div>
    </CardContent>
  </Card>;
}
