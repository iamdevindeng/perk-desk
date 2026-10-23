"use client";
// Edits the institution, city, branches, and already-signed merchant list.
// Called by: the main Perk Desk page; changes are persisted by the page.
import type { ReactElement } from "react";
import { getCities } from "@/lib/data";
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
        <div className="space-y-2 border-t border-slate-100 pt-6">
          <Label htmlFor="signed-merchants">Already-signed merchants <span className="font-normal text-slate-500">(optional)</span></Label>
          <Textarea id="signed-merchants" value={profile.signedMerchantsText} rows={4} placeholder={"One shop name per line"}
            aria-describedby="signed-merchants-help" onChange={(event) => onChange({ ...profile, signedMerchantsText: event.target.value })} />
          <p id="signed-merchants-help" className="text-xs leading-relaxed text-slate-500">We exclude matching merchants so you can focus on new partnerships.</p>
        </div>
      </fieldset>
    </CardContent>
  </Card>;
}
