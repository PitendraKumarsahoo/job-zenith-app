import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sendMessage(botToken: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Telegram error: ${t.slice(0, 200)}`);
  }
}

export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: s } = await supabase
      .from("user_settings")
      .select("telegram_bot_token, telegram_chat_id")
      .eq("user_id", userId)
      .single();
    if (!s?.telegram_bot_token || !s?.telegram_chat_id) {
      throw new Error("Configure your Telegram bot token and chat ID in Settings first.");
    }
    await sendMessage(s.telegram_bot_token, s.telegram_chat_id, data.text);
    return { ok: true };
  });

// Fired when application status changes on the Kanban board.
export const notifyStatusChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    appliedId: z.string().uuid(),
    newStatus: z.enum(["applied", "interview", "offer", "rejected", "withdrawn"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: settings }, { data: row }] = await Promise.all([
      supabase.from("user_settings").select("telegram_bot_token, telegram_chat_id, notify_application_updates").eq("user_id", userId).single(),
      supabase.from("applied_jobs").select("status, job:jobs(title, company, apply_url)").eq("id", data.appliedId).eq("user_id", userId).single(),
    ]);
    if (!settings?.telegram_bot_token || !settings?.telegram_chat_id) return { ok: false, reason: "not-configured" };
    if (settings.notify_application_updates === false) return { ok: false, reason: "disabled" };
    if (!row?.job) return { ok: false, reason: "no-job" };

    const emoji: Record<string, string> = {
      applied: "📮",
      interview: "🎯",
      offer: "🎉",
      rejected: "❌",
      withdrawn: "↩️",
    };
    const headline =
      data.newStatus === "interview" ? "Interview stage!" :
      data.newStatus === "offer" ? "Offer received!" :
      data.newStatus === "rejected" ? "Application closed" :
      data.newStatus === "withdrawn" ? "Application withdrawn" :
      "Application updated";

    const job = row.job as any;
    const text =
      `${emoji[data.newStatus]} <b>${headline}</b>\n` +
      `<b>${escapeHtml(job.title)}</b> at ${escapeHtml(job.company)}\n` +
      `Status: <i>${data.newStatus}</i>` +
      (job.apply_url ? `\n${job.apply_url}` : "");

    await sendMessage(settings.telegram_bot_token, settings.telegram_chat_id, text);
    return { ok: true };
  });

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
