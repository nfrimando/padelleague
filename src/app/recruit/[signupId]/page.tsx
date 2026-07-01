"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SignInPrompt from "@/components/SignInPrompt";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { supabase } from "@/lib/supabase";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { MIN_REFERRER_RATINGS } from "@/lib/recruitConfig";
import type {
  SignupPlayersReferrer,
  MembershipApplication,
  Player,
} from "@/lib/types";
import { InitialRatingInput } from "@/components/InitialRatingInput";
import ImageLightbox from "@/components/ImageLightbox";
import RecruitSurveyModal from "./RecruitSurveyModal";

type RecruitSignup = Pick<
  MembershipApplication,
  | "id"
  | "status"
  | "applicant_name"
  | "applicant_nickname"
  | "applicant_contact"
  | "applicant_email"
  | "created_at"
> & { applicant_image_url?: string | null; notes?: string | null };

type ApplicantInfo = {
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

type RecruitPageState =
  | { stage: "loading" }
  | { stage: "unauthenticated" }
  | { stage: "not-member" }
  | { stage: "error"; message: string }
  | {
      stage: "loaded";
      signup: RecruitSignup;
      isAdmin: boolean;
      referrers: SignupPlayersReferrer[];
      myReferrerRow: SignupPlayersReferrer | null;
    };

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

function obfuscateEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  const obfLocal =
    local.length > 2
      ? local[0] + "*".repeat(Math.min(local.length - 1, 4))
      : local[0] + "*";
  const domainParts = domain.split(".");
  const domainName = domainParts[0];
  const tld = domainParts.slice(1).join(".");
  const obfDomain =
    domainName.length > 2
      ? domainName[0] + "*".repeat(Math.min(domainName.length - 1, 3)) + "." + tld
      : domainName + "." + tld;
  return `${obfLocal}@${obfDomain}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ApplicantCard({
  signup,
  canSeeContact,
}: {
  signup: RecruitSignup;
  canSeeContact: boolean;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const initials = (signup.applicant_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border border-white/10 rounded-2xl p-6 space-y-4">
      <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">
        Applicant
      </p>
      <div className="flex items-center gap-4">
        {signup.applicant_image_url ? (
          <>
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="shrink-0 cursor-zoom-in rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00C8DC]/60"
              aria-label="View enlarged photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signup.applicant_image_url}
                alt={signup.applicant_name ?? "Applicant"}
                className="w-16 h-16 rounded-full object-cover"
              />
            </button>
            <ImageLightbox
              isOpen={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              src={signup.applicant_image_url}
              alt={signup.applicant_name ?? "Applicant"}
            />
          </>
        ) : (
          <div className="w-16 h-16 rounded-full bg-[#687FA3]/20 shrink-0 flex items-center justify-center text-[#687FA3] font-bold text-lg">
            {initials}
          </div>
        )}
        <div>
          <p className="text-xl font-bold text-white">
            {signup.applicant_name ?? "—"}
          </p>
          {signup.applicant_nickname && (
            <p className="text-sm text-[#687FA3]">
              {signup.applicant_nickname}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {signup.applicant_contact && (
          <div>
            <p className="text-xs text-[#687FA3]">Contact</p>
            <p
              className={`text-white${canSeeContact ? "" : " blur-sm select-none"}`}
            >
              {signup.applicant_contact}
            </p>
          </div>
        )}
        {signup.applicant_email && (
          <div>
            <p className="text-xs text-[#687FA3]">Email</p>
            <p className="text-white/70 break-all">
              {obfuscateEmail(signup.applicant_email)}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-[#687FA3]">Applied</p>
          <p className="text-white">{formatDate(signup.created_at)}</p>
        </div>
        <div>
          <p className="text-xs text-[#687FA3]">Status</p>
          <p
            className={
              signup.status === "accepted"
                ? "text-emerald-400 font-bold"
                : signup.status === "cancelled"
                  ? "text-red-400 font-bold"
                  : "text-amber-400"
            }
          >
            {signup.status === "accepted"
              ? "Recruited"
              : signup.status === "cancelled"
                ? "Cancelled"
                : "Pending"}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The signed-in member's own assessment: a comparison survey (never a number). Mirrors
 * the recalibration MyResponseForm. If the member has no referrer row yet and the
 * application is still open, they can add themselves as a voluntary assessor first.
 */
function MyAssessmentPanel({
  signupId,
  applicant,
  myReferrerRow,
  currentPlayerId,
  isLocked,
  onRowCreated,
  onNotesSaved,
  onSurveyCompleted,
}: {
  signupId: string;
  applicant: ApplicantInfo;
  myReferrerRow: SignupPlayersReferrer | null;
  currentPlayerId: number | null;
  isLocked: boolean;
  onRowCreated: () => void;
  onNotesSaved: (notes: string | null) => void;
  onSurveyCompleted: () => void;
}) {
  const [notes, setNotes] = useState(myReferrerRow?.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const surveyStatus = myReferrerRow?.survey?.status ?? null;
  const completed = surveyStatus === "complete";

  async function handleSelfAdd() {
    if (currentPlayerId === null) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/recruit/${signupId}/referrers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ player_id: currentPlayerId }),
    });
    const json = await res.json();
    setAdding(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to add your assessment.");
      return;
    }
    onRowCreated();
  }

  async function handleSaveNotes() {
    if (!myReferrerRow) return;
    setSavingNotes(true);
    setError(null);
    setNotesSaved(false);
    const res = await fetch(
      `/api/recruit/${signupId}/referrers/${myReferrerRow.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ notes: notes.trim() || null }),
      },
    );
    const json = await res.json();
    setSavingNotes(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to save notes.");
      return;
    }
    onNotesSaved(notes.trim() ? notes.trim() : null);
    setNotesSaved(true);
  }

  // No row yet — offer to add themselves (only while the application is open).
  if (!myReferrerRow) {
    if (isLocked || currentPlayerId === null) return null;
    return (
      <div className="space-y-3">
        <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">
          Your Assessment
        </p>
        <div className="border border-dashed border-violet-400/20 rounded-2xl p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-white">
              Assess this applicant
            </p>
            <p className="text-xs text-[#687FA3] mt-1">
              You can voluntarily assess this applicant even if they didn&apos;t
              list you as a referrer. You&apos;ll answer a short series of
              head-to-head comparisons — no number to pick. Your input is counted
              equally.
            </p>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="button"
            onClick={handleSelfAdd}
            disabled={adding}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {adding ? "Adding…" : "Add my assessment"}
          </button>
        </div>
      </div>
    );
  }

  const startLabel =
    surveyStatus === "in_progress" ? "Resume assessment" : "Start assessment";

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">
        Your Assessment
      </p>
      <div className="border border-[#00C8DC]/20 bg-[#00C8DC]/5 rounded-2xl p-5 space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-white/80 leading-relaxed">
            Rather than guessing a number, you&apos;ll answer a short series of
            head-to-head comparisons against other players. We combine your
            answers into a rating — you&apos;ll never need to see or pick a number.
          </p>

          {isLocked ? (
            <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
              {completed ? "Assessment recorded ✓" : "No assessment given"}
            </span>
          ) : completed ? (
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

        {!isLocked && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesSaved(false);
              }}
              maxLength={1000}
              rows={3}
              placeholder="Anything the organizers should know about this player?"
              className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
            />
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="text-xs font-bold text-[#00C8DC] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {savingNotes ? "Saving notes…" : notesSaved ? "Notes saved ✓" : "Save notes"}
            </button>
          </div>
        )}

        {isLocked && myReferrerRow.notes && (
          <p className="text-sm text-white/70 whitespace-pre-wrap">
            {myReferrerRow.notes}
          </p>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {modalOpen && (
          <RecruitSurveyModal
            onClose={() => setModalOpen(false)}
            signupId={signupId}
            applicant={applicant}
            onCompleted={onSurveyCompleted}
          />
        )}
      </div>
    </div>
  );
}

