import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Target, Bookmark, Bell, Zap, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Feature({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="glass group rounded-2xl p-6 transition hover:-translate-y-1 hover:shadow-glow">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="relative min-h-screen">
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">JobPilot</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/auth" className="rounded-md bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow">
            Get started
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-16 pb-24 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            AI resume analyzer + job match scoring
          </div>
          <h1 className="mx-auto max-w-3xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Land your next role with a <span className="text-gradient">co-pilot</span> that actually helps.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Search curated jobs, save favorites, track applications, and score every listing against your resume — with Telegram alerts when new matches drop.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="rounded-xl bg-gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-0.5">
              Start free — takes 30 seconds
            </Link>
            <Link to="/auth" className="rounded-xl border border-border bg-card/40 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:bg-card/60">
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature icon={Sparkles} title="AI Resume Analyzer" desc="Get instant feedback on strengths, gaps, and impact you can add to every bullet." />
          <Feature icon={Target} title="Job Match Score" desc="Every job scored 0–100 against your resume with clear reasoning you can act on." />
          <Feature icon={Bookmark} title="Bookmark & Track" desc="Save jobs and track application status from Applied to Offer without spreadsheets." />
          <Feature icon={Bell} title="Telegram Alerts" desc="Get pinged the moment high-match jobs land in your feed." />
          <Feature icon={Zap} title="Powerful Filters" desc="Role, location, salary, experience, and Remote/Hybrid/Onsite." />
          <Feature icon={ShieldCheck} title="Private by Default" desc="Your resume and history are yours — encrypted at rest, RLS-scoped." />
        </section>
      </main>
    </div>
  );
}
