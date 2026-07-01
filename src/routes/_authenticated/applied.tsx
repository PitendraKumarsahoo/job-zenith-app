import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

type Status = "applied" | "interview" | "offer" | "rejected" | "withdrawn";
const STATUSES: Status[] = ["applied", "interview", "offer", "rejected", "withdrawn"];

export const Route = createFileRoute("/_authenticated/applied")({
  component: AppliedPage,
});

function AppliedPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["applied-jobs"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("applied_jobs")
        .select("id, status, applied_at, job:jobs(id,title,company,company_logo,location)")
        .eq("user_id", u.user.id)
        .order("applied_at", { ascending: false });
      return data ?? [];
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("applied_jobs").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applied-jobs"] });
      toast.success("Status updated");
    },
  });

  const grouped = STATUSES.map((s) => ({ status: s, items: rows.filter((r: any) => r.status === s) }));

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Applications</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Your pipeline</h1>
        <p className="mt-2 text-muted-foreground">Track everything you've applied to.</p>
      </header>

      {isLoading ? (
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">No applications yet.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          {grouped.map(({ status, items }) => (
            <div key={status} className="glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize">{status}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-border bg-card/40 p-3">
                    <div className="flex items-center gap-2">
                      {r.job?.company_logo && (
                        <img src={r.job.company_logo} alt="" className="h-6 w-6 rounded object-contain" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.job?.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.job?.company}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{timeAgo(r.applied_at)}</div>
                    <Select value={r.status} onValueChange={(v) => updateMut.mutate({ id: r.id, status: v as Status })}>
                      <SelectTrigger className="mt-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {items.length === 0 && <div className="text-center text-xs text-muted-foreground">Empty</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
