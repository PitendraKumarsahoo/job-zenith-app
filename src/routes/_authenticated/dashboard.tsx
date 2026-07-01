import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Bookmark, Send, Sparkles, TrendingUp } from "lucide-react";
import { JobCard, type Job } from "@/components/JobCard";

const statsQuery = () => queryOptions({
  queryKey: ["dashboard-stats"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("no user");
    const [{ count: savedCount }, { count: appliedCount }, { data: recentJobs }, { data: profile }] = await Promise.all([
      supabase.from("saved_jobs").select("*", { count: "exact", head: true }).eq("user_id", u.user.id),
      supabase.from("applied_jobs").select("*", { count: "exact", head: true }).eq("user_id", u.user.id),
      supabase.from("jobs").select("*").order("posted_at", { ascending: false }).limit(6),
      supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle(),
    ]);
    const { count: matchCount } = await supabase.from("job_match_scores").select("*", { count: "exact", head: true }).eq("user_id", u.user.id).gte("score", 75);
    return {
      saved: savedCount ?? 0,
      applied: appliedCount ?? 0,
      matches: matchCount ?? 0,
      recentJobs: (recentJobs ?? []) as Job[],
      name: profile?.full_name ?? "there",
    };
  },
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(statsQuery()),
  component: DashboardPage,
});

function StatCard({ label, value, icon: Icon, tint }: any) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-5">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30 blur-3xl" style={{ background: tint }} />
      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-4xl font-black">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { data } = useSuspenseQuery(statsQuery());
  return (
    <div className="space-y-8">
      <header className="animate-pop-in">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Dashboard</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">
          Hey <span className="text-gradient">{data.name.split(" ")[0]}</span>, let's find your next role.
        </h1>
        <p className="mt-2 text-muted-foreground">Here's what's happening across your search.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saved jobs" value={data.saved} icon={Bookmark} tint="oklch(0.65 0.2 275)" />
        <StatCard label="Applications" value={data.applied} icon={Send} tint="oklch(0.78 0.14 210)" />
        <StatCard label="High matches" value={data.matches} icon={Sparkles} tint="oklch(0.72 0.17 155)" />
        <StatCard label="Active pipelines" value={data.applied + data.saved} icon={TrendingUp} tint="oklch(0.82 0.15 85)" />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Fresh for you</h2>
          <Link to="/jobs" className="text-sm text-muted-foreground hover:text-foreground">Browse all →</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.recentJobs.map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      </section>
    </div>
  );
}
