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
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
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

// -------- Resume Analyzer --------
export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resumeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: r } = await supabase.from("resumes").select("*").eq("id", data.resumeId).eq("user_id", userId).single();
    if (!r?.parsed_text) throw new Error("Resume has no extracted text yet.");

    const result = await chatJSON(
      "You are an expert technical recruiter and career coach. Return strict JSON only.",
      `Analyze this resume and return JSON with keys:
- overall_score (0-100 integer)
- strengths (array of 3-5 short strings)
- gaps (array of 3-5 short strings)
- suggested_roles (array of 3-5 role names)
- key_skills (array of skills detected)
- summary (2-3 sentence professional summary)

Resume:
"""${r.parsed_text.slice(0, 8000)}"""`
    );

    await supabase.from("resumes").update({ ai_analysis: result }).eq("id", data.resumeId);
    return result;
  });

// -------- Job Match Score --------
export const scoreJobMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: existing }, { data: job }, { data: resume }] = await Promise.all([
      supabase.from("job_match_scores").select("*").eq("user_id", userId).eq("job_id", data.jobId).maybeSingle(),
      supabase.from("jobs").select("*").eq("id", data.jobId).single(),
      supabase.from("resumes").select("parsed_text").eq("user_id", userId).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (existing) return existing;
    if (!job) throw new Error("Job not found");
    if (!resume?.parsed_text) throw new Error("Upload a resume first to compute match scores.");

    const result = await chatJSON(
      "You score resume-to-job fit. Return strict JSON only.",
      `Score how well this resume matches the job. Return JSON with:
- score (0-100 integer)
- strengths (array of 2-4 short strings — what aligns)
- gaps (array of 2-4 short strings — what is missing)
- summary (1-2 sentences)

JOB:
Title: ${job.title}
Company: ${job.company}
Role: ${job.role}
Experience: ${job.experience_level}
Skills: ${(job.skills || []).join(", ")}
Description: ${(job.description || "").slice(0, 2000)}

RESUME:
"""${resume.parsed_text.slice(0, 6000)}"""`
    );

    const row = {
      user_id: userId,
      job_id: data.jobId,
      score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
      strengths: Array.isArray(result.strengths) ? result.strengths.slice(0, 6) : [],
      gaps: Array.isArray(result.gaps) ? result.gaps.slice(0, 6) : [],
      summary: typeof result.summary === "string" ? result.summary : null,
    };
    await supabase.from("job_match_scores").upsert(row);
    return row;
  });
