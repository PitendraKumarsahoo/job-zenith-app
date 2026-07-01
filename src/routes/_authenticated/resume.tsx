import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { analyzeResume } from "@/lib/ai.functions";
import { toast } from "sonner";
import { FileText, Upload, Sparkles, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resume")({
  component: ResumePage,
});

function ResumePage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: resume } = useQuery({
    queryKey: ["active-resume"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("resumes").select("*").eq("user_id", u.user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (data) setText(data.parsed_text ?? "");
      return data;
    },
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const path = `${u.user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, file);
      if (upErr) throw upErr;
      // Best-effort: read text for txt files; PDFs stay as text via user paste
      let parsed = text;
      if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        parsed = await file.text();
        setText(parsed);
      }
      await supabase.from("resumes").update({ is_active: false }).eq("user_id", u.user.id);
      const { error } = await supabase.from("resumes").insert({
        user_id: u.user.id, file_path: path, file_name: file.name, parsed_text: parsed, is_active: true,
      });
      if (error) throw error;
      toast.success("Resume uploaded");
      qc.invalidateQueries({ queryKey: ["active-resume"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  const saveTextMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      if (resume) {
        const { error } = await supabase.from("resumes").update({ parsed_text: text }).eq("id", resume.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("resumes").insert({
          user_id: u.user.id, file_path: "text-only", file_name: "resume.txt", parsed_text: text, is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["active-resume"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const analyzeFn = useServerFn(analyzeResume);
  const analyzeMut = useMutation({
    mutationFn: async () => {
      if (!resume) throw new Error("Save your resume text first");
      return analyzeFn({ data: { resumeId: resume.id } });
    },
    onSuccess: () => { toast.success("Analysis complete"); qc.invalidateQueries({ queryKey: ["active-resume"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const analysis = resume?.ai_analysis as any;

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Resume</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Your resume</h1>
        <p className="mt-2 text-muted-foreground">Upload a file or paste your resume text — we'll use it to score matches.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="glass space-y-4 rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" hidden accept=".pdf,.txt,.md,.docx" onChange={onFile} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-gradient-primary text-primary-foreground shadow-glow">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload file
            </Button>
            {resume && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" /> {resume.file_name}
              </span>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Resume text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={16}
              placeholder="Paste your resume text here (works with any format)…"
              className="w-full rounded-xl border border-border bg-input p-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => saveTextMut.mutate()} disabled={saveTextMut.isPending || !text.trim()}>
                Save
              </Button>
              <Button onClick={() => analyzeMut.mutate()} disabled={analyzeMut.isPending || !resume?.parsed_text} className="bg-gradient-primary text-primary-foreground shadow-glow">
                {analyzeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Analyze with AI
              </Button>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">AI analysis</h2>
          </div>
          {!analysis ? (
            <p className="text-sm text-muted-foreground">Save your resume, then click Analyze to get an AI review.</p>
          ) : (
            <div className="space-y-5">
              {typeof analysis.overall_score === "number" && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Overall score</div>
                  <div className="mt-1 text-5xl font-black text-gradient">{analysis.overall_score}<span className="text-xl text-muted-foreground">/100</span></div>
                </div>
              )}
              {analysis.summary && <p className="text-sm text-muted-foreground">{analysis.summary}</p>}
              {Array.isArray(analysis.strengths) && analysis.strengths.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-success">Strengths</div>
                  <ul className="space-y-1.5 text-sm">
                    {analysis.strengths.map((s: string, i: number) => <li key={i} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" />{s}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(analysis.gaps) && analysis.gaps.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-warning">Gaps to fill</div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {analysis.gaps.map((s: string, i: number) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(analysis.suggested_roles) && analysis.suggested_roles.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Suggested roles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.suggested_roles.map((r: string) => <span key={r} className="rounded-md bg-muted px-2 py-1 text-xs">{r}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
