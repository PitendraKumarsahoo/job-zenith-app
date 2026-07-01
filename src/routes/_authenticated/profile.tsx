import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return { ...data, email: u.user.email };
    },
  });

  const [form, setForm] = useState({ full_name: "", headline: "", bio: "", location: "", avatar_url: "" });
  useEffect(() => { if (profile) setForm({ full_name: profile.full_name ?? "", headline: profile.headline ?? "", bio: profile.bio ?? "", location: profile.location ?? "", avatar_url: profile.avatar_url ?? "" }); }, [profile]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").upsert({ id: u.user.id, ...form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Profile</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Your profile</h1>
      </header>

      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 border border-border shadow-glow">
            <AvatarImage src={form.avatar_url} />
            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-lg font-bold">{initials(form.full_name || profile?.email)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-lg font-semibold">{form.full_name || profile?.email}</div>
            <div className="text-sm text-muted-foreground">{profile?.email}</div>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div><Label>Full name</Label><Input className="mt-1.5" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Headline</Label><Input className="mt-1.5" placeholder="Senior Frontend Engineer" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></div>
          <div><Label>Location</Label><Input className="mt-1.5" placeholder="Berlin, Germany" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div><Label>Avatar URL</Label><Input className="mt-1.5" placeholder="https://…" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} /></div>
          <div className="sm:col-span-2">
            <Label>Bio</Label>
            <textarea rows={4} className="mt-1.5 w-full rounded-xl border border-border bg-input p-3 text-sm outline-none focus:ring-2 focus:ring-ring" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>
        </div>
        <div className="mt-6">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="bg-gradient-primary text-primary-foreground shadow-glow">Save profile</Button>
        </div>
      </div>
    </div>
  );
}
