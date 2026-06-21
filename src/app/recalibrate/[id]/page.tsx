"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import PlayerCard from "@/components/PlayerCard";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import SimilarPlayersSection from "@/app/dashboard/SimilarPlayersSection";
import { InitialRatingInput } from "@/components/InitialRatingInput";
import { RatingCalibrationHelper } from "@/components/RatingCalibrationHelper";
import { supabase } from "@/lib/supabase";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import type { Player } from "@/lib/types";

const MIN_RESPONDENTS = 3;

type RequestStatus = "pending" | "resolved" | "cancelled";
type RequestOutcome = "retained" | "updated" | null;

type RequestDetail = {
  id: number;
  player_id: number;
  status: RequestStatus;
  outcome: RequestOutcome;
  rating_at_request: number;
  requestor_notes: string | null;
  computed_average: number | null;
  resolved_rating: number | null;
  admin_notes: string | null;
  requested_at: string;
  resolved_at: string | null;
};

type RequestorPlayer = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
  initial_rating: number | null;
  latest_rating: number | null;
};

type RespondentRow = {
  id: number;
  recalibration_id: number;
  player_id: number;
  rating: number | null;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
  player?: { player_id: number; name: string | null; nickname: string | null; image_link: string | null } | null;
};

type DetailResponse = {
  role: "admin" | "respondent";
  request: RequestDetail;
  requestorPlayer: RequestorPlayer | null;
  respondents: RespondentRow[] | null;
  myRespondentRow: RespondentRow | null;
};