/** Admin-only read-only view of a referrer / community voter's assessment. */
function ReferrerCard({
  referrer,
  isLocked,
  signupId,
  onDeleted,
}: {
  referrer: SignupPlayersReferrer;
  isLocked: boolean;
  signupId: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(
      `/api/recruit/${signupId}/referrers/${referrer.id}`,
      {
        method: "DELETE",
        headers: { ...(await authHeader()) },
      },
    );
    setDeleting(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setDeleteError(json.error ?? "Failed to remove assessment.");
      return;
    }
    onDeleted();
  }

  const referrerPlayer = referrer.referrer as Player | undefined;
  const displayName =
    referrerPlayer?.nickname ??
    referrerPlayer?.name ??
    `Player #${referrer.referrer_player_id}`;
  const ratingDisplay =
    referrer.initial_rating !== null ? String(referrer.initial_rating) : null;
  const completed = referrer.survey?.status === "complete";

  return (
    <div className="border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-white text-sm">{displayName}</p>
          {referrerPlayer?.nickname && referrerPlayer?.name && (
            <p className="text-xs text-[#687FA3]">{referrerPlayer.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!referrer.is_named_referrer && (
            <span className="text-xs font-bold text-violet-400 border border-violet-400/30 px-2 py-0.5 rounded-full">
              Voluntary
            </span>
          )}
          {!isLocked && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-[#687FA3] hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm flex-wrap">
        {ratingDisplay !== null ? (
          <span className="bg-[#0E1523] border border-[#687FA3]/20 rounded-full px-3 py-1 text-sm font-semibold text-white">
            {ratingDisplay}
          </span>
        ) : completed ? (
          <span className="text-emerald-300 text-xs font-bold">
            Assessment recorded ✓
          </span>
        ) : (
          <span className="text-[#687FA3] italic text-xs">
            Awaiting assessment
          </span>
        )}
      </div>

      {referrer.notes && (
        <p className="text-sm text-white/60 whitespace-pre-wrap">
          {referrer.notes}
        </p>
      )}

      {deleteError && <p className="text-red-400 text-xs">{deleteError}</p>}
    </div>
  );
}

function AddReferrerPanel({
  signupId,
  existingPlayerIds,
  onAdded,
}: {
  signupId: string;
  existingPlayerIds: number[];
  onAdded: (referrer: SignupPlayersReferrer) => void;
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
    (p) => !existingPlayerIds.includes(Number(p.player_id)),
  );
  const suggestions = usePlayerSearch(filtered, search);

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    setAddError(null);

    const res = await fetch(`/api/recruit/${signupId}/referrers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ player_id: Number(selected.player_id) }),
    });

    const json = await res.json();
    setAdding(false);

    if (!res.ok) {
      setAddError(json.error ?? "Failed to add referrer.");
      return;
    }

    onAdded(json.referrer as SignupPlayersReferrer);
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
        + Add Referrer
      </button>
    );
  }

  return (
    <div className="border border-[#00C8DC]/30 bg-[#00C8DC]/5 rounded-2xl p-5 space-y-3">
      <p className="text-xs font-bold text-[#00C8DC] uppercase tracking-widest">
        Add Referrer
      </p>
      {selected ? (
        <div className="flex items-center justify-between gap-3 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5">
          <div>
            <p className="text-sm font-medium text-white">{selected.name}</p>
            {selected.nickname && (
              <p className="text-xs text-[#687FA3]">{selected.nickname}</p>
            )}
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

function RecruitModal({
  ratedReferrers,
  avgRating,
  readyToRecruit,
  signupId,
  onClose,
  onRecruited,
}: {
  ratedReferrers: SignupPlayersReferrer[];
  avgRating: number;
  readyToRecruit: boolean;
  signupId: string;
  onClose: () => void;
  onRecruited: () => void;
}) {
  const [override, setOverride] = useState(avgRating > 0 ? avgRating.toFixed(2) : "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const trimmed = override.trim();
  const num = trimmed ? Number(trimmed) : NaN;
  const hasValidOverride = trimmed !== "" && !isNaN(num) && num >= 0;
  // Below the survey minimum, a direct rating is required; at/above it, the field is
  // prefilled with the average and only sent when the admin actually changes it.
  const confirmDisabled = confirming || (!readyToRecruit && !hasValidOverride);

  async function handleConfirm() {
    setConfirming(true);
    setError(null);

    const isOverride = hasValidOverride && (num !== avgRating || !readyToRecruit);

    const res = await fetch(`/api/recruit/${signupId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(isOverride ? { override_rating: num } : {}),
    });

    const json = await res.json();
    setConfirming(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to recruit.");
      return;
    }

    onRecruited();
  }

  const namedRated = ratedReferrers.filter((r) => r.is_named_referrer);
  const voluntaryRated = ratedReferrers.filter((r) => !r.is_named_referrer);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 cursor-pointer"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-[#0E1523] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-5 cursor-default">
        <div>
          <h2 className="text-lg font-bold text-white">Confirm Recruit</h2>
          <p className="text-sm text-[#687FA3] mt-1">
            This creates a player profile with the final rating below.
          </p>
        </div>

        <div className="border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">
            Survey Ratings
          </p>
          {ratedReferrers.length > 0 ? (
            <div className="space-y-1.5">
              {namedRated.map((r) => {
                const referrerPlayer = r.referrer as Player | undefined;
                const name =
                  referrerPlayer?.nickname ??
                  referrerPlayer?.name ??
                  `#${r.referrer_player_id}`;
                return (
                  <div key={r.id} className="flex justify-between text-sm">
                    <span className="text-[#687FA3]">{name}</span>
                    <span className="text-white font-medium">
                      {r.initial_rating}
                    </span>
                  </div>
                );
              })}
              {voluntaryRated.length > 0 && (
                <>
                  {namedRated.length > 0 && (
                    <div className="border-t border-white/10 pt-2 mt-2">
                      <p className="text-xs text-violet-400 font-bold uppercase tracking-widest mb-1.5">
                        Voluntary
                      </p>
                    </div>
                  )}
                  {voluntaryRated.map((r) => {
                    const referrerPlayer = r.referrer as Player | undefined;
                    const name =
                      referrerPlayer?.nickname ??
                      referrerPlayer?.name ??
                      `#${r.referrer_player_id}`;
                    return (
                      <div key={r.id} className="flex justify-between text-sm">
                        <span className="text-violet-300/70">{name}</span>
                        <span className="text-white font-medium">
                          {r.initial_rating}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
              <div className="border-t border-white/10 pt-3 flex justify-between text-sm font-bold">
                <span className="text-white">Computed Average</span>
                <span className="text-[#00C8DC] text-base">
                  {avgRating.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#687FA3] italic">
              No survey ratings yet — enter a rating below to recruit this
              referral directly.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
            Final Rating
          </label>
          <InitialRatingInput
            value={override}
            onChange={setOverride}
            className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
          />
          <p className="text-[11px] text-[#687FA3]">
            {readyToRecruit
              ? "Prefilled with the survey average — edit to override."
              : "Enter a rating to recruit this referral directly (bypasses the survey minimum)."}
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {confirming ? "Recruiting…" : "Confirm Recruit"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="px-4 text-sm text-[#687FA3] hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelModal({
  applicantName,
  signupId,
  onClose,
  onCancelled,
}: {
  applicantName: string | null;
  signupId: string;
  onClose: () => void;
  onCancelled: (notes: string | null) => void;
}) {
  const [notes, setNotes] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  async function handleConfirm() {
    setCancelling(true);
    setError(null);

    const res = await fetch(`/api/recruit/${signupId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ notes: notes.trim() || null }),
    });

    const json = await res.json();
    setCancelling(false);

    if (!res.ok) {
      setError(json.error ?? "Failed to cancel application.");
      return;
    }

    onCancelled((json.notes as string | null) ?? null);
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 cursor-pointer"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-[#0E1523] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-5 cursor-default">
        <div>
          <h2 className="text-lg font-bold text-white">Cancel Application</h2>
          <p className="text-sm text-[#687FA3] mt-1">
            This marks{" "}
            <span className="text-white font-medium">
              {applicantName ?? "this applicant"}
            </span>
            &apos;s application as cancelled. They will no longer appear in the
            pending recruits list.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — reason for cancelling..."
            rows={3}
            className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-red-400/50 transition-colors resize-none"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={cancelling}
            className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {cancelling ? "Cancelling…" : "Confirm Cancel"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={cancelling}
            className="px-4 text-sm text-[#687FA3] hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Keep
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecruitPage() {
  const { signupId } = useParams<{ signupId: string }>();
  const pathname = usePathname();
  const [state, setState] = useState<RecruitPageState>({ stage: "loading" });
  const [currentPlayerId, setCurrentPlayerId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [recruited, setRecruited] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelledNotes, setCancelledNotes] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setState({ stage: "unauthenticated" });
      return;
    }

    const res = await fetch(`/api/recruit/${signupId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.status === 403) {
      setState({ stage: "not-member" });
      return;
    }
    if (res.status === 401) {
      setState({ stage: "unauthenticated" });
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setState({
        stage: "error",
        message: body.error ?? `Server error (${res.status})`,
      });
      return;
    }

    const json = await res.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      const { data: playerRow } = await supabase
        .from("players")
        .select("player_id")
        .eq("email", user.email)
        .maybeSingle();
      if (playerRow) {
        setCurrentPlayerId(playerRow.player_id as number);
      }
    }

    setState({
      stage: "loaded",
      signup: json.signup as RecruitSignup,
      isAdmin: !!json.isAdmin,
      referrers: (json.referrers ?? []) as SignupPlayersReferrer[],
      myReferrerRow: (json.myReferrerRow ?? null) as SignupPlayersReferrer | null,
    });
  }

  useEffect(() => {
    void load();
  }, [signupId]); // eslint-disable-line react-hooks/exhaustive-deps

  function addReferrer(referrer: SignupPlayersReferrer) {
    if (state.stage !== "loaded") return;
    setState({ ...state, referrers: [...state.referrers, referrer] });
  }

  function removeReferrer(id: string) {
    if (state.stage !== "loaded") return;
    setState({
      ...state,
      referrers: state.referrers.filter((r) => r.id !== id),
      myReferrerRow:
        state.myReferrerRow?.id === id ? null : state.myReferrerRow,
    });
  }

  function updateMyNotes(notes: string | null) {
    if (state.stage !== "loaded" || !state.myReferrerRow) return;
    const updatedRow = { ...state.myReferrerRow, notes };
    setState({
      ...state,
      myReferrerRow: updatedRow,
      referrers: state.referrers.map((r) =>
        r.id === updatedRow.id ? { ...r, notes } : r,
      ),
    });
  }

  if (state.stage === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.stage === "unauthenticated") {
    return <SignInPrompt redirectTo={pathname} message="Sign in to access this page." />;
  }

  if (state.stage === "not-member") {
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <p className="text-white/60">
              This page is only accessible to existing league members.
            </p>
          </div>
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
            <p className="text-white/60 text-sm">
              Something went wrong loading this page.
            </p>
            <p className="text-white/30 text-xs font-mono">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const { signup, isAdmin, referrers, myReferrerRow } = state;
  const namedReferrers = referrers.filter((r) => r.is_named_referrer);
  const voluntaryVoters = referrers.filter((r) => !r.is_named_referrer);
  const ratedReferrers = referrers.filter((r) => r.initial_rating !== null);
  const ratedCount = ratedReferrers.length;
  const readyToRecruit = ratedCount >= MIN_REFERRER_RATINGS;
  const isRecruited = signup.status === "accepted" || recruited;
  const isCancelled = signup.status === "cancelled" || cancelled;
  const isLocked = isRecruited || isCancelled;
  const effectiveCancelNotes = cancelled ? cancelledNotes : signup.notes ?? null;

  const canSeeContact = isAdmin || myReferrerRow?.is_named_referrer === true;

  const applicant: ApplicantInfo = {
    name: signup.applicant_name,
    nickname: signup.applicant_nickname,
    image_link: signup.applicant_image_url ?? null,
  };

  const avgRating =
    ratedCount > 0
      ? Math.round(
          (ratedReferrers.reduce(
            (sum, r) => sum + Number(r.initial_rating),
            0,
          ) /
            ratedCount) *
            100,
        ) / 100
      : 0;

  const existingReferrerPlayerIds = referrers.map((r) => r.referrer_player_id);

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />

      <div className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full space-y-6">
        <div>
          <a
            href="/recruit"
            className="inline-flex items-center gap-1.5 text-sm text-[#687FA3] hover:text-white transition-colors mb-3 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to Recruits
          </a>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
            Recruit Assessment
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Review this applicant and submit your skill assessment.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <aside className="lg:col-span-1 lg:sticky lg:top-24">
            <ApplicantCard signup={signup} canSeeContact={canSeeContact} />
          </aside>

          <div className="lg:col-span-2 space-y-6">
            {/* Member-visible: your own assessment (survey). Shown to everyone. */}
            {currentPlayerId !== null && (myReferrerRow || !isLocked) && (
              <MyAssessmentPanel
                signupId={signupId}
                applicant={applicant}
                myReferrerRow={myReferrerRow}
                currentPlayerId={currentPlayerId}
                isLocked={isLocked}
                onRowCreated={() => void load()}
                onNotesSaved={updateMyNotes}
                onSurveyCompleted={() => void load()}
              />
            )}

            {/* Admin-only divider */}
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
              <>
                {/* Referrers */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">
                      Referrers
                    </p>
                    <span className="text-xs text-[#687FA3]">
                      {namedReferrers.filter((r) => r.initial_rating !== null).length} /{" "}
                      {namedReferrers.length} rated
                    </span>
                  </div>

                  {namedReferrers.length > 0 ? (
                    <p className="text-xs text-[#687FA3] leading-relaxed -mt-1">
                      Members listed by the applicant as referrers. Each answers a
                      comparison survey, and we average the derived ratings across
                      all inputs.
                    </p>
                  ) : (
                    <p className="text-sm text-[#687FA3] italic">
                      No referrers listed by the applicant.
                    </p>
                  )}

                  {namedReferrers.map((referrer) => (
                    <ReferrerCard
                      key={referrer.id}
                      referrer={referrer}
                      isLocked={isLocked}
                      signupId={signupId}
                      onDeleted={() => removeReferrer(referrer.id)}
                    />
                  ))}

                  {!isLocked && (
                    <AddReferrerPanel
                      signupId={signupId}
                      existingPlayerIds={existingReferrerPlayerIds}
                      onAdded={addReferrer}
                    />
                  )}
                </div>

                {/* Community Votes */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-violet-400/80 uppercase tracking-widest">
                      Community Votes
                    </p>
                    {voluntaryVoters.length > 0 && (
                      <span className="text-xs text-[#687FA3]">
                        {voluntaryVoters.filter((r) => r.initial_rating !== null).length}{" "}
                        / {voluntaryVoters.length} rated
                      </span>
                    )}
                  </div>

                  {voluntaryVoters.length === 0 && (
                    <p className="text-sm text-[#687FA3] italic">
                      No community votes yet.
                    </p>
                  )}

                  {voluntaryVoters.map((referrer) => (
                    <ReferrerCard
                      key={referrer.id}
                      referrer={referrer}
                      isLocked={isLocked}
                      signupId={signupId}
                      onDeleted={() => removeReferrer(referrer.id)}
                    />
                  ))}
                </div>

                {/* Recruit actions */}
                {!isLocked && (
                  <div className="border-t border-white/10 pt-6 space-y-2">
                    <p className="text-xs text-[#687FA3]">
                      {ratedCount} survey rating{ratedCount === 1 ? "" : "s"}{" "}
                      submitted
                      {readyToRecruit ? (
                        <span className="text-emerald-400 ml-1">
                          — ready to recruit at the computed average.
                        </span>
                      ) : (
                        <span className="ml-1">
                          — {MIN_REFERRER_RATINGS - ratedCount} more to reach the
                          average threshold, or enter a rating directly.
                        </span>
                      )}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="flex-1 py-3 px-6 rounded-xl font-black text-sm bg-green-700 hover:bg-green-600 text-white cursor-pointer transition-colors"
                      >
                        Recruit
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelModal(true)}
                        className="sm:w-auto py-3 px-6 rounded-xl font-bold text-sm border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 transition-colors cursor-pointer"
                      >
                        Cancel Application
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Outcome banners — visible to everyone once resolved */}
        {(isRecruited || isCancelled) && (
          <div className="border-t border-white/10 pt-6">
            {isCancelled ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-5 py-3 rounded-xl text-sm font-bold">
                  Application Cancelled
                </div>
                {effectiveCancelNotes && (
                  <p className="text-sm text-white/60">
                    <span className="text-[#687FA3]">Notes: </span>
                    <span className="whitespace-pre-wrap">
                      {effectiveCancelNotes}
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-5 py-3 rounded-xl text-sm font-bold">
                ✓ Already Recruited
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && !isLocked && (
        <RecruitModal
          ratedReferrers={ratedReferrers}
          avgRating={avgRating}
          readyToRecruit={readyToRecruit}
          signupId={signupId}
          onClose={() => setShowModal(false)}
          onRecruited={() => {
            setShowModal(false);
            setRecruited(true);
          }}
        />
      )}

      {showCancelModal && !isLocked && (
        <CancelModal
          applicantName={signup.applicant_name}
          signupId={signupId}
          onClose={() => setShowCancelModal(false)}
          onCancelled={(notes) => {
            setShowCancelModal(false);
            setCancelledNotes(notes);
            setCancelled(true);
          }}
        />
      )}
    </div>
  );
}
