"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import PlayerCard from "@/components/PlayerCard";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import RecalibrationSurveyModal from "./RecalibrationSurveyModal";
import { supabase } from "@/lib/supabase";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import type { Player } from "@/lib/types";
import type { SurveyChoice, SurveyState } from "@/lib/recalibration/survey";

const MIN_RESPONDENTS = 3;

const CHOICE_LABELS: Record<SurveyChoice, string> = {
  significantly_better: "Significantly better",
  slightly_better: "Slightly better",
  relatively_same: "Relatively the same",
  slightly_worse: "Slightly worse",
  significantly_worse: "Significantly worse",
  dont_know: "Didn't know",
};

type RequestStatus = "pending" | "resolved" | "cancelled";
type RequestOutcome = "retained" | "updated" | null;

type RequestDetail = {
  id: number;
  player_id: number;
  status: RequestStatus;
  outcome: RequestOutcome;
  // Rating fields are stripped from the response for non-admin respondents.
  rating_at_request: number | null;
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
  initial_rating?: number | null;
  latest_rating?: number | null;
};

type SurveySummary = { status: "in_progress" | "complete"; answeredCount: number };

type RespondentRow = {
  id: number;
  recalibration_id: number;
  player_id: number;
  rating: number | null;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
  survey_answers?: SurveyState | null;
  player?: { player_id: number; name: string | null; nickname: string | null; image_link: string | null } | null;
};

// The caller's own respondent row. Respondents get a sanitized shape (no rating,
// only a survey status summary); an admin who is also a respondent gets the full row.
type MyRespondentRow = {
  id: number;
  recalibration_id: number;
  player_id: number;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
  survey?: SurveySummary | null;
  rating?: number | null;
  survey_answers?: SurveyState | null;
};