type PageState =
  | { stage: "loading" }
  | { stage: "unauthenticated" }
  | { stage: "forbidden" }
  | { stage: "not-found" }
  | { stage: "error"; message: string }
  | { stage: "loaded"; data: DetailResponse };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function AddCalibratorPanel({
  requestId,
  existingPlayerIds,
  requestorPlayerId,
  onAdded,
}: {
  requestId: number;
  existingPlayerIds: number[];
  requestorPlayerId: number;
  onAdded: (respondent: RespondentRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const { players } = usePlayers({
    orderByName: true,
    select: "player_id, name, nickname",
  });
  const filtered = players.filter(
    (p) => !existingPlayerIds.includes(Number(p.player_id)) && Number(p.player_id) !== requestorPlayerId,
  );
  const suggestions = usePlayerSearch(filtered, search);

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    setAddError(null);

    const headers = await authHeader();
    const res = await fetch(`/api/recalibration/${requestId}/respondents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ player_id: Number(selected.player_id) }),
    });

    const json = await res.json();
    setAdding(false);

    if (!res.ok) {
      setAddError(json.error ?? "Failed to add calibrator.");
      return;
    }

    onAdded(json.respondent as RespondentRow);
    setSelected(null);
    setSearch("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3.5 px-5 rounded-xl bg-[#00C8DC]/10 hover:bg-[#00C8DC]/20 border border-[#00C8DC]/40 hover:border-[#00C8DC]/70 text-[#00C8DC] font-bold text-sm transition-colors cursor-pointer"
      >
        + Add Calibrator
      </button>
    );
  }

  return (
    <div className="border border-[#00C8DC]/30 bg-[#00C8DC]/5 rounded-2xl p-5 space-y-3">
      <p className="text-xs font-bold text-[#00C8DC] uppercase tracking-widest">Add Calibrator</p>
      {selected ? (
        <div className="flex items-center justify-between gap-3 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5">
          <div>
            <p className="text-sm font-medium text-white">{selected.name}</p>
            {selected.nickname && <p className="text-xs text-[#687FA3]">{selected.nickname}</p>}
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs font-bold text-[#687FA3] hover:text-white cursor-pointer"
          >
            Change
          </button>
        </div>
      ) : (
        <PlayerSearchBox
          value={search}
          suggestions={suggestions}
          onValueChange={setSearch}
          onSelectPlayer={(p) => {
            setSelected(p);
            setSearch("");
          }}
          onClear={() => setSearch("")}
          placeholder="Search by name or nickname..."
        />
      )}
      {addError && <p className="text-red-400 text-sm">{addError}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!selected || adding}
          className="bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-bold text-sm px-5 py-2 rounded-xl transition-colors cursor-pointer"
        >
          {adding ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSelected(null);
            setSearch("");
            setAddError(null);
          }}
          className="text-sm text-[#687FA3] hover:text-white px-4 py-2 rounded-xl transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RespondentsAdminList({ respondents }: { respondents: RespondentRow[] }) {
  if (respondents.length === 0) {
    return <p className="text-sm text-[#687FA3]">No calibrators added yet.</p>;
  }

  return (
    <div className="space-y-2">
      {respondents.map((r) => (
        <div
          key={r.id}
          className="flex items-start justify-between gap-3 border border-white/10 rounded-xl px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {r.player?.name ?? "Unknown player"}
              {r.player?.nickname && (
                <span className="text-[#687FA3] font-normal ml-1.5">{r.player.nickname}</span>
              )}
            </p>
            {r.notes && <p className="text-xs text-[#687FA3] mt-1 leading-relaxed">{r.notes}</p>}
          </div>
          {r.rating != null ? (
            <span className="shrink-0 text-sm font-bold tabular-nums text-sky-300 bg-sky-900/30 border border-sky-700/60 rounded-full px-3 py-1">
              {r.rating.toFixed(2)}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-[#687FA3] bg-white/5 border border-white/10 rounded-full px-3 py-1">
              Awaiting
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function MyResponseForm({
  requestId,
  myRespondentRow,
  requestorPlayerId,
  locked,
  onSaved,
}: {
  requestId: number;
  myRespondentRow: RespondentRow;
  requestorPlayerId: number;
  locked: boolean;
  onSaved: (respondent: RespondentRow) => void;
}) {
  const [rating, setRating] = useState(myRespondentRow.rating != null ? String(myRespondentRow.rating) : "");
  const [notes, setNotes] = useState(myRespondentRow.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const ratingNum = Number(rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 0) {
      setError("Enter a valid non-negative rating.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const headers = await authHeader();
    const res = await fetch(`/api/recalibration/${requestId}/respondents/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ rating: ratingNum, notes: notes || undefined }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to save.");
      return;
    }

    onSaved(json.respondent as RespondentRow);
    setSaved(true);
  }

  if (locked) {
    return (
      <div className="border border-white/10 rounded-2xl p-5 space-y-2">
        <div className="flex items-center gap-3 text-sm">
          {myRespondentRow.rating != null ? (
            <span className="bg-[#0E1523] border border-[#687FA3]/20 rounded-full px-3 py-1 text-sm font-semibold text-white">
              {myRespondentRow.rating}
            </span>
          ) : (
            <span className="text-[#687FA3] italic text-xs">No rating given</span>
          )}
        </div>
        {myRespondentRow.notes && (
          <p className="text-sm text-white/70 whitespace-pre-wrap">{myRespondentRow.notes}</p>
        )}
        <p className="text-xs text-[#687FA3]">This request is no longer open for input.</p>
      </div>
    );
  }

  return (
    <div className="border border-[#00C8DC]/20 bg-[#00C8DC]/5 rounded-2xl p-5 space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3] mb-1">
            Your Rating
          </label>
          <InitialRatingInput
            value={rating}
            onChange={(v) => {
              setRating(v);
              setSaved(false);
            }}
            className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-bold text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      <RatingCalibrationHelper
        currentPlayerId={requestorPlayerId}
        rating={rating}
        onRatingChange={(v) => {
          setRating(v);
          setSaved(false);
        }}
      />

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          maxLength={1000}
          rows={3}
          placeholder="Why do you think this rating fits?"
          className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

function ResolutionPanel({
  requestId,
  ratingAtRequest,
  computedAverage,
  ratedCount,
  onResolved,
}: {
  requestId: number;
  ratingAtRequest: number;
  computedAverage: number | null;
  ratedCount: number;
  onResolved: (request: RequestDetail) => void;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<"retain" | "update" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notEnoughRatings = ratedCount < MIN_RESPONDENTS;
  const delta = computedAverage != null ? computedAverage - ratingAtRequest : null;
  const suggestion = notEnoughRatings
    ? `Waiting for at least ${MIN_RESPONDENTS} calibrator ratings (${ratedCount} so far).`
    : delta == null
      ? "No respondent ratings submitted yet."
      : delta >= 0.8 || delta < 0
        ? "Suggested: Accept New Rating"
        : "Suggested: Retain Current Rating";

  async function resolve(outcome: "retained" | "updated") {
    setSubmitting(outcome === "retained" ? "retain" : "update");
    setError(null);
    const headers = await authHeader();
    const res = await fetch(`/api/recalibration/${requestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ outcome, admin_notes: notes || undefined }),
    });
    const json = await res.json();
    setSubmitting(null);
    if (!res.ok) {
      setError(json.error ?? "Failed to resolve request.");
      return;
    }
    onResolved(json.request as RequestDetail);
  }

  async function cancel() {
    setSubmitting("cancel");
    setError(null);
    const headers = await authHeader();
    const res = await fetch(`/api/recalibration/${requestId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ admin_notes: notes || undefined }),
    });
    const json = await res.json();
    setSubmitting(null);
    if (!res.ok) {
      setError(json.error ?? "Failed to cancel request.");
      return;
    }
    onResolved(json.request as RequestDetail);
  }

  return (
    <div className="border border-white/10 rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">Review</p>
        <p className="text-sm text-white/80">
          Current rating: <strong>{ratingAtRequest.toFixed(2)}</strong>
          {" · "}
          Computed average: <strong>{computedAverage != null ? computedAverage.toFixed(2) : "—"}</strong>
        </p>
        <p className="text-xs text-[#687FA3] mt-1">{suggestion}</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
          Admin notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Optional notes for the record..."
          className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => resolve("retained")}
          disabled={submitting !== null || notEnoughRatings}
          className="flex-1 bg-[#1a2540] hover:bg-[#1e2d50] border border-[#687FA3]/20 text-white font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "retain" ? "Submitting…" : "Retain Current Rating"}
        </button>
        <button
          type="button"
          onClick={() => resolve("updated")}
          disabled={submitting !== null || notEnoughRatings || computedAverage == null}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
        >
          {submitting === "update" ? "Submitting…" : "Accept New Rating"}
        </button>
      </div>

      <div className="border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={cancel}
          disabled={submitting !== null}
          className="text-xs font-bold uppercase tracking-widest text-red-400/70 hover:text-red-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "cancel" ? "Cancelling…" : "Cancel Request"}
        </button>
      </div>
    </div>
  );
}

