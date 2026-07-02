import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { notifyStatusChange } from "@/lib/telegram.functions";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "applied" | "interview" | "offer" | "rejected" | "withdrawn";
const STATUSES: Status[] = ["applied", "interview", "offer", "rejected", "withdrawn"];

const STATUS_ACCENT: Record<Status, string> = {
  applied: "border-primary/40",
  interview: "border-accent/40",
  offer: "border-success/40",
  rejected: "border-destructive/40",
  withdrawn: "border-muted-foreground/30",
};

export const Route = createFileRoute("/_authenticated/applied")({
  component: AppliedPage,
});

type Row = {
  id: string;
  status: Status;
  applied_at: string;
  job: { id: string; title: string; company: string; company_logo: string | null; location: string } | null;
};

function AppliedPage() {
  const qc = useQueryClient();
  const notifyFn = useServerFn(notifyStatusChange);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["applied-jobs"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("applied_jobs")
        .select("id, status, applied_at, job:jobs(id,title,company,company_logo,location)")
        .eq("user_id", u.user.id)
        .order("applied_at", { ascending: false });
      return (data ?? []) as unknown as Row[];
    },
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRow = useMemo(() => rows.find((r) => r.id === activeId) ?? null, [rows, activeId]);

  const updateMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("applied_jobs").update({ status }).eq("id", id);
      if (error) throw error;
      // fire-and-forget telegram; don't block or fail UI
      notifyFn({ data: { appliedId: id, newStatus: status } }).catch(() => {});
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["applied-jobs"] });
      const prev = qc.getQueryData<Row[]>(["applied-jobs"]);
      qc.setQueryData<Row[]>(["applied-jobs"], (old) =>
        (old ?? []).map((r) => (r.id === id ? { ...r, status } : r)),
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      qc.setQueryData(["applied-jobs"], ctx?.prev);
      toast.error(e.message);
    },
    onSuccess: (_d, v) => {
      toast.success(`Moved to ${v.status}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["applied-jobs"] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const rowId = String(e.active.id);
    const overId = e.over?.id;
    if (!overId) return;
    const newStatus = String(overId) as Status;
    if (!STATUSES.includes(newStatus)) return;
    const row = rows.find((r) => r.id === rowId);
    if (!row || row.status === newStatus) return;
    updateMut.mutate({ id: rowId, status: newStatus });
  }

  const grouped = STATUSES.map((s) => ({ status: s, items: rows.filter((r) => r.status === s) }));

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Applications</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Your pipeline</h1>
        <p className="mt-2 text-muted-foreground">Drag cards between columns to update status. Telegram notifies you automatically.</p>
      </header>

      {isLoading ? (
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">No applications yet.</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="grid gap-4 lg:grid-cols-5">
            {grouped.map(({ status, items }) => (
              <Column key={status} status={status} count={items.length}>
                {items.map((r) => (
                  <KanbanCard key={r.id} row={r} isDragging={activeId === r.id} />
                ))}
                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                    Drop here
                  </div>
                )}
              </Column>
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 180 }}>
            {activeRow ? <KanbanCard row={activeRow} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({ status, count, children }: { status: Status; count: number; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "glass rounded-2xl p-4 transition",
        STATUS_ACCENT[status],
        isOver && "ring-2 ring-primary/60 bg-primary/5",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{status}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{count}</span>
      </div>
      <div className="space-y-2 min-h-[60px]">{children}</div>
    </div>
  );
}

function KanbanCard({ row, isDragging, isOverlay }: { row: Row; isDragging?: boolean; isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: row.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border border-border bg-card/60 p-3 shadow-sm transition",
        isDragging && !isOverlay && "opacity-30",
        isOverlay && "shadow-glow rotate-1 scale-105 border-primary/60 bg-card",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab touch-none text-muted-foreground opacity-40 hover:opacity-100 active:cursor-grabbing"
          aria-label="Drag"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {row.job?.company_logo && (
          <img src={row.job.company_logo} alt="" className="h-6 w-6 rounded object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{row.job?.title}</div>
          <div className="truncate text-xs text-muted-foreground">{row.job?.company}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{timeAgo(row.applied_at)}</div>
    </div>
  );
}
