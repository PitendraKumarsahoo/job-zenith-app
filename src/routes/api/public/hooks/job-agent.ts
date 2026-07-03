// Public cron endpoint. Called by pg_cron every 30 minutes with the project's
// anon key in the `apikey` header. The published site bypasses auth on
// `/api/public/*`, so we validate the header ourselves before running the agent.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/job-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let query = "developer";
        try {
          const body = await request.json();
          if (typeof body?.query === "string") query = body.query;
        } catch {
          // no body — fine
        }
        const { runJobAgent } = await import("@/lib/job-agent.server");
        const summary = await runJobAgent(query);
        return Response.json({ ok: true, summary });
      },
    },
  },
});
