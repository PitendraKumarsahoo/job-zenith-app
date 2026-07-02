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

async function loadCreds(userId: string): Promise<{ bot_token: string; chat_id: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_telegram_credentials")
    .select("bot_token, chat_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

// -------- Save credentials (writes to private table via admin client) --------
export const saveTelegramCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bot_token: z.string().min(10).max(200),
    chat_id: z.string().min(1).max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_telegram_credentials")
      .upsert({ user_id: context.userId, bot_token: data.bot_token, chat_id: data.chat_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Remove credentials --------
export const deleteTelegramCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_telegram_credentials")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Return status with masked chat id (never leak the token) --------
export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_telegram_credentials")
      .select("chat_id, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return { configured: false as const };
    const cid = String(data.chat_id);
    const masked = cid.length <= 4 ? "••" + cid.slice(-2) : "••••" + cid.slice(-4);
    return { configured: true as const, chatIdMasked: masked, updatedAt: data.updated_at };
  });

// -------- Send a test message --------
export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const creds = await loadCreds(context.userId);
    if (!creds) throw new Error("Configure your Telegram bot token and chat ID in Settings first.");
    await sendMessage(creds.bot_token, creds.chat_id, data.text);
    return { ok: true };
  });

// -------- Fired when application status changes on the Kanban board --------
export const notifyStatusChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    appliedId: z.string().uuid(),
    newStatus: z.enum(["applied", "interview", "offer", "rejected", "withdrawn"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [creds, { data: settings }, { data: row }] = await Promise.all([
      loadCreds(userId),
      supabase.from("user_settings").select("notify_application_updates").eq("user_id", userId).maybeSingle(),
      supabase.from("applied_jobs").select("status, job:jobs(title, company, apply_url)").eq("id", data.appliedId).eq("user_id", userId).single(),
    ]);
    if (!creds) return { ok: false, reason: "not-configured" };
    if (settings?.notify_application_updates === false) return { ok: false, reason: "disabled" };
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

    await sendMessage(creds.bot_token, creds.chat_id, text);
    return { ok: true };
  });

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
