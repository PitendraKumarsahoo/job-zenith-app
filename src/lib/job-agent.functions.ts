// Client-callable server functions for the job agent + notification audit trail.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Manually trigger the agent (Settings / debug). Runs across all opted-in users.
export const triggerJobAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ query: z.string().min(1).max(120).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { runJobAgent } = await import("@/lib/job-agent.server");
    return runJobAgent(data.query ?? "developer");
  });

// List the caller's Telegram notification log.
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("telegram_notifications")
      .select("id, kind, status, attempts, last_error, message, chat_id_masked, metadata, created_at, updated_at, job_id, applied_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Retry a previously-failed notification.
export const resendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ notificationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { retryNotification } = await import("@/lib/telegram-log.server");
    return retryNotification(context.userId, data.notificationId);
  });
