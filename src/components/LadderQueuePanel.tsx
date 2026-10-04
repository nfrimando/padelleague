"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Swords, Users } from "lucide-react";
import { Modal } from "@/components/Modal";
import { supabase } from "@/lib/supabase";
import {
  QUEUE_GROUP_SIZE,
  QUEUE_PLAY_WINDOW_DAYS,
  formatPlayBy,
} from "@/lib/ladder/ladderQueueShared";
import type { LadderQueueState } from "@/app/api/ladder/queue/route";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center w-full sm:w-auto shrink-0 min-h-11 px-6 rounded-xl bg-[#00C8DC] text-[#0E1523] text-sm font-bold shadow-[0_0_20px_rgba(0,200,220,0.45)] transition-all cursor-pointer hover:bg-white hover:shadow-[0_0_24px_rgba(0,200,220,0.6)] disabled:opacity-60 disabled:cursor-not-allowed";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center w-full sm:w-auto shrink-0 min-h-11 px-6 rounded-xl bg-[#1a2540] border border-[#687FA3]/30 text-white text-sm font-bold transition-colors cursor-pointer hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-60 disabled:cursor-not-allowed";

async function authedFetch(path: string, method: "GET" | "POST") {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) || `Request failed (${res.status})`);
  return json;
}

// Self-serve ladder queue: join → wait for 4 in your tier → matched with a play-by deadline.
// Shown only to a linked player while a cycle is active.
export default function LadderQueuePanel() {
  const [state, setState] = useState<LadderQueueState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmBackout, setConfirmBackout] = useState(false);

  const load = useCallback(async () => {
    try {
      setState((await authedFetch("/api/ladder/queue", "GET")) as unknown as LadderQueueState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the queue.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, success: (json: Record<string, unknown>) => string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const json = await authedFetch(path, "POST");
      setNotice(success(json));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (state && !state.cycleId) return null;

  const tierName = state?.tier?.name ?? "your tier";
  const open = state?.openMatch ?? null;
  const waiting = state?.waiting ?? null;

  let icon = <Users className="w-5 h-5" />;
  let headline = "Queue for a ladder match";
  let subtext = `Join the ${tierName} queue. As soon as ${QUEUE_GROUP_SIZE} players are in, you're matched and have ${QUEUE_PLAY_WINDOW_DAYS} days to play.`;
  let action: React.ReactNode = (
    <button
      type="button"
      disabled={busy || !state?.tier}
      onClick={() =>
        act("/api/ladder/queue/join", (json) =>
          json.matchId ? "You've been matched! Check your email for the details." : null,
        )
      }
      className={PRIMARY_BUTTON}
    >
      Join the queue
    </button>
  );

  if (open) {
    const isQueue = open.source === "queue";
    icon = <Swords className="w-5 h-5" />;
    headline = "You have a ladder match to play";
    subtext = `${open.team1.join(" & ")} vs ${open.team2.join(" & ")}${
      open.status === "scheduled" ? " · scheduled" : " · not scheduled yet"
    }`;
    action = isQueue ? (
      <button
        type="button"
        disabled={busy}
        title="Backing out is subject to penalties"
        onClick={() => setConfirmBackout(true)}
        className={SECONDARY_BUTTON}
      >
        Back out
      </button>
    ) : null;
  } else if (waiting) {
    icon = <Clock className="w-5 h-5" />;
    headline = `You're in the ${tierName} queue`;
    subtext = `${waiting.waitingCount} of ${QUEUE_GROUP_SIZE} waiting · you're #${waiting.position} in line. We'll email you when you're matched.`;
    action = (
      <button
        type="button"
        disabled={busy}
        onClick={() => act("/api/ladder/queue/leave", () => "You've left the queue.")}
        className={SECONDARY_BUTTON}
      >
        Leave the queue
      </button>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mb-6">
      <div
        className={`relative rounded-xl border px-4 py-4 sm:px-5 ${
          open || waiting ? "border-[#00C8DC]/25 bg-[#00C8DC]/[0.04]" : "border-[#162032] bg-[#0f1729]"
        }`}
      >
        {/* Loading overlay on the mounted container, not an unmount, so the page doesn't jump. */}
        {(!state || busy) && (
          <div className="absolute inset-0 rounded-xl bg-[#0E1523]/40" aria-hidden="true" />
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#00C8DC]/10 text-[#00C8DC]">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-white leading-tight">{headline}</h2>
              <p className="mt-1 text-sm text-[#687FA3] leading-relaxed break-words">{subtext}</p>
              {open?.playByAt && (
                <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-amber-300/80">
                  Play by {formatPlayBy(open.playByAt)}
                </p>
              )}
              {notice && <p className="mt-2 text-sm text-emerald-300">{notice}</p>}
              {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
            </div>
          </div>
          {action}
        </div>
      </div>

      <Modal
        isOpen={confirmBackout}
        onClose={() => setConfirmBackout(false)}
        title="Back out of this match?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-3 py-2.5">
            <p className="text-sm font-bold text-rose-300">Backing out is subject to penalties.</p>
            <p className="mt-1 text-sm text-rose-200/80 leading-relaxed">
              It&apos;s recorded against you, and an admin may deduct a star.
            </p>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            The match is cancelled and the other three go straight back into the queue at their
            original spot. You can join the queue again whenever you&apos;re ready.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmBackout(false)}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-xl border border-[#687FA3]/30 text-sm font-bold text-slate-300 transition-colors cursor-pointer hover:text-white hover:border-[#687FA3]/60"
            >
              Keep my match
            </button>
            <button
              type="button"
              disabled={busy || !open}
              onClick={() => {
                setConfirmBackout(false);
                if (open) {
                  void act(`/api/ladder/queue/matches/${open.matchId}/backout`, () =>
                    "You've backed out. The other players are back in the queue.",
                  );
                }
              }}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-xl bg-rose-500/90 text-white text-sm font-bold transition-colors cursor-pointer hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Yes, back out
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
