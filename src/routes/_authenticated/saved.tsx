import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { JobCard, type Job } from "@/components/JobCard";

export const Route = createFileRoute("/_authenticated/saved")({
  component: SavedPage,
});

function SavedPage() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["saved-jobs"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("saved_jobs")
        .select("job:jobs(*)")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });
      return ((data ?? []).map((r) => r.job).filter(Boolean) as unknown) as Job[];
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

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Saved</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Your bookmarks</h1>
        <p className="mt-2 text-muted-foreground">Jobs you've stashed for later.</p>
      </header>
      {isLoading ? (
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">
          Nothing saved yet. Bookmark jobs from the search page.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((j) => <JobCard key={j.id} job={j} saved applied={appliedIds.has(j.id)} />)}
        </div>
      )}
    </div>
  );
}
