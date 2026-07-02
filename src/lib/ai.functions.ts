import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function chatJSON(system: string, user: string): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return {}; }
}

// Strip signals that shouldn't influence scoring: names, emails, phones, addresses,
// gender pronouns, age/DOB, photo mentions, marital status, nationality, religion.
function redactPII(text: string): string {
  let t = text;
  // emails
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/gi, "[email]");
  // phones (loose)
  t = t.replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[phone]");
  // URLs
  t = t.replace(/https?:\/\/\S+/gi, "[url]");
  // Dates of birth / age
  t = t.replace(/\b(date of birth|dob|d\.o\.b\.?|born on|age)\s*[:\-]?\s*[^\n]{1,30}/gi, "[age-redacted]");
  t = t.replace(/\b\d{1,2}\s*(years?\s*old|yrs?\s*old)\b/gi, "[age-redacted]");
  // Gender / marital / nationality / religion lines
  t = t.replace(/\b(gender|sex|marital status|nationality|religion)\s*[:\-]\s*[^\n]{1,40}/gi, "[demographic-redacted]");
  // Pronouns line (some resumes list "Pronouns: she/her")
  t = t.replace(/\bpronouns?\s*[:\-]\s*[^\n]{1,20}/gi, "[demographic-redacted]");
  // Photo/picture
  t = t.replace(/\b(photo|picture|profile picture|headshot)\b[^\n]{0,40}/gi, "[photo-redacted]");
  // Naive header name line (first non-empty line if it looks like "Firstname Lastname")
  const lines = t.split("\n");
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    const l = lines[i].trim();
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z'’-]+){1,3}$/.test(l)) {
      lines[i] = "[name-redacted]";
      break;
    }
  }
  return lines.join("\n");
}

// -------- Resume Analyzer --------
export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resumeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: r } = await supabase.from("resumes").select("*").eq("id", data.resumeId).eq("user_id", userId).single();
    if (!r?.parsed_text) throw new Error("Resume has no extracted text yet.");

    const cleaned = redactPII(r.parsed_text).slice(0, 8000);

    const result = await chatJSON(
      "You are a senior technical recruiter and career coach. Return STRICT JSON only. Be specific, concrete, and actionable. Never comment on demographics, name, age, gender, nationality, or appearance — the input is intentionally redacted.",
      `Analyze this resume and return JSON with EXACTLY these keys:

- overall_score (integer 0-100 — reflect clarity, impact, quantified results, ATS-friendliness)
- summary (2-3 sentence professional positioning statement)
- strengths (array of 3-5 specific strengths, each mentioning evidence from the resume)
- gaps (array of 3-5 specific gaps or weaknesses)
- rewrite_suggestions (array of 3-6 objects: { "original": "existing bullet or section (short quote)", "improved": "stronger rewrite using action verb + metric + outcome" })
- ats_keywords_to_add (array of 5-10 concrete keywords/skills likely missing that would improve ATS matching for their target roles)
- suggested_roles (array of 3-6 objects: { "role": "Job title", "why": "one sentence reason it fits", "fit_score": integer 0-100 } sorted by fit_score desc)
- key_skills (array of skills detected in the resume)
- red_flags (array of 0-3 short strings — gaps, unexplained breaks, vague claims — empty if none)

RESUME (PII redacted):
"""${cleaned}"""`
    );

    await supabase.from("resumes").update({ ai_analysis: result }).eq("id", data.resumeId);
    return result;
  });

// -------- Job Match Score --------
export const scoreJobMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), force: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: existing }, { data: job }, { data: resume }, { data: feedback }] = await Promise.all([
      supabase.from("job_match_scores").select("*").eq("user_id", userId).eq("job_id", data.jobId).maybeSingle(),
      supabase.from("jobs").select("*").eq("id", data.jobId).single(),
      supabase.from("resumes").select("parsed_text").eq("user_id", userId).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("job_match_scores").select("feedback, feedback_note, score").eq("user_id", userId).not("feedback", "is", null).order("created_at", { ascending: false }).limit(20),
    ]);
    if (existing && !data.force) return existing;
    if (!job) throw new Error("Job not found");
    if (!resume?.parsed_text) throw new Error("Upload a resume first to compute match scores.");

    // Calibration hint from prior feedback: average signal (-1..+1)
    const fbList = feedback ?? [];
    let calibrationHint = "";
    if (fbList.length >= 3) {
      const avg = fbList.reduce((s: number, f: any) => s + (f.feedback ?? 0), 0) / fbList.length;
      const notes = fbList.filter((f: any) => f.feedback_note).slice(0, 5).map((f: any) => `- (${f.feedback > 0 ? "good" : "bad"}) ${f.feedback_note}`).join("\n");
      if (avg <= -0.3) calibrationHint = `\nCALIBRATION: The user has marked recent scores as too high. Be MORE strict — weight missing hard requirements heavily.`;
      else if (avg >= 0.3) calibrationHint = `\nCALIBRATION: The user has marked recent scores as too low. Give credit for transferable skills and adjacent experience.`;
      if (notes) calibrationHint += `\nUser feedback notes:\n${notes}`;
    }

    const cleaned = redactPII(resume.parsed_text).slice(0, 6000);

    const result = await chatJSON(
      `You score resume-to-job fit fairly and consistently. Return STRICT JSON only.
BIAS RULES: Ignore name, gender, age, nationality, school prestige, employment gaps < 12 months, and career changes. Score on skills, experience level, responsibilities, and measurable outcomes only. The resume text has PII already redacted — do not infer or comment on it.`,
      `Score how well this resume matches the job. Return JSON with:
- score (integer 0-100)
- strengths (array of 2-4 short strings — what aligns, quote resume evidence where possible)
- gaps (array of 2-4 short strings — what is missing vs job requirements)
- summary (1-2 sentences explaining the score)

JOB:
Title: ${job.title}
Company: ${job.company}
Role: ${job.role}
Experience required: ${job.experience_level}
Skills required: ${(job.skills || []).join(", ")}
Description: ${(job.description || "").slice(0, 2000)}

RESUME (PII redacted):
"""${cleaned}"""${calibrationHint}`
    );

    const row = {
      user_id: userId,
      job_id: data.jobId,
      score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
      strengths: Array.isArray(result.strengths) ? result.strengths.slice(0, 6) : [],
      gaps: Array.isArray(result.gaps) ? result.gaps.slice(0, 6) : [],
      summary: typeof result.summary === "string" ? result.summary : null,
    };
    await supabase.from("job_match_scores").upsert(row, { onConflict: "user_id,job_id" });
    return row;
  });

// -------- Match feedback (thumbs up/down) --------
export const submitMatchFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    jobId: z.string().uuid(),
    feedback: z.number().int().min(-1).max(1),
    note: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("job_match_scores")
      .update({ feedback: data.feedback, feedback_note: data.note ?? null })
      .eq("user_id", userId)
      .eq("job_id", data.jobId);
    if (error) throw error;
    return { ok: true };
  });
