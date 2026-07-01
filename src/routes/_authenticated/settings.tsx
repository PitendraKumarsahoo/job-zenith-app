import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, History } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendTelegramTest } from "@/lib/telegram.functions";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", u.user.id).maybeSingle();
      return data;
    },
  });
  const { data: history = [] } = useQuery({
    queryKey: ["search-history"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase.from("search_history").select("*").eq("user_id", u.user.id).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    telegram_bot_token: "", telegram_chat_id: "",
    notify_new_matches: true, notify_application_updates: true,
  });
  useEffect(() => { if (settings) setForm({
    telegram_bot_token: settings.telegram_bot_token ?? "",
    telegram_chat_id: settings.telegram_chat_id ?? "",
    notify_new_matches: settings.notify_new_matches,
    notify_application_updates: settings.notify_application_updates,
  }); }, [settings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_settings").upsert({ user_id: u.user.id, ...form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["user-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const testFn = useServerFn(sendTelegramTest);
  const testMut = useMutation({
    mutationFn: () => testFn({ data: { text: "🚀 JobPilot is connected. You'll now get match alerts here." } }),
    onSuccess: () => toast.success("Test sent — check Telegram"),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Settings</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Preferences</h1>
      </header>

      <section className="glass space-y-4 rounded-2xl p-6">
        <div className="flex items-center gap-2"><Send className="h-4 w-4 text-primary" /><h2 className="text-lg font-semibold">Telegram notifications</h2></div>
        <p className="text-sm text-muted-foreground">
          Create a bot with <a className="underline hover:text-foreground" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> and paste the token. Then message your bot and grab your chat ID from <span className="font-mono">https://api.telegram.org/bot&lt;token&gt;/getUpdates</span>.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Bot token</Label>
            <Input className="mt-1.5 font-mono" type="password" placeholder="123456:ABC…" value={form.telegram_bot_token} onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })} />
          </div>
          <div>
            <Label>Chat ID</Label>
            <Input className="mt-1.5 font-mono" placeholder="123456789" value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card/40 p-3">
          <div><div className="text-sm font-medium">New job matches</div><div className="text-xs text-muted-foreground">Get pinged when a high-scoring job appears.</div></div>
          <Switch checked={form.notify_new_matches} onCheckedChange={(v) => setForm({ ...form, notify_new_matches: v })} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card/40 p-3">
          <div><div className="text-sm font-medium">Application updates</div><div className="text-xs text-muted-foreground">Nudges when status changes.</div></div>
          <Switch checked={form.notify_application_updates} onCheckedChange={(v) => setForm({ ...form, notify_application_updates: v })} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="bg-gradient-primary text-primary-foreground shadow-glow">Save</Button>
          <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending}>Send test message</Button>
        </div>
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-3 flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h2 className="text-lg font-semibold">Search history</h2></div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved searches yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h: any) => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{h.query || <em className="text-muted-foreground">no query</em>}</div>
                  <div className="text-xs text-muted-foreground">{h.result_count ?? "?"} results · {timeAgo(h.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
