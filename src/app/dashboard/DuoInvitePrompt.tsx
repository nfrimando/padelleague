"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { MyDuoEntry, PlayerDuoState } from "@/lib/ladder/ladderDuoShared";

async function authedFetch(path: string, method: "GET" | "POST") {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const res = await fetch(path, { method, headers: { Authorization: `Bearer ${session.access_token}` } });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) || `Request failed (${res.status})`);
  return json;
}

/**
 * Dashboard prompt for unanswered Duo Ladder invites. Self-contained: loads the signed-in player's
 * incoming invites and answers them in place. Renders nothing when there are none (or the duo
 * ladder isn't enabled yet).
 */
export default function DuoInvitePrompt() {
  const [invites, setInvites] = useState<MyDuoEntry[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const state = (await authedFetch("/api/ladder/duos", "GET")) as unknown as PlayerDuoState;
      setInvites(state.available ? state.incoming : []);
    } catch {
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(invite: MyDuoEntry, action: "accept" | "decline") {
    setBusyId(invite.duoId);
    setError(null);
    try {
      await authedFetch(`/api/ladder/duos/${invite.duoId}/${action}`, "POST");
      if (action === "accept") setAccepted(invite.partner.nickname || invite.partner.name || "your partner");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  if (invites.length === 0 && !accepted) return null;

  return (
    <>
      {accepted && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 sm:rounded-2xl px-4 sm:px-5 py-3 text-sm text-emerald-200">
          You and {accepted} are now a duo.{" "}
          <Link href="/ladder?mode=duo" className="font-bold underline hover:text-white">
            Queue up on the Duo Ladder
          </Link>
        </div>
      )}
      {invites.map((invite) => {
        const who = invite.partner.nickname || invite.partner.name || "Another member";
        const busy = busyId === invite.duoId;
        return (
          <div
            key={invite.duoId}
            className="bg-[#00C8DC]/10 border border-[#00C8DC]/25 sm:rounded-2xl px-4 sm:px-5 py-3 space-y-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Users size={16} className="text-[#00C8DC] shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#00C8DC]">Duo Invite</p>
                <p className="text-sm text-slate-200 leading-snug break-words">
                  <span className="font-bold text-white">{who}</span> wants to team up on the Duo Ladder
                  {invite.name ? (
                    <>
                      {" "}as <span className="font-bold text-white">{invite.name}</span>
                    </>
                  ) : null}
                  .
                </p>
                <p className="text-xs text-[#687FA3] mt-0.5">
                  Duo matches only move your duo&apos;s stars, not your solo ladder standing.
                </p>
                {error && busyId === null && <p className="mt-1 text-xs text-rose-300">{error}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void respond(invite, "accept")}
                className="w-full inline-flex items-center justify-center rounded-xl bg-[#00C8DC] px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {busy ? "Working…" : "Accept"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void respond(invite, "decline")}
                className="w-full inline-flex items-center justify-center rounded-xl border border-[#687FA3]/25 bg-[#162032] px-4 py-2.5 text-sm font-semibold text-[#687FA3] hover:border-[#687FA3]/50 hover:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
