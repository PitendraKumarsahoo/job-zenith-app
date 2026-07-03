// Server-only fetchers for external job listings.
// Each source returns a normalized `NormalizedJob[]` and skips itself gracefully
// when its API credentials aren't configured.

export type WorkMode = "remote" | "hybrid" | "onsite";
export type ExpLevel = "intern" | "entry" | "mid" | "senior" | "lead" | "executive";

export type NormalizedJob = {
  source: "adzuna" | "jooble" | "remoteok" | "remotive";
  external_id: string;
  title: string;
  company: string;
  company_logo: string | null;
  location: string;
  role: string;
  description: string;
  skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  work_mode: WorkMode;
  experience_level: ExpLevel;
  apply_url: string | null;
  posted_at: string; // ISO
};

const COMMON_SKILL_VOCAB = [
  "javascript","typescript","react","vue","angular","svelte","next.js","node.js","express","nest.js",
  "python","django","flask","fastapi","java","spring","kotlin","scala","go","rust","c++","c#",".net",
  "ruby","rails","php","laravel","sql","postgres","mysql","mongodb","redis","graphql","rest","grpc",
  "aws","gcp","azure","docker","kubernetes","terraform","ansible","kafka","spark","airflow","dbt",
  "tailwind","css","html","figma","tensorflow","pytorch","llm","langchain","openai","supabase",
  "ci/cd","git","linux","microservices","devops","seo","product","design","ux","ui",
];

function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const s of COMMON_SKILL_VOCAB) {
    const needle = s.toLowerCase();
    // word-boundary-ish match; keep it lenient
    if (lower.includes(needle)) out.add(s);
  }
  return Array.from(out).slice(0, 20);
}

function inferWorkMode(text: string, location: string): WorkMode {
  const t = (text + " " + location).toLowerCase();
  if (/\bremote\b|\banywhere\b|work from home|wfh/.test(t)) return "remote";
  if (/hybrid/.test(t)) return "hybrid";
  return "onsite";
}

function inferExperience(title: string, description: string): ExpLevel {
  const t = (title + " " + description).toLowerCase();
  if (/\b(intern|internship)\b/.test(t)) return "intern";
  if (/\b(principal|staff|vp|head of|chief|director)\b/.test(t)) return "executive";
  if (/\b(lead|architect)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?|snr)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|entry|graduate|associate)\b/.test(t)) return "entry";
  return "mid";
}

function normalizeRole(title: string): string {
  return title.replace(/[^a-zA-Z0-9+.#/ ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// -------------------- Adzuna --------------------
export async function fetchAdzuna(query = "developer", pages = 1): Promise<NormalizedJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const results: NormalizedJob[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/${page}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("what", query);
    url.searchParams.set("results_per_page", "25");
    url.searchParams.set("content-type", "application/json");
    try {
      const res = await fetch(url.toString());
      if (!res.ok) break;
      const j: any = await res.json();
      for (const r of j.results ?? []) {
        const desc = stripHtml(r.description ?? "");
        const title: string = r.title ?? "";
        results.push({
          source: "adzuna",
          external_id: String(r.id),
          title,
          company: r.company?.display_name ?? "Unknown",
          company_logo: null,
          location: r.location?.display_name ?? "",
          role: normalizeRole(title),
          description: desc,
          skills: extractSkills(title + " " + desc),
          salary_min: r.salary_min ? Math.round(r.salary_min) : null,
          salary_max: r.salary_max ? Math.round(r.salary_max) : null,
          currency: "USD",
          work_mode: inferWorkMode(desc, r.location?.display_name ?? ""),
          experience_level: inferExperience(title, desc),
          apply_url: r.redirect_url ?? null,
          posted_at: r.created ?? new Date().toISOString(),
        });
      }
    } catch {
      break;
    }
  }
  return results;
}

// -------------------- Jooble --------------------
export async function fetchJooble(query = "developer"): Promise<NormalizedJob[]> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`https://jooble.org/api/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: query, page: 1 }),
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j.jobs ?? []).map((r: any): NormalizedJob => {
      const desc = stripHtml(r.snippet ?? "");
      const title: string = r.title ?? "";
      // Jooble salary comes as free-form text; keep null.
      return {
        source: "jooble",
        external_id: String(r.id ?? r.link),
        title,
        company: r.company ?? "Unknown",
        company_logo: null,
        location: r.location ?? "",
        role: normalizeRole(title),
        description: desc,
        skills: extractSkills(title + " " + desc),
        salary_min: null,
        salary_max: null,
        currency: "USD",
        work_mode: inferWorkMode(desc, r.location ?? ""),
        experience_level: inferExperience(title, desc),
        apply_url: r.link ?? null,
        posted_at: r.updated ?? new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

// -------------------- RemoteOK --------------------
export async function fetchRemoteOK(): Promise<NormalizedJob[]> {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "JobPilot/1.0 (job-agent)" },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (Array.isArray(j) ? j : [])
      .filter((r: any) => r && r.id && r.position)
      .slice(0, 100)
      .map((r: any): NormalizedJob => {
        const desc = stripHtml(r.description ?? "");
        const title: string = r.position ?? "";
        return {
          source: "remoteok",
          external_id: String(r.id),
          title,
          company: r.company ?? "Unknown",
          company_logo: r.company_logo ?? r.logo ?? null,
          location: r.location || "Remote",
          role: normalizeRole(title),
          description: desc,
          skills: Array.isArray(r.tags) && r.tags.length
            ? r.tags.slice(0, 20).map((t: any) => String(t))
            : extractSkills(title + " " + desc),
          salary_min: r.salary_min ?? null,
          salary_max: r.salary_max ?? null,
          currency: "USD",
          work_mode: "remote",
          experience_level: inferExperience(title, desc),
          apply_url: r.url ?? r.apply_url ?? null,
          posted_at: r.date ?? new Date().toISOString(),
        };
      });
  } catch {
    return [];
  }
}

// -------------------- Remotive --------------------
export async function fetchRemotive(): Promise<NormalizedJob[]> {
  try {
    const res = await fetch("https://remotive.com/api/remote-jobs?limit=50");
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j.jobs ?? []).map((r: any): NormalizedJob => {
      const desc = stripHtml(r.description ?? "");
      const title: string = r.title ?? "";
      const [minStr, maxStr] = String(r.salary ?? "").match(/\d[\d,]*/g) ?? [];
      const parseNum = (s?: string) => (s ? Number(s.replace(/,/g, "")) : null);
      return {
        source: "remotive",
        external_id: String(r.id),
        title,
        company: r.company_name ?? "Unknown",
        company_logo: r.company_logo ?? r.company_logo_url ?? null,
        location: r.candidate_required_location || "Remote",
        role: normalizeRole(title),
        description: desc,
        skills: extractSkills(title + " " + desc + " " + (Array.isArray(r.tags) ? r.tags.join(" ") : "")),
        salary_min: parseNum(minStr),
        salary_max: parseNum(maxStr),
        currency: "USD",
        work_mode: "remote",
        experience_level: inferExperience(title, desc),
        apply_url: r.url ?? null,
        posted_at: r.publication_date ?? new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export async function fetchAllSources(query = "developer"): Promise<NormalizedJob[]> {
  const [a, j, r, rv] = await Promise.all([
    fetchAdzuna(query).catch(() => []),
    fetchJooble(query).catch(() => []),
    fetchRemoteOK().catch(() => []),
    fetchRemotive().catch(() => []),
  ]);
  return [...a, ...j, ...r, ...rv];
}
