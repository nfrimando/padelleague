"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Swords, UserPlus, Users } from "lucide-react";
import { Modal } from "@/components/Modal";
import PlayerSlotPicker from "@/components/PlayerSlotPicker";
import { tierIconSrc, StarBadge } from "@/components/LadderTierBadge";
import { supabase } from "@/lib/supabase";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import type { Player } from "@/lib/types";
import { QUEUE_PLAY_WINDOW_DAYS, formatPlayBy } from "@/lib/ladder/ladderQueueShared";
import {
  DUO_NAME_MAX_LENGTH,
  inviteExpiresAt,
  type MyDuoEntry,
  type PlayerDuoState,
} from "@/lib/ladder/ladderDuoShared";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center w-full sm:w-auto shrink-0 min-h-11 px-5 rounded-xl bg-[#00C8DC] text-[#0E1523] text-sm font-bold shadow-[0_0_20px_rgba(0,200,220,0.45)] transition-all cursor-pointer hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C8DC]/60 disabled:opacity-60 disabled:cursor-not-allowed";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center w-full sm:w-auto shrink-0 min-h-11 px-5 rounded-xl bg-[#1a2540] border border-[#687FA3]/30 text-white text-sm font-bold transition-colors cursor-pointer hover:border-[#687FA3]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C8DC]/60 disabled:opacity-60 disabled:cursor-not-allowed";
const DANGER_BUTTON =
  "inline-flex items-center justify-center w-full sm:w-auto shrink-0 min-h-11 px-5 rounded-xl bg-[#1a2540] border border-[#687FA3]/30 text-white text-sm font-bold transition-colors cursor-pointer hover:border-rose-500/50 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 disabled:opacity-60 disabled:cursor-not-allowed";
const LINK_BUTTON =
  "text-[11px] font-bold uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:underline disabled:opacity-50 disabled:cursor-not-allowed";

async function authedFetch(path: string, method: "GET" | "POST" | "PATCH", body?: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) || `Request failed (${res.status})`);
  return json;
}

function partnerName(duo: MyDuoEntry): string {
  return duo.partner.nickname || duo.partner.name || "your partner";
}

type Confirm =
  | { kind: "backout"; duo: MyDuoEntry }
  | { kind: "dissolve"; duo: MyDuoEntry }
  | null;

