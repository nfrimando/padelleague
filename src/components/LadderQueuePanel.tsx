"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, Repeat, Swords, Users } from "lucide-react";
import { Modal } from "@/components/Modal";
import { tierIconSrc, StarBadge } from "@/components/LadderTierBadge";
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

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function authedFetch(path: string, method: "GET" | "POST", body?: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new RequestError("Please sign in again.", 401);
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new RequestError((json.error as string) || `Request failed (${res.status})`, res.status);
  }
  return json;
}

function BusyLabel({ label }: { label: string }) {
  return (
    <>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
      {label}
    </>
  );
}

// Self-serve ladder queue: join → wait for 4 in your tier → matched with a play-by deadline.
// Shown only to a linked player while a cycle is active. It resolves that itself (local session
// check + the queue API's 401/403) so the fetch starts on mount instead of after useCurrentPlayer.
// tierName/stars render the player's own tier badge (the job the roulette banner used to do).
export default function LadderQueuePanel({
  tierName: badgeTierName = null,
  stars = null,
}: {
  tierName?: string | null;
  stars?: number | null;
} = {}) {
  const [state, setState] = useState<LadderQueueState | null>(null);
  // Not signed in / not linked to a player: render nothing.
  const [hidden, setHidden] = useState(false);
  // Label shown in the action button while a POST is in flight; null when idle.
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = busyLabel !== null;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmBackout, setConfirmBackout] = useState(false);

  const load = useCallback(async () => {
    try {
      setState((await authedFetch("/api/ladder/queue", "GET")) as unknown as LadderQueueState);
      setHidden(false);
    } catch (err) {
      if (err instanceof RequestError && (err.status === 401 || err.status === 403)) {
        setHidden(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load the queue.");
    }
  }, []);

  useEffect(() => {
    void load();
    // Re-resolve on sign-in/out, which used to happen by LadderView remounting this on isLinked.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  async function act(
    path: string,
    label: string,
    success: (json: Record<string, unknown>) => string | null,
    body?: unknown,
  ) {
    setBusyLabel(label);
    setError(null);
    setNotice(null);
    try {
      const json = await authedFetch(path, "POST", body);
      setNotice(success(json));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyLabel(null);
    }
  }

  if (hidden || (state && !state.cycleId)) return null;

  const tierName = state?.tier?.name ?? "your tier";
  const open = state?.openMatch ?? null;
  const waiting = state?.waiting ?? null;
  const autoRequeue = state?.autoRequeue ?? false;

  const toggleAutoRequeue = () =>
    act(
      "/api/ladder/queue/auto-requeue",
      autoRequeue ? "Turning off…" : "Turning on…",
      (json) => {
        if (!json.autoRequeue) return "Auto-requeue is off. Rejoin by hand after each match.";
        if (json.matchId) return "Auto-requeue is on, and you've been matched! Check your email for the details.";
        if (json.joined) return "Auto-requeue is on. You're in the queue and will rejoin after every match.";
        if (typeof json.joinWarning === "string") return `Auto-requeue is on, but you couldn't join yet: ${json.joinWarning}`;
        return "Auto-requeue is on. You'll go back into the queue as soon as each match is recorded.";
      },
      { enabled: !autoRequeue },
    );

  let icon = <Users className="w-5 h-5" />;
  let headline = "Queue for a ladder match";
  let subtext = `Join the ${tierName} queue. As soon as ${QUEUE_GROUP_SIZE} players are in, you're matched and have ${QUEUE_PLAY_WINDOW_DAYS} days to play.`;
  let action: React.ReactNode = (
    <button
      type="button"
      disabled={busy || !state?.tier}
      onClick={() =>
        act("/api/ladder/queue/join", "Joining…", (json) =>
          json.matchId ? "You've been matched! Check your email for the details." : null,
        )
      }
      className={PRIMARY_BUTTON}
    >
      {!state ? (
        <BusyLabel label="Checking…" />
      ) : busyLabel ? (
        <BusyLabel label={busyLabel} />
      ) : autoRequeue ? (
        "Join & stay in queue"
      ) : (
        "Join the queue"
      )}
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
        {busyLabel ? <BusyLabel label={busyLabel} /> : "Back out"}
      </button>
    ) : null;
  } else if (waiting) {
    icon = <Clock className="w-5 h-5" />;
    headline = `You're in the ${tierName} queue`;
    subtext = `${waiting.waitingCount} of ${QUEUE_GROUP_SIZE} waiting · you're #${waiting.position} in line. We'll email you when you're matched.${
      autoRequeue ? " Auto-requeue is on, so you'll rejoin after every match." : ""
    }`;
    action = (
      <button
        type="button"
        disabled={busy}
        title={autoRequeue ? "Leaving also turns off auto-requeue" : undefined}
        onClick={() =>
          act("/api/ladder/queue/leave", "Leaving…", () =>
            autoRequeue ? "You've left the queue and auto-requeue is off." : "You've left the queue.",
          )
        }
        className={SECONDARY_BUTTON}
      >
        {busyLabel ? <BusyLabel label={busyLabel} /> : "Leave the queue"}
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
            <div className={`min-w-0 ${state ? "" : "animate-pulse"}`}>
              <h2 className="text-lg sm:text-xl font-black text-white leading-tight">{headline}</h2>
              <p className="mt-1 text-sm text-[#687FA3] leading-relaxed break-words">{subtext}</p>
              {badgeTierName && (
                <div className="mt-2.5 inline-flex items-center gap-1.5">
                  <img
                    src={tierIconSrc(badgeTierName)}
                    alt=""
                    className="w-5 h-5 object-contain shrink-0"
                  />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#687FA3]">
                    {badgeTierName}
                  </span>
                  <StarBadge stars={stars ?? 0} />
                </div>
              )}
              {open?.playByAt && (
                <p className="mt-1.5 text-xs font-bold uppercase tracking-widest text-amber-300/80">
                  Play by {formatPlayBy(open.playByAt)}
                </p>
              )}
              {open && autoRequeue && (
                <p className="mt-1.5 inline-flex items-start gap-1.5 text-sm text-[#00C8DC]/90 leading-relaxed">
                  <Repeat className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  Auto-requeue is on. You&apos;ll go back into the {tierName} queue as soon as this
                  match is recorded.
                </p>
              )}
              {state && (
                <div className="mt-3 flex items-start gap-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoRequeue}
                    aria-labelledby="ladder-auto-requeue-label"
                    aria-describedby="ladder-auto-requeue-hint"
                    disabled={busy}
                    onClick={() => void toggleAutoRequeue()}
                    className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C8DC]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1523] ${
                      autoRequeue
                        ? "bg-[#00C8DC] border-[#00C8DC]"
                        : "bg-[#1a2540] border-[#687FA3]/30 hover:border-[#687FA3]/60"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-slate-100 transition-transform ${
                        autoRequeue ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div className="min-w-0">
                    <p id="ladder-auto-requeue-label" className="text-sm font-semibold text-slate-200">
                      Auto-requeue after each match
                    </p>
                    <p id="ladder-auto-requeue-hint" className="text-xs text-[#687FA3] leading-relaxed">
                      {autoRequeue
                        ? "On: you rejoin the queue as soon as each match is recorded. Turn off anytime."
                        : "Off: you rejoin by hand after each match."}
                    </p>
                  </div>
                </div>
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
              {autoRequeue && " It also turns off auto-requeue."}
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
                  void act(`/api/ladder/queue/matches/${open.matchId}/backout`, "Backing out…", () =>
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