type DetailResponse = {
  role: "admin" | "respondent";
  request: RequestDetail;
  requestorPlayer: RequestorPlayer | null;
  respondents: RespondentRow[] | null;
  myRespondentRow: MyRespondentRow | null;
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

function RespondentSurveyTrail({ survey }: { survey: SurveyState }) {
  const answered = survey.questions.filter((q) => q.choice != null);
  if (answered.length === 0) {
    return <p className="text-xs text-[#687FA3] italic">No comparisons answered yet.</p>;
  }
  return (
    <ol className="space-y-1.5">
      {answered.map((q) => (
        <li key={q.order} className="flex items-center justify-between gap-3 text-xs">
          <span className="text-white/70 truncate">
            {q.anchorPlayerName ?? "Unknown player"}
            {q.anchorPlayerNickname && (
              <span className="text-[#687FA3]"> · {q.anchorPlayerNickname}</span>
            )}
          </span>
          <span
            className={`shrink-0 font-bold ${
              q.choice === "dont_know" ? "text-[#687FA3]" : "text-white/80"
            }`}
          >
            {CHOICE_LABELS[q.choice as SurveyChoice]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RespondentsAdminList({ respondents }: { respondents: RespondentRow[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (respondents.length === 0) {
    return <p className="text-sm text-[#687FA3]">No calibrators added yet.</p>;
  }

  return (
    <div className="space-y-2">
      {respondents.map((r) => {
        const survey = r.survey_answers ?? null;
        const hasTrail = !!survey && survey.questions.length > 0;
        const isOpen = expanded === r.id;
        return (
          <div key={r.id} className="border border-white/10 rounded-xl px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {r.player?.name ?? "Unknown player"}
                  {r.player?.nickname && (
                    <span className="text-[#687FA3] font-normal ml-1.5">{r.player.nickname}</span>
                  )}
                </p>
                {r.notes && <p className="text-xs text-[#687FA3] mt-1 leading-relaxed">{r.notes}</p>}
                {hasTrail && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="mt-1.5 text-[11px] font-bold uppercase tracking-widest text-[#00C8DC]/70 hover:text-[#00C8DC] transition-colors cursor-pointer"
                  >
                    {isOpen ? "Hide comparisons" : `View comparisons (${survey!.questions.filter((q) => q.choice != null).length})`}
                  </button>
                )}
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
            {hasTrail && isOpen && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <RespondentSurveyTrail survey={survey!} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MyResponseForm({
  requestId,
  myRespondentRow,
  calibratee,
  locked,
  onNotesSaved,
  onSurveyCompleted,
}: {
  requestId: number;
  myRespondentRow: MyRespondentRow;
  calibratee: { name: string | null; nickname: string | null; image_link: string | null };
  locked: boolean;
  onNotesSaved: (notes: string | null) => void;
  onSurveyCompleted: () => void;
}) {
  const [notes, setNotes] = useState(myRespondentRow.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const surveyStatus =
    myRespondentRow.survey?.status ?? myRespondentRow.survey_answers?.status ?? null;
  const completed = surveyStatus === "complete";

  async function handleSaveNotes() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const headers = await authHeader();
    const res = await fetch(`/api/recalibration/${requestId}/respondents/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ notes }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to save.");
      return;
    }
    onNotesSaved(notes.trim() ? notes.trim() : null);
    setSaved(true);
  }

  if (locked) {
    return (
      <div className="border border-white/10 rounded-2xl p-5 space-y-2">
        {completed || myRespondentRow.submitted_at ? (
          <p className="text-sm font-bold text-emerald-300">Assessment recorded ✓</p>
        ) : (
          <p className="text-[#687FA3] italic text-xs">No assessment given</p>
        )}
        {myRespondentRow.notes && (
          <p className="text-sm text-white/70 whitespace-pre-wrap">{myRespondentRow.notes}</p>
        )}
        <p className="text-xs text-[#687FA3]">This request is no longer open for input.</p>
      </div>
    );
  }

  const startLabel =
    surveyStatus === "in_progress" ? "Resume recalibration" : "Start recalibration";

  return (
    <div className="border border-[#00C8DC]/20 bg-[#00C8DC]/5 rounded-2xl p-5 space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-white/80 leading-relaxed">
          Rather than guessing a number, you&apos;ll answer a short series of head-to-head
          comparisons against other players. We combine your answers into a rating —
          you&apos;ll never need to see or pick a number.
        </p>

        {completed ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
              Assessment recorded ✓
            </span>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-xs font-bold uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors cursor-pointer"
            >
              Retake
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="w-full bg-[#00C8DC] hover:bg-white text-[#0E1523] font-black py-3 px-5 rounded-xl text-sm transition-colors cursor-pointer"
          >
            {startLabel}
          </button>
        )}
      </div>

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
          placeholder="Anything the committee should know about this player?"
          className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
        />
        <button
          type="button"
          onClick={handleSaveNotes}
          disabled={saving}
          className="text-xs font-bold text-[#00C8DC] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {saving ? "Saving notes…" : saved ? "Notes saved ✓" : "Save notes"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {modalOpen && (
        <RecalibrationSurveyModal
          onClose={() => setModalOpen(false)}
          requestId={requestId}
          calibratee={calibratee}
          onCompleted={onSurveyCompleted}
        />
      )}
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
  ratingAtRequest: number | null;
  computedAverage: number | null;
  ratedCount: number;
  onResolved: (request: RequestDetail) => void;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<"retain" | "update" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notEnoughRatings = ratedCount < MIN_RESPONDENTS;
  const delta =
    computedAverage != null && ratingAtRequest != null ? computedAverage - ratingAtRequest : null;
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
          Current rating: <strong>{ratingAtRequest != null ? ratingAtRequest.toFixed(2) : "—"}</strong>
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

  const hasNumbers = request.rating_at_request != null;
  return (
    <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-5 space-y-1">
      <p className="text-sm font-bold text-emerald-400">
        {request.outcome === "updated" ? "Rating Updated" : "Rating Retained"}
      </p>
      {hasNumbers && (
        <p className="text-xs text-white/70">
          {request.outcome === "updated"
            ? `${request.rating_at_request!.toFixed(2)} → ${request.resolved_rating?.toFixed(2)}`
            : `Stayed at ${request.rating_at_request!.toFixed(2)}`}
        </p>
      )}
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

        <PlayerCard player={playerForCard} size="lg" showLatestRating={isAdmin} disableLink={!isAdmin} />

        {request.requestor_notes && (
          <div className="border border-white/10 rounded-2xl p-4">
            <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
              From the requestor
            </p>
            <p className="text-sm text-white/80 leading-relaxed">{request.requestor_notes}</p>
          </div>
        )}

        {myRespondentRow && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">Your Assessment</p>
            <p className="text-xs text-[#9aabc7] leading-relaxed bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              Your rating and notes are anonymous — the player being recalibrated will never see who responded or what was submitted. You were selected by the committee specifically to avoid bias among players with the most recent matches against them.
            </p>
            <MyResponseForm
              requestId={request.id}
              myRespondentRow={myRespondentRow}
              calibratee={{
                name: requestorPlayer?.name ?? null,
                nickname: requestorPlayer?.nickname ?? null,
                image_link: requestorPlayer?.image_link ?? null,
              }}
              locked={!isPending}
              onNotesSaved={(notes) =>
                setState((prev) =>
                  prev.stage === "loaded" && prev.data.myRespondentRow
                    ? {
                        ...prev,
                        data: {
                          ...prev.data,
                          myRespondentRow: { ...prev.data.myRespondentRow, notes },
                        },
                      }
                    : prev,
                )
              }
              onSurveyCompleted={() =>
                setState((prev) =>
                  prev.stage === "loaded" && prev.data.myRespondentRow
                    ? {
                        ...prev,
                        data: {
                          ...prev.data,
                          myRespondentRow: {
                            ...prev.data.myRespondentRow,
                            submitted_at: new Date().toISOString(),
                            survey: {
                              status: "complete",
                              answeredCount: prev.data.myRespondentRow.survey?.answeredCount ?? 0,
                            },
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
              Admin Only
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
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
