"use client";
// Shows research progress, service outcomes, and a local judge-code retry control.
// Called by: src/app/page.tsx while research runs and when a run needs attention
import { useEffect, useState, type ReactElement } from "react";
import { TRACE_VISIBLE_EVENTS } from "@/lib/config";
import { loadJudgeCode, saveJudgeCode } from "@/lib/profile-storage";
import type { StepId, TraceEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AgentTraceProps = { events: TraceEvent[]; onRetry: () => void; disabled?: boolean };
type StepStatus = "pending" | "running" | "done";
const STEPS: { id: StepId; label: string }[] = [
  { id: "resolve_brands", label: "Recognize member brands" },
  { id: "pick_categories", label: "Confirm merchant categories" },
  { id: "find_merchants", label: "Find nearby merchants" },
  { id: "filter_score", label: "Filter and score matches" },
  { id: "data_check", label: "Check local availability" },
  { id: "rank_pitch", label: "Prepare the shortlist and pitches" },
];
const ERROR_MESSAGES = {
  bad_request: "Please check your request and try again.", config: "Server is missing its Qloo key.",
  auth: "Qloo refused our key. Demo presets may still work from cache.",
  quota: "Live research is paused (Qloo quota). Demo presets may still work from cache.",
  upstream: "Qloo is having trouble; try again in a minute.", timeout: "Qloo is having trouble; try again in a minute.",
  no_brands: "None of these brands were found on Qloo.", internal: "Something went wrong.",
};

function detailText(event: TraceEvent): string | null {
  if (event.type === "tool_call") return `${event.tool}: ${event.summary}`;
  if (event.type === "qloo_call") return `${event.cached ? "Cached" : "Qloo"}: ${event.summary}`;
  if (event.type === "guard") return `Category check: ${event.summary}`;
  if (event.type === "agent_note") return event.text;
  return null;
}

function stepStatus(step: StepId, events: TraceEvent[]): StepStatus {
  const latest = events.findLast((event) => event.type === "step" && event.step === step);
  if (latest?.type !== "step") return "pending";
  return latest.status === "done" ? "done" : "running";
}

function StepRow({ label, status, details, ended }: {
  label: string; status: StepStatus; details: string[]; ended: boolean;
}): ReactElement {
  const running = status === "running" && !ended;
  const statusText = status === "done" ? "Done" : running ? "Running" : status === "running" ? "Stopped" : "Pending";
  return <li className="py-3">
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
        status === "done" ? "bg-teal-100 font-semibold text-teal-800" : running ? "animate-pulse bg-teal-600 text-white" : "bg-slate-100 text-slate-400"
      }`}>{status === "done" ? "✓" : running ? "•" : "○"}</span>
      <span className={`flex-1 text-sm ${status === "pending" ? "text-slate-500" : "font-medium text-slate-800"}`}>{label}</span>
      <span className="text-xs text-slate-500">{statusText}</span>
    </div>
    {details.length > 0 && <ul className="ml-9 mt-3 max-h-48 space-y-2 overflow-y-auto border-l border-slate-200 pl-3 text-xs leading-relaxed text-slate-500">
      {details.map((detail, index) => <li key={index} className="break-words">{detail}</li>)}
    </ul>}
  </li>;
}

function LimitedPanel({ message, onRetry, disabled }: { message: string; onRetry: () => void; disabled: boolean }): ReactElement {
  const [judgeCode, setJudgeCode] = useState("");
  useEffect(() => {
    let mounted = true;
    // Read browser storage after hydration; the code never enters trace events or request bodies.
    queueMicrotask(() => { if (mounted) setJudgeCode(loadJudgeCode()); });
    return () => { mounted = false; };
  }, []);
  function retry(): void { saveJudgeCode(judgeCode); onRetry(); }
  return <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <p role="status" className="text-sm leading-relaxed text-amber-900">{message}</p>
    <div className="space-y-2">
      <Label htmlFor="judge-access-code">Judge access code</Label>
      <Input id="judge-access-code" type="password" autoComplete="off" value={judgeCode} disabled={disabled}
        aria-describedby="judge-access-code-help" placeholder="Enter your access code"
        onChange={(event) => { setJudgeCode(event.target.value); saveJudgeCode(event.target.value); }} />
      <p id="judge-access-code-help" className="text-xs text-amber-800">Saved in this browser for your next request.</p>
    </div>
    <Button onClick={retry} disabled={disabled || !judgeCode.trim()} className="bg-teal-700 hover:bg-teal-800">Retry with access code</Button>
  </div>;
}

export default function AgentTrace({ events, onRetry, disabled = false }: AgentTraceProps): ReactElement {
  const latestStep = events.findLast((event) => event.type === "step");
  const detailStep = latestStep?.type === "step" ? latestStep.step : STEPS[0].id;
  const details = events.flatMap((event) => { const text = detailText(event); return text ? [text] : []; }).slice(-TRACE_VISIBLE_EVENTS);
  const liveCalls = events.filter((event) => event.type === "qloo_call" && !event.cached).length;
  const cachedCalls = events.filter((event) => event.type === "qloo_call" && event.cached).length;
  const fallback = events.findLast((event) => event.type === "fallback");
  const limited = events.findLast((event) => event.type === "limited");
  const error = events.findLast((event) => event.type === "error");
  const ended = events.some((event) => ["result", "error", "limited", "done"].includes(event.type));
  return <Card>
    <CardHeader><CardTitle>Research progress</CardTitle>
      <p aria-live="polite" className="text-xs text-slate-500">{liveCalls} Qloo calls · cached {cachedCalls}</p>
    </CardHeader>
    <CardContent className="space-y-4">
      {fallback?.type === "fallback" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        <strong>Fallback mode:</strong> {fallback.reason}
      </p>}
      <ol aria-label="Research steps" className="divide-y divide-slate-100">
        {STEPS.map((step) => <StepRow key={step.id} label={step.label} status={stepStatus(step.id, events)}
          details={step.id === detailStep ? details : []} ended={ended} />)}
      </ol>
      {limited?.type === "limited" && <LimitedPanel message={limited.message} onRetry={onRetry} disabled={disabled} />}
      {error?.type === "error" && <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">{ERROR_MESSAGES[error.code]}</p>
        <Button onClick={onRetry} disabled={disabled} variant="outline">Retry</Button>
      </div>}
    </CardContent>
  </Card>;
}
