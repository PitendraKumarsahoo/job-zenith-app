import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Send, History, ShieldCheck, RefreshCw, KeyRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendTelegramTest, saveTelegramCreds, deleteTelegramCreds, getTelegramStatus } from "@/lib/telegram.functions";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getTelegramStatus);
  const saveCredsFn = useServerFn(saveTelegramCreds);
  const deleteCredsFn = useServerFn(deleteTelegramCreds);

  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", u.user.id).maybeSingle();
      return data;
    },
  });
  const { data: telegramStatus } = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => statusFn(),
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
  useEffect(() => { if (settings) setForm((f) => ({
    ...f,
    notify_new_matches: settings.notify_new_matches,
    notify_application_updates: settings.notify_application_updates,
  })); }, [settings]);

  const savePrefsMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_settings").upsert({
        user_id: u.user.id,
        notify_new_matches: form.notify_new_matches,
        notify_application_updates: form.notify_application_updates,
      });
      if (error) throw error;

      // Save credentials via server function only if both fields were provided.
      if (form.telegram_bot_token && form.telegram_chat_id) {
        await saveCredsFn({ data: { bot_token: form.telegram_bot_token, chat_id: form.telegram_chat_id } });
      }
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["user-settings"] });
      qc.invalidateQueries({ queryKey: ["telegram-status"] });
      setForm((f) => ({ ...f, telegram_bot_token: "", telegram_chat_id: "" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => deleteCredsFn(),
    onSuccess: () => {
      toast.success("Telegram disconnected");
      qc.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testFn = useServerFn(sendTelegramTest);
  const testMut = useMutation({
    mutationFn: () => testFn({ data: { text: "🚀 JobPilot is connected. You'll now get match alerts here." } }),
    onSuccess: () => toast.success("Test sent — check Telegram"),
    onError: (e: any) => toast.error(e.message),
  });

  const configured = !!telegramStatus?.configured;

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

        {configured ? (
          <div className="rounded-xl border border-success/40 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
              <div className="flex-1 space-y-1">
                <div className="text-sm font-semibold">Telegram connected</div>
                <div className="text-xs text-muted-foreground">
                  Chat ID <span className="font-mono">{telegramStatus?.chatIdMasked}</span>
                  {telegramStatus?.updatedAt && <> · updated {timeAgo(telegramStatus.updatedAt)}</>}
                </div>
                <div className="text-xs text-muted-foreground">
                  <KeyRound className="mr-1 inline h-3 w-3" />
                  Bot token is stored server-side and never sent back to the browser.
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                  Test
                </Button>
                <Button variant="outline" size="sm" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
                  Disconnect
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" /> To rotate, paste new values below and hit Save — the previous token is overwritten securely on the server.
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card/40 p-3 text-sm text-muted-foreground">
            Not connected yet. Add your bot token and chat ID below to enable notifications.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Bot token {configured && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
            <Input className="mt-1.5 font-mono" type="password" autoComplete="off" placeholder={configured ? "•••••••• (saved)" : "123456:ABC…"} value={form.telegram_bot_token} onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })} />
          </div>
          <div>
            <Label>Chat ID {configured && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}</Label>
            <Input className="mt-1.5 font-mono" autoComplete="off" placeholder={configured ? "•••••••• (saved)" : "123456789"} value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} />
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
          <Button onClick={() => savePrefsMut.mutate()} disabled={savePrefsMut.isPending} className="bg-gradient-primary text-primary-foreground shadow-glow">Save</Button>
          <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending || !configured}>Send test message</Button>
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
