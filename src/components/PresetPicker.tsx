"use client";
// Offers a fresh credit union setup followed by two fictional demo profiles.
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
      <CardTitle>Set up your credit union</CardTitle>
      <CardDescription>Find local merchants your members already love. Your profile is saved in this browser. Research sends relevant fields to the app server.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <Button disabled={disabled} onClick={onStartBlank} className="w-full bg-teal-800 py-3 hover:bg-teal-900">Start with my credit union</Button>
      <p className="text-xs text-slate-500">Or explore a demo with a fictional credit union:</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {getPresets().map((preset) => <Button key={preset.id} variant="outline" disabled={disabled}
          onClick={() => onSelect(preset)} className="w-full justify-between border-teal-200 px-3 py-2 text-left text-xs hover:bg-teal-50">
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-semibold text-teal-900">Try {preset.profile.city.split(",")[0]} demo</span>
            <span className="mt-1 block text-xs font-normal text-slate-500">{preset.profile.branches.length} branches · Ready to explore</span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-lg text-teal-700">→</span>
        </Button>)}
      </div>
    </CardContent>
  </Card>;
}
