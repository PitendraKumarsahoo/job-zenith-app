import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
    const res = await fetch(`https://api.telegram.org/bot${s.telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: s.telegram_chat_id, text: data.text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Telegram error: ${t.slice(0, 200)}`);
    }
    return { ok: true };
  });
