"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Player } from "@/lib/types";
import PlayerAvatar from "@/components/PlayerAvatar";

type Session = { user: { id: string; email?: string } } | null;

export default function AdminPage() {
  const [session, setSession] = useState<Session>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [editing, setEditing] = useState<Player | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setLoading(false); return; }
    supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => {
        setIsAdmin(!!data);
        setLoading(false);
      });
  }, [session]);

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setIsAdmin(false);
  }

  async function searchPlayers() {
    if (!search.trim()) return;
    const { data } = await supabase
      .from("players")
      .select("*")
      .or(`name.ilike.%${search}%,nickname.ilike.%${search}%`)
      .limit(10);
    setPlayers(data || []);
  }

  async function savePlayer() {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("players")
      .update({
        name: editing.name,
        nickname: editing.nickname,
        image_link: editing.image_link,
      })
      .eq("player_id", editing.player_id);
    setSaving(false);
    setSaveMsg(error ? "Error saving." : "Saved!");
    setTimeout(() => setSaveMsg(""), 3000);
    if (!error) {
      setPlayers((prev) =>
        prev.map((p) => (p.player_id === editing.player_id ? editing : p))
      );
      setEditing(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-sec">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-white italic mb-2">Admin</h1>
        <p className="text-sec text-sm mb-6">Sign in to continue.</p>
        <button
          onClick={signIn}
          className="bg-accent text-bg px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-accent/90 transition-colors cursor-pointer"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-3xl text-white italic mb-2">Access Denied</h1>
        <p className="text-sec text-sm mb-4">
          {session.user.email} is not an admin.
        </p>
        <button onClick={signOut} className="text-xs text-muted hover:text-sec underline">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-white italic">Admin</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-sec">{session.user.email}</span>
          <button
            onClick={signOut}
            className="text-xs text-muted hover:text-loss transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Player search */}
      <div className="bg-surface border border-bdr rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Edit Player</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search player…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchPlayers()}
            className="flex-1 bg-elevated border border-bdr rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={searchPlayers}
            className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Search
          </button>
        </div>

        {players.length > 0 && (
          <div className="space-y-2">
            {players.map((p) => (
              <div
                key={p.player_id}
                className="flex items-center gap-3 p-3 bg-elevated rounded-lg hover:bg-bg/50 transition-colors cursor-pointer"
                onClick={() => setEditing({ ...p })}
              >
                <PlayerAvatar name={p.name} imageLink={p.image_link} size={36} />
                <div>
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  {p.nickname && (
                    <div className="text-xs text-muted">"{p.nickname}"</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-surface border border-accent/30 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-accent">Editing: {editing.name}</h2>

          {[
            { label: "Name", key: "name" as keyof Player },
            { label: "Nickname", key: "nickname" as keyof Player },
            { label: "Image URL", key: "image_link" as keyof Player },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-muted mb-1">{f.label}</label>
              <input
                type="text"
                value={(editing[f.key] as string) || ""}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev ? { ...prev, [f.key]: e.target.value } : null
                  )
                }
                className="w-full bg-elevated border border-bdr rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
              />
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              onClick={savePlayer}
              disabled={saving}
              className="bg-accent text-bg px-5 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="text-sm text-sec hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {saveMsg && (
              <span className="text-xs text-win">{saveMsg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
