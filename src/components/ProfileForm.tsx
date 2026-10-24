"use client";
// Edits the institution, city, branches, and already-signed merchant list.
// Called by: the main Perk Desk page; changes are persisted by the page.
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { UPLOAD_MAX_BYTES } from "@/lib/config";
import { getCities } from "@/lib/data";
import { parseUploadedList } from "@/lib/request-builders";
import type { Profile } from "@/lib/types";
import BranchEditor from "@/components/BranchEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ProfileFormProps = {
  profile: Profile; onChange: (profile: Profile) => void;
  pickingBranchId?: string; onPickBranch: (id: string) => void; disabled?: boolean;
};

function CityField({ value, onChange }: { value: string; onChange: (city: string) => void }): ReactElement {
  const cities = getCities();
  const knownCity = cities.some((city) => city.label === value);
  return <div className="space-y-2">
    <Label htmlFor="profile-city">City</Label>
    <Select id="profile-city" value={knownCity ? value : "other"}
      onChange={(event) => onChange(event.target.value === "other" ? "" : event.target.value)}>
      {cities.map((city) => <option key={city.label} value={city.label}>{city.label}</option>)}
      <option value="other">Other city</option>
    </Select>
    {!knownCity && <div className="space-y-2 pt-1">
      <Label htmlFor="profile-other-city">Other city (City, ST)</Label>
      <Input id="profile-other-city" value={value} placeholder="Portland, OR" required autoComplete="address-level2"
        onChange={(event) => onChange(event.target.value)} />
    </div>}
  </div>;
}

function SignedMerchants({ profile, onChange, disabled }: {
  profile: Profile; onChange: (profile: Profile) => void; disabled: boolean;
}): ReactElement {
  const [reading, setReading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [upload, setUpload] = useState<{ profile: Profile; text: string; version: number } | null>(null);
  const readVersion = useRef(0);
  useEffect(() => {
    return () => { readVersion.current += 1; };
  }, [profile, disabled]);
  useEffect(() => {
    // Apply against current committed props, so a late read cannot restore an older preset/profile.
    if (upload?.profile === profile && upload.version === readVersion.current && !disabled) {
      onChange({ ...profile, signedMerchantsText: upload.text });
    }
  }, [upload, profile, onChange, disabled]);
  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++readVersion.current;
    setErrorMessage("");
    if (!/\.(csv|txt)$/i.test(file.name)) { setErrorMessage("Choose a CSV or text file."); return; }
    if (file.size > UPLOAD_MAX_BYTES) { setErrorMessage("Choose a CSV or text file no larger than 1 MB."); return; }
    setReading(true);
    try {
      const text = await file.text();
      if (version !== readVersion.current) return;
      const names = parseUploadedList(text);
      if (!names.length) { setErrorMessage("No merchant names were found in this file."); return; }
      setUpload({ profile, text: names.join("\n"), version });
    } catch {
      if (version === readVersion.current) setErrorMessage("Could not read this file. Please try again.");
    } finally { setReading(false); }
  }
  function editText(text: string): void {
    readVersion.current += 1;
    setErrorMessage("");
    onChange({ ...profile, signedMerchantsText: text });
  }
  return <div className="space-y-2 border-t border-slate-100 pt-6">
    <Label htmlFor="signed-merchants">Already-signed merchants <span className="font-normal text-slate-500">(optional)</span></Label>
    <Textarea id="signed-merchants" value={profile.signedMerchantsText} rows={4} placeholder="One shop name per line"
      aria-describedby="signed-merchants-help" onChange={(event) => editText(event.target.value)} />
    <p id="signed-merchants-help" className="text-xs leading-relaxed text-slate-500">We exclude matching merchants so you can focus on new partnerships.</p>
    <Label htmlFor="signed-merchants-upload" className="block pt-2 text-xs">Import signed merchants from CSV or text</Label>
    <Input id="signed-merchants-upload" type="file" accept=".csv,.txt" disabled={disabled || reading}
      aria-describedby="signed-merchants-upload-help" onChange={(event) => { void readFile(event); }} />
    <p id="signed-merchants-upload-help" className="text-xs leading-relaxed text-slate-500">CSV and text imports use the first column; quote names containing commas. Import replaces the text above so you can review and edit it. Maximum 1 MB.</p>
    {reading && <p role="status" className="text-xs text-slate-500">Reading file…</p>}
    {errorMessage && <p role="alert" className="text-sm text-red-800">{errorMessage}</p>}
  </div>;
}

export default function ProfileForm({ profile, onChange, pickingBranchId, onPickBranch, disabled = false }: ProfileFormProps): ReactElement {
  return <Card>
    <CardHeader>
      <CardTitle id="program-profile-heading">Your perks program</CardTitle>
      <CardDescription>Set the local area you serve. This profile stays in this browser.</CardDescription>
    </CardHeader>
    <CardContent>
      <fieldset disabled={disabled} aria-labelledby="program-profile-heading" className="space-y-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="institution-name">Credit union name</Label>
            <Input id="institution-name" value={profile.institutionName} placeholder="Your credit union" autoComplete="organization" required
              onChange={(event) => onChange({ ...profile, institutionName: event.target.value })} />
          </div>
          <CityField value={profile.city} onChange={(city) => onChange({ ...profile, city })} />
        </div>
        <BranchEditor branches={profile.branches} onChange={(branches) => onChange({ ...profile, branches })}
          pickingBranchId={pickingBranchId} onPickBranch={onPickBranch} disabled={disabled} />
        <SignedMerchants profile={profile} onChange={onChange} disabled={disabled} />
      </fieldset>
    </CardContent>
  </Card>;
}
