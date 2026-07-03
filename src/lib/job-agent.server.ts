// Server-only background job agent. Ingests external listings, scores them per
// user preferences, and sends Telegram notifications for high-scoring matches.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllSources, type NormalizedJob } from "./job-sources.server";
import { sendAndLog, escapeHtml } from "./telegram-log.server";

type UserProfile = {
  user_id: string;
  preferred_roles: string[];
  preferred_locations: string[];
  notify_new_matches: boolean;
  skills: string[]; // from most-recent resume
  min_salary: number | null;
  experience: string | null; // 'mid' / 'senior' ...
};

async function loadTargetUsers(): Promise<UserProfile[]> {
  // Only users with Telegram connected AND notify_new_matches enabled.
  const { data: creds } = await supabaseAdmin
    .from("user_telegram_credentials")
    .select("user_id");
  const userIds = (creds ?? []).map((c: any) => c.user_id);
  if (userIds.length === 0) return [];

  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, preferred_roles, preferred_locations, notify_new_matches")
    .in("user_id", userIds);

  const settingsById = new Map<string, any>();
  for (const s of settings ?? []) settingsById.set((s as any).user_id, s);

  const { data: resumes } = await supabaseAdmin
    .from("resumes")
    .select("user_id, ai_analysis, is_active")
    .in("user_id", userIds)
    .eq("is_active", true);
  const resumeById = new Map<string, any>();
  for (const r of resumes ?? []) resumeById.set((r as any).user_id, r);

  return userIds.map((uid) => {
    const s = settingsById.get(uid) ?? {};
    const r = resumeById.get(uid);
    const analysis = (r?.ai_analysis ?? {}) as any;
    const skills: string[] = Array.isArray(analysis.skills)
      ? analysis.skills.map((x: any) => String(x).toLowerCase())
      : [];
    const min_salary: number | null =
      typeof analysis.min_salary === "number" ? analysis.min_salary : null;
    const experience: string | null =
      typeof analysis.experience_level === "string" ? analysis.experience_level : null;
    return {
      user_id: uid,
      preferred_roles: (s.preferred_roles ?? []) as string[],
      preferred_locations: (s.preferred_locations ?? []) as string[],
      notify_new_matches: s.notify_new_matches !== false,
      skills,
      min_salary,
      experience,
    };
  }).filter((u) => u.notify_new_matches);
}

const EXP_ORDER = ["intern", "entry", "mid", "senior", "lead", "executive"];

/**
 * Weighted heuristic score 0-100 (skills 55 / location 15 / experience 15 / salary 10 / role 5).
 * Deterministic + bias-free (no name/gender/age inputs).
 */
