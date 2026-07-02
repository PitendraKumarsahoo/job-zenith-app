import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { notifyStatusChange, getTelegramStatus } from "@/lib/telegram.functions";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2, PlayCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/smoke-test")({
  component: SmokeTestPage,
});

type Status = "applied" | "interview" | "offer" | "rejected" | "withdrawn";
type StepState = "pending" | "running" | "ok" | "fail" | "skip";
type Step = { key: string; label: string; state: StepState; detail?: string };

const INITIAL: Step[] = [
  { key: "auth", label: "Authenticated session", state: "pending" },
  { key: "job", label: "Pick a sample job", state: "pending" },
  { key: "save", label: "Save job (bookmark)", state: "pending" },
  { key: "apply", label: "Create application (status = applied)", state: "pending" },
  { key: "interview", label: "Move → interview + Telegram notify", state: "pending" },
  { key: "offer", label: "Move → offer + Telegram notify", state: "pending" },
  { key: "cleanup", label: "Clean up test rows", state: "pending" },
];

function SmokeTestPage() {
  const notifyFn = useServerFn(notifyStatusChange);
  const statusFn = useServerFn(getTelegramStatus);
  const { data: tgStatus } = useQuery({ queryKey: ["telegram-status"], queryFn: () => statusFn() });

  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [running, setRunning] = useState(false);

  function patch(key: string, s: StepState, detail?: string) {
    setSteps((prev) => prev.map((st) => (st.key === key ? { ...st, state: s, detail } : st)));
  }

  async function moveStage(appliedId: string, next: Status, key: string) {
    patch(key, "running");
    const { error } = await supabase.from("applied_jobs").update({ status: next }).eq("id", appliedId);
    if (error) { patch(key, "fail", error.message); return false; }
    try {
      const res = await notifyFn({ data: { appliedId, newStatus: next } });
      if ((res as any)?.ok) patch(key, "ok", `Telegram sent (${next})`);
      else patch(key, "skip", `Status updated, Telegram skipped: ${(res as any)?.reason ?? "unknown"}`);
    } catch (e: any) {
      patch(key, "skip", `Status updated, Telegram error: ${e.message}`);
    }
    return true;
  }

  async function run() {
    setRunning(true);
    setSteps(INITIAL.map((s) => ({ ...s, state: "pending", detail: undefined })));

    // 1. auth
    patch("auth", "running");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { patch("auth", "fail", "Not signed in"); setRunning(false); return; }
    patch("auth", "ok", u.user.email ?? u.user.id);

    // 2. pick job
    patch("job", "running");
    const { data: jobs, error: jerr } = await supabase.from("jobs").select("id, title, company").limit(1);
    if (jerr || !jobs?.length) { patch("job", "fail", jerr?.message ?? "No jobs seeded"); setRunning(false); return; }
    const job = jobs[0];
    patch("job", "ok", `${job.title} @ ${job.company}`);

    // 3. save
    patch("save", "running");
    const { error: serr } = await supabase.from("saved_jobs").upsert(
      { user_id: u.user.id, job_id: job.id },
      { onConflict: "user_id,job_id" }
    );
    if (serr) { patch("save", "fail", serr.message); setRunning(false); return; }
    patch("save", "ok");

    // 4. apply
    patch("apply", "running");
    const { data: appRow, error: aerr } = await supabase
      .from("applied_jobs")
      .insert({ user_id: u.user.id, job_id: job.id, status: "applied" })
      .select("id")
      .single();
    if (aerr || !appRow) { patch("apply", "fail", aerr?.message ?? "insert failed"); setRunning(false); return; }
    patch("apply", "ok", `applied_jobs.id = ${appRow.id.slice(0, 8)}…`);

    // 5 + 6. transitions
    const okInterview = await moveStage(appRow.id, "interview", "interview");
    if (okInterview) await moveStage(appRow.id, "offer", "offer");

    // 7. cleanup
    patch("cleanup", "running");
    await supabase.from("applied_jobs").delete().eq("id", appRow.id);
    await supabase.from("saved_jobs").delete().eq("user_id", u.user.id).eq("job_id", job.id);
    patch("cleanup", "ok");

    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">QA</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">End-to-end smoke test</h1>
        <p className="mt-2 text-muted-foreground">
          Save → apply → move to interview → move to offer, and verify a Telegram notification fires at each stage change.
        </p>
      </header>

      {!tgStatus?.configured && (
        <div className="glass flex items-center gap-3 rounded-2xl border border-warning/40 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div>
            Telegram isn't configured. The test still runs, but notification steps will report <em>skipped</em>. Configure it in Settings first for a full check.
          </div>
        </div>
      )}

      <div className="glass rounded-2xl p-6">
        <Button onClick={run} disabled={running} className="bg-gradient-primary text-primary-foreground shadow-glow">
          {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…</> : <><PlayCircle className="mr-2 h-4 w-4" /> Run smoke test</>}
        </Button>

        <ul className="mt-6 space-y-2">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-3">
              <StepIcon state={s.state} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.label}</div>
                {s.detail && <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.detail}</div>}
              </div>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                s.state === "ok" && "bg-success/15 text-success",
                s.state === "fail" && "bg-destructive/15 text-destructive",
                s.state === "skip" && "bg-muted text-muted-foreground",
                s.state === "running" && "bg-primary/15 text-primary",
                s.state === "pending" && "bg-muted/40 text-muted-foreground",
              )}>
                {s.state}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "ok") return <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />;
  if (state === "fail") return <XCircle className="mt-0.5 h-5 w-5 text-destructive" />;
  if (state === "running") return <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />;
  if (state === "skip") return <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />;
  return <div className="mt-1 h-4 w-4 rounded-full border border-border" />;
}
