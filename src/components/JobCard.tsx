import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, DollarSign, Briefcase, Bookmark, BookmarkCheck, ExternalLink, Sparkles, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSalary, timeAgo } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { submitMatchFeedback } from "@/lib/ai.functions";

export interface Job {
  id: string;
  title: string;
  company: string;
  company_logo: string | null;
  location: string;
  work_mode: "remote" | "hybrid" | "onsite";
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  experience_level: string;
  role: string;
  description: string;
  skills: string[];
  apply_url: string | null;
  posted_at: string;
}

export function JobCard({
  job,
  saved,
  applied,
  matchScore,
  onScore,
}: {
  job: Job;
  saved?: boolean;
  applied?: boolean;
  matchScore?: number | null;
  onScore?: (jobId: string) => void;
}) {
  const qc = useQueryClient();
  const feedbackFn = useServerFn(submitMatchFeedback);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      if (saved) {
        const { error } = await supabase.from("saved_jobs").delete().eq("user_id", u.user.id).eq("job_id", job.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("saved_jobs").insert({ user_id: u.user.id, job_id: job.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      qc.invalidateQueries({ queryKey: ["saved-jobs-ids"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(saved ? "Removed from saved" : "Saved for later");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("applied_jobs").upsert({ user_id: u.user.id, job_id: job.id, status: "applied" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applied-jobs"] });
      qc.invalidateQueries({ queryKey: ["applied-jobs-ids"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Marked as applied");
      if (job.apply_url) window.open(job.apply_url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const feedbackMut = useMutation({
    mutationFn: async (rating: 1 | -1) => {
      await feedbackFn({ data: { jobId: job.id, feedback: rating } });
    },
    onSuccess: () => toast.success("Thanks — future scores will calibrate."),
    onError: (e: any) => toast.error(e.message),
  });

  const modeColor =
    job.work_mode === "remote" ? "bg-success/15 text-success" :
    job.work_mode === "hybrid" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning";

  return (
    <article className="glass group relative flex flex-col gap-4 rounded-2xl p-5 transition hover:-translate-y-1 hover:shadow-glow animate-pop-in">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card">
            {job.company_logo ? (
              <img src={job.company_logo} alt={job.company} className="h-full w-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <span className="text-sm font-bold">{job.company[0]}</span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{job.title}</h3>
            <div className="text-sm text-muted-foreground">{job.company} · {timeAgo(job.posted_at)}</div>
          </div>
        </div>
        <button
          aria-label="Bookmark"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className={cn("shrink-0 rounded-lg border border-border p-2 transition hover:bg-card", saved ? "text-primary" : "text-muted-foreground")}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-2.5 py-1"><MapPin className="h-3 w-3" /> {job.location}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 capitalize", modeColor)}>{job.work_mode}</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-2.5 py-1"><Briefcase className="h-3 w-3" /> <span className="capitalize">{job.experience_level}</span></span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-2.5 py-1"><DollarSign className="h-3 w-3" /> {formatSalary(job.salary_min, job.salary_max, job.currency)}</span>
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>

      {job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.skills.slice(0, 5).map((s) => (
            <span key={s} className="rounded-md bg-muted px-2 py-1 text-xs">{s}</span>
          ))}
        </div>
      )}

      <footer className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {typeof matchScore === "number" ? (
            <>
              <div className="flex items-center gap-2 rounded-full bg-gradient-primary/10 px-3 py-1 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-gradient">{matchScore}% match</span>
              </div>
              <button
                aria-label="Score looks right"
                onClick={() => feedbackMut.mutate(1)}
                disabled={feedbackMut.isPending}
                className="rounded-full border border-border p-1.5 text-muted-foreground transition hover:text-success"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label="Score is off"
                onClick={() => feedbackMut.mutate(-1)}
                disabled={feedbackMut.isPending}
                className="rounded-full border border-border p-1.5 text-muted-foreground transition hover:text-destructive"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </>
          ) : onScore ? (
            <button
              onClick={() => onScore(job.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" /> AI match score
            </button>
          ) : null}
        </div>
        {applied ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-3 py-1.5 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" /> Applied
          </span>
        ) : (
          <Button size="sm" onClick={() => applyMut.mutate()} disabled={applyMut.isPending} className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95">
            Apply <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </footer>
    </article>
  );
}