export function scoreJobForUser(job: NormalizedJob, user: UserProfile): number {
  let score = 0;

  // Skills overlap (up to 55)
  if (user.skills.length > 0 && job.skills.length > 0) {
    const jobSkills = job.skills.map((s) => s.toLowerCase());
    const hit = user.skills.filter((s) => jobSkills.includes(s)).length;
    const overlap = hit / Math.max(1, user.skills.length);
    score += Math.min(55, Math.round(overlap * 70));
  } else {
    score += 20; // small default when we have no signal
  }

  // Location (15)
  if (user.preferred_locations.length === 0) {
    score += 10;
  } else {
    const loc = job.location.toLowerCase();
    const remoteWanted = user.preferred_locations.some((l) => /remote/i.test(l));
    if (job.work_mode === "remote" && remoteWanted) score += 15;
    else if (user.preferred_locations.some((l) => l && loc.includes(l.toLowerCase()))) score += 15;
    else if (job.work_mode === "remote") score += 8;
  }

  // Experience (15)
  if (user.experience) {
    const ui = EXP_ORDER.indexOf(user.experience);
    const ji = EXP_ORDER.indexOf(job.experience_level);
    if (ui >= 0 && ji >= 0) {
      const diff = Math.abs(ui - ji);
      score += diff === 0 ? 15 : diff === 1 ? 9 : 3;
    } else score += 8;
  } else score += 8;

  // Salary (10)
  if (user.min_salary && job.salary_max) {
    if (job.salary_max >= user.min_salary) score += 10;
    else if (job.salary_max >= user.min_salary * 0.8) score += 5;
  } else {
    score += 5;
  }

  // Preferred role match (5)
  if (user.preferred_roles.length === 0) {
    score += 3;
  } else {
    const t = job.title.toLowerCase();
    if (user.preferred_roles.some((r) => r && t.includes(r.toLowerCase()))) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

/** Upsert a fetched job into public.jobs; returns the internal job UUID. */
async function upsertJob(job: NormalizedJob): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .upsert(
      {
        source: job.source,
        external_id: job.external_id,
        title: job.title,
        company: job.company,
        company_logo: job.company_logo,
        location: job.location,
        role: job.role,
        description: job.description,
        skills: job.skills,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        currency: job.currency,
        work_mode: job.work_mode,
        experience_level: job.experience_level as any,
        apply_url: job.apply_url,
        posted_at: job.posted_at,
      },
      { onConflict: "source,external_id" },
    )
    .select("id")
    .single();
  if (error) {
    console.error("[job-agent] upsert failed", error.message);
    return null;
  }
  return (data as any)?.id ?? null;
}

export type AgentRunSummary = {
  fetched: number;
  ingested: number;
  usersScanned: number;
  notified: number;
  errors: number;
};

/** Full agent tick: fetch, ingest, score for each user, notify high matches. */
export async function runJobAgent(query = "developer"): Promise<AgentRunSummary> {
  const summary: AgentRunSummary = {
    fetched: 0,
    ingested: 0,
    usersScanned: 0,
    notified: 0,
    errors: 0,
  };

  const users = await loadTargetUsers();
  summary.usersScanned = users.length;
  if (users.length === 0) return summary;

  const jobs = await fetchAllSources(query);
  summary.fetched = jobs.length;

  // Ingest all jobs; keep a map external->uuid + job data for scoring.
  const idByJob = new Map<NormalizedJob, string>();
  for (const j of jobs) {
    const id = await upsertJob(j);
    if (id) {
      idByJob.set(j, id);
      summary.ingested++;
    }
  }

  const MATCH_THRESHOLD = 80;

  for (const user of users) {
    // Load already-notified job ids for this user to dedupe.
    const { data: alreadyRows } = await supabaseAdmin
      .from("notified_jobs")
      .select("job_id")
      .eq("user_id", user.user_id);
    const already = new Set<string>((alreadyRows ?? []).map((r: any) => r.job_id));

    for (const [job, jobId] of idByJob.entries()) {
      if (already.has(jobId)) continue;
      const score = scoreJobForUser(job, user);
      if (score < MATCH_THRESHOLD) continue;

      const message =
        `🎯 <b>New match — ${score}%</b>\n` +
        `<b>${escapeHtml(job.title)}</b> at ${escapeHtml(job.company)}\n` +
        `📍 ${escapeHtml(job.location)} • ${job.work_mode}\n` +
        (job.salary_min || job.salary_max
          ? `💰 ${job.salary_min ?? "?"}–${job.salary_max ?? "?"} ${job.currency}\n`
          : "") +
        (job.apply_url ? `${job.apply_url}` : "");

      // Insert dedupe row FIRST (unique PK). If it fails, another concurrent
      // tick already notified this pair — skip.
      const { error: dedupeErr } = await supabaseAdmin
        .from("notified_jobs")
        .insert({ user_id: user.user_id, job_id: jobId, score });
      if (dedupeErr) continue;

      try {
        const { result } = await sendAndLog(user.user_id, message, {
          kind: "match",
          job_id: jobId,
          metadata: { score, source: job.source },
        });
        if (result.ok) summary.notified++;
        else summary.errors++;
      } catch (e) {
        summary.errors++;
        console.error("[job-agent] send failed", e);
      }
    }
  }

  return summary;
}
