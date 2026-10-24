"use client";
// Collects editable member-brand names from pasted text, uploaded lists, or quick segments.
// Called by: the main Perk Desk page before category planning.
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { TASTE_MAX_BRANDS, UPLOAD_MAX_BYTES } from "@/lib/config";
import { getCategoryDefaults } from "@/lib/data";
import { parseUploadedList } from "@/lib/request-builders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TasteInputProps = { value: string; onChange: (text: string) => void; disabled?: boolean };

export default function TasteInput({ value, onChange, disabled = false }: TasteInputProps): ReactElement {
  const uploadVersion = useRef(0);
  const brandsInput = useRef<HTMLTextAreaElement>(null);
  const [uploadError, setUploadError] = useState("");
  useEffect(() => {
    uploadVersion.current += 1;
    return () => { uploadVersion.current += 1; };
  }, [value, disabled]);
  function editBrands(text: string): void {
    uploadVersion.current += 1;
    setUploadError("");
    onChange(text);
  }
  async function uploadBrands(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const version = ++uploadVersion.current;
    setUploadError("");
    if (!file || disabled) return;
    if (!/\.(csv|txt)$/i.test(file.name)) return setUploadError("Choose a CSV or text file.");
    if (file.size > UPLOAD_MAX_BYTES) return setUploadError("This file is too large. Choose a smaller CSV or text file.");
    try {
      const names = parseUploadedList(await file.text());
      // A newer edit, preset, upload, or disabled state takes priority over an unfinished file read.
      if (version !== uploadVersion.current || brandsInput.current?.value !== value || brandsInput.current.disabled) return;
      if (!names.length) return setUploadError("No brand names were found in this file.");
      editBrands(names.join("\n"));
    } catch {
      if (version === uploadVersion.current) setUploadError("Could not read this file. Try another CSV or text file.");
    }
  }
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
          onClick={() => editBrands(segment.seedBrands.join("\n"))} className="rounded-full px-3 py-2 text-xs hover:border-teal-400 hover:text-teal-800">
          {segment.label}
        </Button>)}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="member-brands">Member brands</Label>
          <span className={`text-xs ${tooMany ? "font-medium text-red-700" : "text-slate-500"}`} aria-live="polite">{brandCount} / {TASTE_MAX_BRANDS}</span>
        </div>
        <Textarea ref={brandsInput} id="member-brands" rows={6} value={value} disabled={disabled} placeholder={"REI\nPatagonia\nLululemon"}
          aria-invalid={tooMany} aria-describedby="member-brands-help" onChange={(event) => editBrands(event.target.value)} />
        <p id="member-brands-help" className={`text-xs leading-relaxed ${tooMany ? "text-red-700" : "text-slate-500"}`}>
          {tooMany ? `Use at most ${TASTE_MAX_BRANDS} unique brand names.` : `Aggregated brand names only. Enter 1–${TASTE_MAX_BRANDS} brands, one per line.`}
        </p>
        <Label htmlFor="member-brands-file" className="text-xs text-slate-600">Upload a brand list</Label>
        <Input id="member-brands-file" type="file" accept=".csv,.txt" disabled={disabled}
          aria-describedby="member-brands-upload-help" onChange={uploadBrands} />
        <a href="/samples/brands-sample.csv" download aria-label="Download sample for member brands"
          className="inline-block text-xs text-teal-700 underline hover:text-teal-900">Download sample</a>
        <p id="member-brands-upload-help" className="text-xs text-slate-500">
          The first column fills the list above. A name, merchant, or brand header is optional. Quote names containing commas.
        </p>
        {uploadError && <p role="alert" className="text-xs text-red-700">{uploadError}</p>}
      </div>
    </CardContent>
  </Card>;
}
