import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// -------- Save credentials (writes to private table via admin client) --------
export const saveTelegramCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        bot_token: z.string().min(10).max(200),
        chat_id: z.string().min(1).max(64),
      })
      .parse(d),
  )
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
    const { maskChatId } = await import("@/lib/telegram-log.server");
    const { data } = await supabaseAdmin
      .from("user_telegram_credentials")
      .select("chat_id, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return { configured: false as const };
    return {
      configured: true as const,
      chatIdMasked: maskChatId((data as any).chat_id) ?? "",
      updatedAt: (data as any).updated_at as string,
    };
  });

// -------- Send a test message (via retry + audit log) --------
export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sendAndLog } = await import("@/lib/telegram-log.server");
    const { result, notificationId } = await sendAndLog(context.userId, data.text, {
      kind: "test",
    });
    if (!result.ok) {
      throw new Error(result.error || "Telegram send failed");
    }
    return { ok: true, notificationId };
  });

// -------- Kanban drag → status change (idempotent + logged + retried) --------
export const notifyStatusChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        appliedId: z.string().uuid(),
        newStatus: z.enum(["applied", "interview", "offer", "rejected", "withdrawn"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendAndLog, escapeHtml } = await import("@/lib/telegram-log.server");

    // Idempotency: only send if last_notified_status differs from the new status.
    // We read via the user-scoped client so we also enforce ownership via RLS.
    const { data: row } = await supabase
      .from("applied_jobs")
      .select("id, status, last_notified_status, job:jobs(title, company, apply_url)")
      .eq("id", data.appliedId)
      .eq("user_id", userId)
      .single();

    if (!row) return { ok: false as const, reason: "not-found" };
    if ((row as any).last_notified_status === data.newStatus) {
      return { ok: false as const, reason: "duplicate" };
    }

    // Respect the user's opt-out.
    const { data: settings } = await supabase
      .from("user_settings")
      .select("notify_application_updates")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings && (settings as any).notify_application_updates === false) {
      // Still record the skip so it's auditable.
      await supabaseAdmin
        .from("applied_jobs")
        .update({ last_notified_status: data.newStatus })
        .eq("id", data.appliedId);
      return { ok: false as const, reason: "disabled" };
    }

    const job = (row as any).job;
    const emoji: Record<string, string> = {
      applied: "📮",
      interview: "🎯",
      offer: "🎉",
      rejected: "❌",
      withdrawn: "↩️",
    };
    const headline =
      data.newStatus === "interview"
        ? "Interview stage!"
        : data.newStatus === "offer"
          ? "Offer received!"
          : data.newStatus === "rejected"
            ? "Application closed"
            : data.newStatus === "withdrawn"
              ? "Application withdrawn"
              : "Application updated";

    const text =
      `${emoji[data.newStatus]} <b>${headline}</b>\n` +
      `<b>${escapeHtml(job?.title ?? "")}</b> at ${escapeHtml(job?.company ?? "")}\n` +
      `Status: <i>${data.newStatus}</i>` +
      (job?.apply_url ? `\n${job.apply_url}` : "");

    const { result, notificationId } = await sendAndLog(userId, text, {
      kind: "status_change",
      applied_id: data.appliedId,
      metadata: { from: (row as any).status, to: data.newStatus },
    });

    // Even on failure we mark last_notified_status so retries go through the
    // "Resend" flow rather than every drag re-firing the pipeline. The failed
    // row is visible in the audit log with a "Resend" button.
    await supabaseAdmin
      .from("applied_jobs")
      .update({ last_notified_status: data.newStatus })
      .eq("id", data.appliedId);

    return { ok: result.ok, notificationId, error: result.ok ? null : result.error };
  });