function ResolvedSummary({ request }: { request: RequestDetail }) {
  if (request.status === "cancelled") {
    return (
      <div className="border border-red-500/20 bg-red-500/5 rounded-2xl p-5 space-y-1">
        <p className="text-sm font-bold text-red-400">Request Cancelled</p>
        {request.admin_notes && (
          <p className="text-xs text-red-300/70 leading-relaxed">{request.admin_notes}</p>
        )}
        {request.resolved_at && (
          <p className="text-[11px] text-[#687FA3]">{formatDate(request.resolved_at)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-5 space-y-1">
      <p className="text-sm font-bold text-emerald-400">
        {request.outcome === "updated" ? "Rating Updated" : "Rating Retained"}
      </p>
      <p className="text-xs text-white/70">
        {request.outcome === "updated"
          ? `${request.rating_at_request.toFixed(2)} → ${request.resolved_rating?.toFixed(2)}`
          : `Stayed at ${request.rating_at_request.toFixed(2)}`}
      </p>
      {request.admin_notes && (
        <p className="text-xs text-[#687FA3] leading-relaxed mt-1">{request.admin_notes}</p>
      )}
      {request.resolved_at && (
        <p className="text-[11px] text-[#687FA3]">{formatDate(request.resolved_at)}</p>
      )}
    </div>
  );
}

export default function RecalibrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<PageState>({ stage: "loading" });

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setState({ stage: "unauthenticated" });
      return;
    }

    const res = await fetch(`/api/recalibration/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.status === 403) {
      setState({ stage: "forbidden" });
      return;
    }
    if (res.status === 404) {
      setState({ stage: "not-found" });
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setState({ stage: "error", message: body.error ?? `Server error (${res.status})` });
      return;
    }

    const json = (await res.json()) as DetailResponse;
    setState({ stage: "loaded", data: json });
  }

  useEffect(() => {
    void load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.stage === "unauthenticated" || state.stage === "forbidden" || state.stage === "not-found") {
    const message =
      state.stage === "unauthenticated"
        ? "Sign in to view this page."
        : state.stage === "forbidden"
          ? "You don't have access to this recalibration request."
          : "Recalibration request not found.";
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-white/60 text-sm text-center max-w-sm">{message}</p>
        </div>
      </div>
    );
  }

  if (state.stage === "error") {
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-2 max-w-sm">
            <p className="text-white/60 text-sm">Something went wrong.</p>
            <p className="text-white/30 text-xs font-mono">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const { role, request, requestorPlayer, respondents, myRespondentRow } = state.data;
  const isAdmin = role === "admin";
  const isPending = request.status === "pending";

  const submittedRatings = (respondents ?? [])
    .map((r) => r.rating)
    .filter((r): r is number => r != null);
  const computedAverage =
    submittedRatings.length > 0
      ? submittedRatings.reduce((sum, r) => sum + r, 0) / submittedRatings.length
      : null;

  const playerForCard: Player = {
    player_id: requestorPlayer?.player_id ?? request.player_id,
    name: requestorPlayer?.name ?? "Unknown",
    nickname: requestorPlayer?.nickname ?? "",
    image_link: requestorPlayer?.image_link ?? null,
    latest_rating: requestorPlayer?.latest_rating ?? request.rating_at_request,
  };

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />

      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
        <div>
          <Link
            href={isAdmin ? "/recalibrate" : "/dashboard"}
            className="text-xs font-bold text-[#687FA3] hover:text-white transition-colors"
          >
            ← {isAdmin ? "All requests" : "Back to dashboard"}
          </Link>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter mt-2">
            Recalibration Request
          </h1>
          <p className="text-white/50 text-sm mt-1">Requested {formatDate(request.requested_at)}</p>
        </div>

        <PlayerCard player={playerForCard} size="lg" showLatestRating disableLink={!isAdmin} />

        {request.requestor_notes && (
          <div className="border border-white/10 rounded-2xl p-4">
            <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
              From the requestor
            </p>
            <p className="text-sm text-white/80 leading-relaxed">{request.requestor_notes}</p>
          </div>
        )}

        {!myRespondentRow && (
          <SimilarPlayersSection
            playerId={playerForCard.player_id}
            currentPlayerRating={playerForCard.latest_rating ?? null}
          />
        )}

        {isAdmin && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">Calibrators</p>
            <RespondentsAdminList respondents={respondents ?? []} />
            {isPending && (
              <AddCalibratorPanel
                requestId={request.id}
                existingPlayerIds={(respondents ?? []).map((r) => r.player_id)}
                requestorPlayerId={request.player_id}
                onAdded={(respondent) =>
                  setState((prev) =>
                    prev.stage === "loaded"
                      ? {
                          ...prev,
                          data: {
                            ...prev.data,
                            respondents: [...(prev.data.respondents ?? []), respondent],
                          },
                        }
                      : prev,
                  )
                }
              />
            )}
          </div>
        )}

        {myRespondentRow && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">Your Assessment</p>
            <MyResponseForm
              requestId={request.id}
              myRespondentRow={myRespondentRow}
              requestorPlayerId={request.player_id}
              locked={!isPending}
              onSaved={(respondent) =>
                setState((prev) =>
                  prev.stage === "loaded" ? { ...prev, data: { ...prev.data, myRespondentRow: respondent } } : prev,
                )
              }
            />
          </div>
        )}

        {isAdmin && isPending && (
          <ResolutionPanel
            requestId={request.id}
            ratingAtRequest={request.rating_at_request}
            computedAverage={computedAverage}
            ratedCount={submittedRatings.length}
            onResolved={(updated) =>
              setState((prev) =>
                prev.stage === "loaded" ? { ...prev, data: { ...prev.data, request: updated } } : prev,
              )
            }
          />
        )}

        {!isPending && <ResolvedSummary request={request} />}
      </div>
    </div>
  );
}
