import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JobCard, type Job } from "@/components/JobCard";
import { JobFilters, emptyFilters, type Filters } from "@/components/JobFilters";
import { useServerFn } from "@tanstack/react-start";
import { scoreJobMatch } from "@/lib/ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jobs")({
  component: JobsPage,
});

function JobsPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const qc = useQueryClient();

  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").order("posted_at", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });

  const { data: savedIds = new Set<string>() } = useQuery({
    queryKey: ["saved-jobs-ids"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return new Set<string>();
      const { data } = await supabase.from("saved_jobs").select("job_id").eq("user_id", u.user.id);
      return new Set((data ?? []).map((r) => r.job_id));
    },
  });
  const { data: appliedIds = new Set<string>() } = useQuery({
    queryKey: ["applied-jobs-ids"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return new Set<string>();
      const { data } = await supabase.from("applied_jobs").select("job_id").eq("user_id", u.user.id);
      return new Set((data ?? []).map((r) => r.job_id));
    },
  });
  const { data: scores = {} as Record<string, number> } = useQuery({
    queryKey: ["match-scores"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return {} as Record<string, number>;
      const { data } = await supabase.from("job_match_scores").select("job_id, score").eq("user_id", u.user.id);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r) => (map[r.job_id] = r.score));
      return map;
    },
  });

  const scoreFn = useServerFn(scoreJobMatch);
  const scoreMut = useMutation({
    mutationFn: (jobId: string) => scoreFn({ data: { jobId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["match-scores"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const roleOptions = useMemo(() => Array.from(new Set(jobs.map((j) => j.role))).sort(), [jobs]);
  const locationOptions = useMemo(() => Array.from(new Set(jobs.map((j) => j.location))).sort(), [jobs]);

  const filtered = useMemo(() => {
    const q = filters.query.toLowerCase().trim();
    return jobs.filter((j) => {
      if (filters.role !== "any" && j.role !== filters.role) return false;
      if (filters.location !== "any" && j.location !== filters.location) return false;
      if (filters.workMode !== "any" && j.work_mode !== filters.workMode) return false;
      if (filters.experience !== "any" && j.experience_level !== filters.experience) return false;
      const maxSal = j.salary_max ?? j.salary_min ?? 0;
      if (filters.minSalary > 0 && maxSal < filters.minSalary) return false;
      if (q && !(`${j.title} ${j.company} ${j.skills.join(" ")}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [jobs, filters]);

  async function logSearch() {
    if (!filters.query.trim() && filters.role === "any" && filters.location === "any" && filters.workMode === "any" && filters.experience === "any" && filters.minSalary === 0) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("search_history").insert({
      user_id: u.user.id,
      query: filters.query,
      filters: filters as any,
      result_count: filtered.length,
    });
  }

  return (
    <div className="space-y-6">
      <header className="animate-pop-in">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Search</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Discover jobs</h1>
        <p className="mt-2 text-muted-foreground">Filter, save, and score matches against your resume.</p>
      </header>

      <JobFilters filters={filters} setFilters={setFilters} roleOptions={roleOptions} locationOptions={locationOptions} />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{filtered.length} of {jobs.length} jobs</span>
        <button onClick={logSearch} className="rounded-md border border-border bg-card/50 px-3 py-1 hover:bg-card">Save search</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((j) => (
          <JobCard
            key={j.id}
            job={j}
            saved={savedIds.has(j.id)}
            applied={appliedIds.has(j.id)}
            matchScore={scores[j.id] ?? null}
            onScore={(id) => scoreMut.mutate(id)}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">
          No jobs match those filters. Try widening your search.
        </div>
      )}
    </div>
  );
}