// The signed-in player's side of the Duo Ladder: pending invites, their duos (each with its tier,
// queue state, open match and actions), and a form to invite a new partner. Only one of a player's
// duos can be queued or hold an open match at a time — the server enforces it; this panel just
// shows what's possible.
export default function LadderDuoPanel({ cycleOpen }: { cycleOpen: boolean }) {
  const [state, setState] = useState<PlayerDuoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [partner, setPartner] = useState<Player | null>(null);
  const [search, setSearch] = useState("");
  const [duoName, setDuoName] = useState("");
  const { players } = usePlayers({ enabled: inviteOpen, orderByName: true, select: "player_id, name, nickname, image_link" });
  const suggestions = usePlayerSearch(players, search);

  const [renaming, setRenaming] = useState<{ duoId: number; value: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setState((await authedFetch("/api/ladder/duos", "GET")) as unknown as PlayerDuoState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your duos.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    success: (json: Record<string, unknown>) => string | null,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const json = await authedFetch(path, method, body);
      setNotice(success(json));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (state && !state.available) return null;

  const duos = state?.duos ?? [];
  const incoming = state?.incoming ?? [];
  const outgoing = state?.outgoing ?? [];
  // Whichever of my duos is currently in play (queued or holding a match) blocks the others.
  const busyDuo = duos.find((d) => d.waiting || d.openMatch) ?? null;

  async function sendInvite() {
    if (!partner) return;
    const ok = await act(
      "/api/ladder/duos",
      "POST",
      { partnerId: Number(partner.player_id), name: duoName.trim() || null },
      () => `Invite sent to ${partner.nickname || partner.name}. Your duo is set once they accept.`,
    );
    if (ok) {
      setInviteOpen(false);
      setPartner(null);
      setSearch("");
      setDuoName("");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mb-6">
      <div className="relative rounded-xl border border-[#162032] bg-[#0f1729] px-4 py-4 sm:px-5">
        {(!state || busy) && (
          <div className="absolute inset-0 rounded-xl bg-[#0E1523]/40" aria-hidden="true" />
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#00C8DC]/10 text-[#00C8DC]">
              <Users className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-white leading-tight">Your duos</h2>
              <p className="mt-1 text-sm text-[#687FA3] leading-relaxed">
                Team up with a fixed partner and climb together. Queue as a duo — when another duo in
                your tier is ready, you&apos;re matched and have {QUEUE_PLAY_WINDOW_DAYS} days to play.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy || !state}
            onClick={() => setInviteOpen(true)}
            className={SECONDARY_BUTTON}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite a partner
          </button>
        </div>

        {notice && <p className="mt-3 text-sm text-emerald-300">{notice}</p>}
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

        {incoming.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {incoming.map((duo) => (
              <div
                key={duo.duoId}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-[#00C8DC]/25 bg-[#00C8DC]/[0.04] px-3 py-3"
              >
                <p className="text-sm text-slate-200 min-w-0 break-words">
                  <span className="font-bold text-white">{partnerName(duo)}</span> wants to form a duo
                  with you{duo.name ? ` as “${duo.name}”` : ""}.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(`/api/ladder/duos/${duo.duoId}/accept`, "POST", undefined, (json) =>
                        json.ladderWarning
                          ? `Duo formed. ${json.ladderWarning as string}`
                          : `You and ${partnerName(duo)} are now a duo.`,
                      )
                    }
                    className={PRIMARY_BUTTON}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(`/api/ladder/duos/${duo.duoId}/decline`, "POST", undefined, () => "Invite declined.")
                    }
                    className={DANGER_BUTTON}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {duos.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {duos.map((duo) => {
              const blockedByOther = !!busyDuo && busyDuo.duoId !== duo.duoId;
              const open = duo.openMatch;
              return (
                <div key={duo.duoId} className="rounded-lg border border-[#162032] bg-[#0E1523] px-3 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {duo.standing ? (
                        <img
                          src={tierIconSrc(duo.standing.tierName)}
                          alt={duo.standing.tierName}
                          className="w-8 h-8 object-contain shrink-0"
                        />
                      ) : (
                        <span className="w-8 h-8 shrink-0" />
                      )}
                      <div className="min-w-0">
                        {renaming?.duoId === duo.duoId ? (
                          <form
                            className="flex flex-col sm:flex-row gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void act(
                                `/api/ladder/duos/${duo.duoId}`,
                                "PATCH",
                                { name: renaming.value },
                                () => "Duo renamed.",
                              ).then((ok) => ok && setRenaming(null));
                            }}
                          >
                            <input
                              autoFocus
                              value={renaming.value}
                              maxLength={DUO_NAME_MAX_LENGTH}
                              onChange={(e) => setRenaming({ duoId: duo.duoId, value: e.target.value })}
                              placeholder="Duo name (optional)"
                              className="min-w-0 rounded-lg border border-[#687FA3]/30 bg-[#0f1729] px-3 py-1.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40"
                            />
                            <div className="flex gap-3 items-center">
                              <button type="submit" disabled={busy} className={LINK_BUTTON}>
                                Save
                              </button>
                              <button type="button" onClick={() => setRenaming(null)} className={LINK_BUTTON}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <p className="font-bold text-white truncate">{duo.label}</p>
                        )}
                        <p className="text-xs text-[#687FA3] break-words">
                          with {partnerName(duo)}
                          {duo.standing ? ` · ${duo.standing.tierName}` : " · not placed yet"}
                          {duo.strikes > 0 ? ` · ${duo.strikes} strike${duo.strikes === 1 ? "" : "s"}` : ""}
                        </p>
                      </div>
                      {duo.standing && <StarBadge stars={duo.standing.stars} />}
                    </div>

                    {cycleOpen &&
                      (open ? (
                        open.source === "queue" ? (
                          <button
                            type="button"
                            disabled={busy}
                            title="Backing out is subject to penalties"
                            onClick={() => setConfirm({ kind: "backout", duo })}
                            className={DANGER_BUTTON}
                          >
                            Back out
                          </button>
                        ) : null
                      ) : duo.waiting ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act("/api/ladder/duo-queue/leave", "POST", { duoId: duo.duoId }, () => "Your duo left the queue.")
                          }
                          className={SECONDARY_BUTTON}
                        >
                          Leave the queue
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || blockedByOther}
                          title={blockedByOther ? `${busyDuo?.label} is already queued or has a match` : undefined}
                          onClick={() =>
                            act("/api/ladder/duo-queue/join", "POST", { duoId: duo.duoId }, (json) =>
                              json.matchId
                                ? "Matched! Check your email for the details."
                                : "Your duo is in the queue. We'll email you both when you're matched.",
                            )
                          }
                          className={PRIMARY_BUTTON}
                        >
                          Queue this duo
                        </button>
                      ))}
                  </div>

                  {open && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-slate-300">
                      <Swords className="w-4 h-4 mt-0.5 shrink-0 text-[#00C8DC]" />
                      <div className="min-w-0">
                        <p className="break-words">
                          <span className="font-semibold text-white">{open.team1.label}</span>
                          <span className="text-[#687FA3]"> vs </span>
                          <span className="font-semibold text-white">{open.team2.label}</span>
                          <span className="text-[#687FA3]">
                            {open.status === "scheduled" ? " · scheduled" : " · not scheduled yet"}
                          </span>
                        </p>
                        {open.playByAt && (
                          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-amber-300/80">
                            Play by {formatPlayBy(open.playByAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {!open && duo.waiting && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-[#687FA3]">
                      <Clock className="w-4 h-4 shrink-0 text-[#00C8DC]" />
                      In the {duo.waiting.tierName} duo queue · {duo.waiting.waitingCount} waiting · #
                      {duo.waiting.position} in line
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRenaming({ duoId: duo.duoId, value: duo.name ?? "" })}
                      className={LINK_BUTTON}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busy || !!open}
                      title={open ? "Finish or back out of the open match first" : undefined}
                      onClick={() => setConfirm({ kind: "dissolve", duo })}
                      className={`${LINK_BUTTON} hover:text-rose-300`}
                    >
                      Dissolve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="mt-4 flex flex-col gap-1.5">
            {outgoing.map((duo) => (
              <div key={duo.duoId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#687FA3]">
                <span className="min-w-0 break-words">
                  Waiting for {partnerName(duo)} to accept your invite
                  {inviteExpiresAt(duo.invitedAt)
                    ? ` · expires ${formatPlayBy(inviteExpiresAt(duo.invitedAt)!.toISOString())}`
                    : ""}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(`/api/ladder/duos/${duo.duoId}/withdraw`, "POST", undefined, () => "Invite withdrawn.")
                  }
                  className={LINK_BUTTON}
                >
                  Withdraw
                </button>
              </div>
            ))}
          </div>
        )}

        {state && duos.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
          <p className="mt-4 text-sm text-[#687FA3]">You&apos;re not in a duo yet. Invite a partner to get started.</p>
        )}
      </div>

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a duo partner" maxWidth="sm">
        <div className="space-y-4">
          <PlayerSlotPicker
            label="Partner"
            suggestions={suggestions}
            selectedPlayer={partner}
            search={search}
            onSearchChange={setSearch}
            onSelect={setPartner}
            onClear={() => setPartner(null)}
          />
          <label className="block">
            <span className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Duo name (optional)
            </span>
            <input
              value={duoName}
              maxLength={DUO_NAME_MAX_LENGTH}
              onChange={(e) => setDuoName(e.target.value)}
              placeholder="e.g. Net Ninjas"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40"
            />
          </label>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your duo is placed by the average of your two ratings. Duo matches only move your duo&apos;s
            stars — your solo ladder standing isn&apos;t affected.
          </p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" onClick={() => setInviteOpen(false)} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="button" disabled={busy || !partner} onClick={() => void sendInvite()} className={PRIMARY_BUTTON}>
              Send invite
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirm?.kind === "backout"}
        onClose={() => setConfirm(null)}
        title="Back your duo out of this match?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-3 py-2.5">
            <p className="text-sm font-bold text-rose-300">Backing out is subject to penalties.</p>
            <p className="mt-1 text-sm text-rose-200/80 leading-relaxed">
              It&apos;s recorded against your duo, and an admin may deduct a star. Your partner will be
              told.
            </p>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            The match is cancelled and the other duo goes straight back into the queue at its original
            spot.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" onClick={() => setConfirm(null)} className={SECONDARY_BUTTON}>
              Keep the match
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const matchId = confirm?.kind === "backout" ? confirm.duo.openMatch?.matchId : null;
                setConfirm(null);
                if (matchId) {
                  void act(`/api/ladder/duo-queue/matches/${matchId}/backout`, "POST", undefined, () =>
                    "Your duo backed out. The other duo is back in the queue.",
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

      <Modal
        isOpen={confirm?.kind === "dissolve"}
        onClose={() => setConfirm(null)}
        title="Dissolve this duo?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            {confirm?.kind === "dissolve" ? confirm.duo.label : "This duo"} will leave the Duo Ladder and
            any queue spot is dropped. Its results so far are kept — if you team up again later, the duo
            picks up where it left off this cycle.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" onClick={() => setConfirm(null)} className={SECONDARY_BUTTON}>
              Keep the duo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const duoId = confirm?.kind === "dissolve" ? confirm.duo.duoId : null;
                setConfirm(null);
                if (duoId) {
                  void act(`/api/ladder/duos/${duoId}/dissolve`, "POST", undefined, () => "Duo dissolved.");
                }
              }}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-xl bg-rose-500/90 text-white text-sm font-bold transition-colors cursor-pointer hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Dissolve
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
