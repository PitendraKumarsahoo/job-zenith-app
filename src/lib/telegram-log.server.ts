// Server-only helpers for sending Telegram messages with exponential-backoff retry
// and writing to the telegram_notifications audit log.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function maskChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  const s = String(chatId);
  return s.length <= 4 ? "••" + s.slice(-2) : "••••" + s.slice(-4);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

export async function loadTelegramCreds(
  userId: string,
): Promise<{ bot_token: string; chat_id: string } | null> {
  const { data } = await supabaseAdmin
    .from("user_telegram_credentials")
    .select("bot_token, chat_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { bot_token: string; chat_id: string } | null) ?? null;
}

async function sendOnce(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Try to extract retry_after for 429s
    let retryAfterMs: number | undefined;
    try {
      const j = JSON.parse(body);
      if (typeof j?.parameters?.retry_after === "number") {
        retryAfterMs = j.parameters.retry_after * 1000;
      }
    } catch {
      // ignore
    }
    const err = new Error(`Telegram ${res.status}: ${body.slice(0, 300)}`);
    (err as any).retryAfterMs = retryAfterMs;
    (err as any).status = res.status;
    throw err;
  }
}

export type SendResult =
  | { ok: true; attempts: number }
  | { ok: false; attempts: number; error: string };

/** Send with exponential backoff. Retries 5xx, 429 (Too Many Requests), and network errors. */
export async function sendWithRetry(
  botToken: string,
  chatId: string,
  text: string,
  maxAttempts = 4,
): Promise<SendResult> {
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sendOnce(botToken, chatId, text);
      return { ok: true, attempts: attempt };
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
      const status: number | undefined = e?.status;
      // Do not retry 4xx (except 429) — those are permanent config errors.
      const retriable = !status || status === 429 || status >= 500;
      if (!retriable || attempt === maxAttempts) {
        return { ok: false, attempts: attempt, error: lastErr };
      }
      const baseMs = 500 * Math.pow(2, attempt - 1); // 500, 1000, 2000
      const jitter = Math.floor(Math.random() * 250);
      const wait = e?.retryAfterMs ?? baseMs + jitter;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return { ok: false, attempts: maxAttempts, error: lastErr };
}

export type LogEntryInput = {
  user_id: string;
  kind: "match" | "status_change" | "test" | "manual";
  job_id?: string | null;
  applied_id?: string | null;
  message: string;
  chat_id_masked?: string | null;
  metadata?: Record<string, unknown>;
};

/** Send + log in one shot. Returns notification row id. */
export async function sendAndLog(
  userId: string,
  text: string,
  entry: Omit<LogEntryInput, "user_id" | "message">,
): Promise<{ notificationId: string; result: SendResult }> {
  const creds = await loadTelegramCreds(userId);
  if (!creds) {
    const { data } = await supabaseAdmin
      .from("telegram_notifications")
      .insert({
        user_id: userId,
        kind: entry.kind,
        job_id: entry.job_id ?? null,
        applied_id: entry.applied_id ?? null,
        status: "skipped",
        attempts: 0,
        last_error: "Telegram not configured",
        message: text,
        chat_id_masked: null,
        metadata: (entry.metadata ?? {}) as any,
      })
      .select("id")
      .single();
    return {
      notificationId: (data as any)?.id ?? "",
      result: { ok: false, attempts: 0, error: "Telegram not configured" },
    };
  }

  const masked = maskChatId(creds.chat_id);
  const result = await sendWithRetry(creds.bot_token, creds.chat_id, text);
  const { data } = await supabaseAdmin
    .from("telegram_notifications")
    .insert({
      user_id: userId,
      kind: entry.kind,
      job_id: entry.job_id ?? null,
      applied_id: entry.applied_id ?? null,
      status: result.ok ? "sent" : "failed",
      attempts: result.attempts,
      last_error: result.ok ? null : result.error,
      message: text,
      chat_id_masked: masked,
      metadata: (entry.metadata ?? {}) as any,
    })
    .select("id")
    .single();
  return { notificationId: (data as any)?.id ?? "", result };
}

/** Retry a previously-failed notification row. Reuses the stored message + kind. */
export async function retryNotification(
  userId: string,
  notificationId: string,
): Promise<SendResult> {
  const { data: row, error } = await supabaseAdmin
    .from("telegram_notifications")
    .select("id, user_id, message, status, attempts")
    .eq("id", notificationId)
    .eq("user_id", userId)
    .single();
  if (error || !row) throw new Error("Notification not found");
  if ((row as any).status === "sent") {
    return { ok: true, attempts: (row as any).attempts };
  }
  const creds = await loadTelegramCreds(userId);
  if (!creds) {
    await supabaseAdmin
      .from("telegram_notifications")
      .update({ status: "skipped", last_error: "Telegram not configured" })
      .eq("id", notificationId);
    return { ok: false, attempts: (row as any).attempts, error: "Telegram not configured" };
  }
  const result = await sendWithRetry(creds.bot_token, creds.chat_id, (row as any).message);
  await supabaseAdmin
    .from("telegram_notifications")
    .update({
      status: result.ok ? "sent" : "failed",
      attempts: (row as any).attempts + result.attempts,
      last_error: result.ok ? null : result.error,
      chat_id_masked: maskChatId(creds.chat_id),
    })
    .eq("id", notificationId);
  return result;
}
