import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNotifications, resendNotification, triggerJobAgent } from "@/lib/job-agent.functions";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, XCircle, MinusCircle, Bell, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

type Row = {
  id: string;
  kind: "match" | "status_change" | "test" | "manual";
  status: "sent" | "failed" | "skipped";
  attempts: number;
  last_error: string | null;
  message: string;
  chat_id_masked: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
  job_id: string | null;
  applied_id: string | null;
};

function NotificationsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotifications);
  const resendFn = useServerFn(resendNotification);
  const triggerFn = useServerFn(triggerJobAgent);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["telegram-notifications"],
    queryFn: () => listFn() as Promise<Row[]>,
  });

  const resendMut = useMutation({
    mutationFn: (id: string) => resendFn({ data: { notificationId: id } }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Notification resent");
      else toast.error(r?.error ?? "Resend failed");
      qc.invalidateQueries({ queryKey: ["telegram-notifications"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Resend failed"),
  });

  const triggerMut = useMutation({
    mutationFn: () => triggerFn({ data: { query: "developer" } }),
    onSuccess: (r: any) => {
      toast.success(
        `Agent ran — ${r.notified} match sent, ${r.errors} failed, ${r.fetched} fetched`,
      );
      qc.invalidateQueries({ queryKey: ["telegram-notifications"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Agent run failed"),
  });

  const stats = {
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Audit trail</div>
          <h1 className="mt-1 text-4xl font-black tracking-tight">Notifications</h1>
          <p className="mt-2 text-muted-foreground">
            Every Telegram invite, status change and match alert, with delivery result and retry.
          </p>
        </div>
        <button
          onClick={() => triggerMut.mutate()}
          disabled={triggerMut.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-60"
        >
          <PlayCircle className={cn("h-4 w-4", triggerMut.isPending && "animate-spin")} />
          {triggerMut.isPending ? "Running agent…" : "Run agent now"}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Sent" value={stats.sent} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Failed" value={stats.failed} tone="destructive" icon={<XCircle className="h-4 w-4" />} />
        <StatCard label="Skipped" value={stats.skipped} tone="muted" icon={<MinusCircle className="h-4 w-4" />} />
      </div>

      <div className="glass rounded-2xl">
        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <Bell className="mx-auto mb-2 h-6 w-6 opacity-50" />
            No notifications yet. Connect Telegram in Settings and drag a job on the Applied board, or run the agent.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <StatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                        {r.kind.replace("_", " ")}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-medium",
                          r.status === "sent" && "bg-success/15 text-success",
                          r.status === "failed" && "bg-destructive/15 text-destructive",
                          r.status === "skipped" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.status}
                      </span>
                      <span className="text-muted-foreground">
                        {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
                      </span>
                      {r.chat_id_masked && (
                        <span className="text-muted-foreground">→ {r.chat_id_masked}</span>
                      )}
                      <span className="ml-auto text-muted-foreground">{timeAgo(r.created_at)}</span>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-card/60 p-3 text-xs text-foreground/90">
                      {r.message}
                    </pre>
                    {r.last_error && (
                      <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                        <span className="font-semibold">Last error:</span> {r.last_error}
                      </div>
                    )}
                    {r.status !== "sent" && (
                      <div className="mt-3">
                        <button
                          onClick={() => resendMut.mutate(r.id)}
                          disabled={resendMut.isPending}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium hover:bg-card disabled:opacity-60"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", resendMut.isPending && "animate-spin")} />
                          Resend notification
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "success" | "destructive" | "muted";
  icon: React.ReactNode;
}) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-4">
      <div
        className={cn(
          "grid h-9 w-9 place-items-center rounded-xl",
          tone === "success" && "bg-success/15 text-success",
          tone === "destructive" && "bg-destructive/15 text-destructive",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Row["status"] }) {
  if (status === "sent") return <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success" />;
  if (status === "failed") return <XCircle className="mt-1 h-5 w-5 shrink-0 text-destructive" />;
  return <MinusCircle className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />;
}
