"use client";
// Offers the two fictional demo programs as complete starting profiles.
// Called by: the main Perk Desk page before profile and taste editing.
import type { ReactElement } from "react";
import { getPresets } from "@/lib/data";
import type { Preset } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PresetPickerProps = { onSelect: (preset: Preset) => void; onStartBlank: () => void; disabled?: boolean };

export default function PresetPicker({ onSelect, onStartBlank, disabled = false }: PresetPickerProps): ReactElement {
  return <Card className="border-teal-200 bg-teal-50/40">
    <CardHeader>
      <CardTitle>Start with a demo</CardTitle>
      <CardDescription>Explore a fictional credit union with branches and member brands already filled in.</CardDescription>
      <p className="text-xs text-slate-500">Clear this browser&apos;s profile and results.</p>
    </CardHeader>
    <CardContent className="grid gap-3 sm:grid-cols-2">
      {getPresets().map((preset) => <Button key={preset.id} variant="outline" disabled={disabled}
        onClick={() => onSelect(preset)} className="w-full justify-between border-teal-200 px-4 py-3 text-left hover:bg-teal-50">
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-semibold text-teal-900">Try {preset.profile.city.split(",")[0]} demo</span>
          <span className="mt-1 block text-xs font-normal text-slate-500">{preset.profile.branches.length} branches · Ready to explore</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-lg text-teal-700">→</span>
      </Button>)}
      <Button variant="secondary" disabled={disabled} onClick={onStartBlank} className="w-full sm:col-span-2">Start blank</Button>
    </CardContent>
  </Card>;
}
