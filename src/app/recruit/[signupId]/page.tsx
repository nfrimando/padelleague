"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
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
import { RatingCalibrationHelper } from "@/components/RatingCalibrationHelper";

type RecruitSignup = Pick<
  MembershipApplication,
  | "id"
  | "status"
  | "applicant_name"
  | "applicant_nickname"
  | "applicant_contact"
  | "applicant_email"
  | "created_at"
> & { applicant_image_url?: string | null };

type RecruitPageState =
  | { stage: "loading" }
  | { stage: "unauthenticated" }
  | { stage: "not-member" }
  | { stage: "error"; message: string }
  | {
      stage: "loaded";
      signup: RecruitSignup;
      referrers: SignupPlayersReferrer[];
    };

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
          <img
            src={signup.applicant_image_url}
            alt={signup.applicant_name ?? "Applicant"}
            className="w-16 h-16 rounded-full object-cover shrink-0"
          />
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
                : "text-amber-400"
            }
          >
            {signup.status === "accepted" ? "Recruited" : "Pending"}
          </p>
        </div>
      </div>
    </div>
  );
}

function ReferrerCard({
  referrer,
  isOwn,
  isAdmin,
  isLocked,
  signupId,
  onUpdated,
  onDeleted,
}: {
  referrer: SignupPlayersReferrer;
  isOwn: boolean;
  isAdmin: boolean;
  isLocked: boolean;
  signupId: string;
  onUpdated: (updated: SignupPlayersReferrer) => void;
  onDeleted?: () => void;
}) {
  const [rating, setRating] = useState(
    referrer.initial_rating !== null ? String(referrer.initial_rating) : "",
  );
  const [notes, setNotes] = useState(referrer.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const ratingNum = rating.trim() ? Number(rating.trim()) : undefined;
    if (rating.trim() && (isNaN(ratingNum!) || ratingNum! < 0)) {
      setSaveError("Rating must be a non-negative number.");
      setSaving(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch(
      `/api/recruit/${signupId}/referrers/${referrer.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          ...(rating.trim() !== "" ? { initial_rating: ratingNum } : {}),
          notes: notes.trim() || null,
        }),
      },
    );

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setSaveError(json.error ?? "Failed to save.");
      return;
    }

    setSaved(true);
    onUpdated({ ...referrer, ...json.referrer });
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch(
      `/api/recruit/${signupId}/referrers/${referrer.id}`,
      {
        method: "DELETE",
        headers: {
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
      },
    );

    setDeleting(false);

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setDeleteError(json.error ?? "Failed to remove assessment.");
      return;
    }

    onDeleted?.();
  }

  const displayName =
    (referrer.referrer as Player | undefined)?.nickname ??
    (referrer.referrer as Player | undefined)?.name ??
    `Player #${referrer.referrer_player_id}`;

  const ratingDisplay =
    referrer.initial_rating !== null ? String(referrer.initial_rating) : null;

  // Own entry: editable when not locked
  if (isOwn) {
    return (
      <div className="border border-[#00C8DC]/20 bg-[#00C8DC]/5 rounded-xl px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-[#00C8DC]">Your assessment</p>
            {!referrer.is_named_referrer && (
              <span className="text-xs text-violet-400 border border-violet-400/30 px-1.5 py-px rounded-full">
                Voluntary
              </span>
            )}
          </div>
          {!isLocked && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-[#687FA3] hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {deleting ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
        {!isLocked ? (
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
                  Your Rating
                </label>
                <InitialRatingInput
                  value={rating}
                  onChange={setRating}
                  className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                />
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-bold text-sm px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {saved && <span className="text-emerald-400 text-xs">Saved</span>}
                {saveError && <span className="text-red-400 text-xs text-right">{saveError}</span>}
              </div>
            </div>
            <RatingCalibrationHelper
              currentPlayerId={referrer.referrer_player_id}
              rating={rating}
              onRatingChange={setRating}
            />
            <div>
              <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — playing style, strengths, context..."
                rows={2}
                className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            {ratingDisplay !== null ? (
              <span className="text-white font-semibold">{ratingDisplay}</span>
            ) : (
              <span className="text-[#687FA3] italic text-xs">No rating given</span>
            )}
            {referrer.notes && (
              <span className="text-white/50 text-xs truncate">{referrer.notes}</span>
            )}
          </div>
        )}
        {deleteError && <span className="text-red-400 text-xs">{deleteError}</span>}
      </div>
    );
  }

  // Admin editing another member's entry
  const canAdminEdit = isAdmin && !isLocked;

  return (
    <div className="border border-white/10 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-white text-sm">{displayName}</p>
          {(referrer.referrer as Player | undefined)?.nickname &&
            (referrer.referrer as Player | undefined)?.name && (
              <p className="text-xs text-[#687FA3]">
                {(referrer.referrer as Player | undefined)?.name}
              </p>
            )}
        </div>
        {!referrer.is_named_referrer && (
          <span className="text-xs font-bold text-violet-400 border border-violet-400/30 px-2 py-0.5 rounded-full shrink-0">
            Voluntary
          </span>
        )}
      </div>

      <div className="space-y-2">
        {canAdminEdit ? (
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
                  Initial Rating
                </label>
                <InitialRatingInput
                  value={rating}
                  onChange={setRating}
                  className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                />
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-bold text-sm px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {saved && (
                  <span className="text-emerald-400 text-xs">Saved</span>
                )}
                {saveError && (
                  <span className="text-red-400 text-xs text-right">
                    {saveError}
                  </span>
                )}
              </div>
            </div>
            <RatingCalibrationHelper
              currentPlayerId={referrer.referrer_player_id}
              rating={rating}
              onRatingChange={setRating}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            {ratingDisplay !== null ? (
              <span className="bg-[#0E1523] border border-[#687FA3]/20 rounded-full px-3 py-1 text-sm font-semibold text-white">
                {ratingDisplay}
              </span>
            ) : (
              <span className="text-[#687FA3] italic text-xs">Awaiting</span>
            )}

            {referrer.notes && (
              <span className="text-white/60 text-xs truncate max-w-[16rem]">
                {referrer.notes}
              </span>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
            Notes
          </label>
          {canAdminEdit ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — playing style, strengths, context..."
              rows={2}
              className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
            />
          ) : (
            <p className="text-sm text-white/70 whitespace-pre-wrap">
              {referrer.notes ?? (
                <span className="text-[#687FA3] italic">No notes</span>
              )}
            </p>
          )}
        </div>
      </div>
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

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch(`/api/recruit/${signupId}/referrers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
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

function SelfVotePanel({
  signupId,
  currentPlayerId,
  onAdded,
}: {
  signupId: string;
  currentPlayerId: number | null;
  onAdded: (referrer: SignupPlayersReferrer) => void;
}) {
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleSubmit() {
    setAdding(true);
    setAddError(null);

    const ratingNum = rating.trim() ? Number(rating.trim()) : undefined;
    if (rating.trim() && (isNaN(ratingNum!) || ratingNum! < 0)) {
      setAddError("Rating must be a non-negative number.");
      setAdding(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setAddError("Session expired. Please refresh.");
      setAdding(false);
      return;
    }

    const { data: playerRow } = await supabase
      .from("players")
      .select("player_id")
      .eq("email", session.user.email ?? "")
      .maybeSingle();

    if (!playerRow) {
      setAddError("Could not resolve your player profile.");
      setAdding(false);
      return;
    }

    const res = await fetch(`/api/recruit/${signupId}/referrers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        player_id: Number(playerRow.player_id),
        ...(ratingNum !== undefined ? { initial_rating: ratingNum } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    });

    const json = await res.json();
    setAdding(false);

    if (!res.ok) {
      setAddError(json.error ?? "Failed to submit assessment.");
      return;
    }

    onAdded(json.referrer as SignupPlayersReferrer);
  }

  return (
    <div className="border border-dashed border-violet-400/20 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">
          Submit your assessment
        </p>
        <p className="text-xs text-[#687FA3] mt-1">
          You can voluntarily rate this applicant even if they didn&apos;t list
          you as a referrer. Your vote will be counted equally.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
            Initial Rating
          </label>
          <InitialRatingInput
            value={rating}
            onChange={setRating}
            className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={adding}
          className="shrink-0 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          {adding ? "Submitting…" : "Submit"}
        </button>
      </div>

      <RatingCalibrationHelper
        currentPlayerId={currentPlayerId}
        rating={rating}
        onRatingChange={setRating}
      />

      <div>
        <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional — playing style, strengths, context..."
          rows={2}
          className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors resize-none"
        />
      </div>

      {addError && <p className="text-red-400 text-xs">{addError}</p>}
    </div>
  );
}

function RecruitModal({
  ratedReferrers,
  avgRating,
  signupId,
  onClose,
  onRecruited,
}: {
  ratedReferrers: SignupPlayersReferrer[];
  avgRating: number;
  signupId: string;
  onClose: () => void;
  onRecruited: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  async function handleConfirm() {
    setConfirming(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch(`/api/recruit/${signupId}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
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
            This will create a player profile with the computed initial rating.
          </p>
        </div>

        <div className="border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-[#687FA3] uppercase tracking-widest">
            Referrer Ratings
          </p>
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
          </div>
          <div className="border-t border-white/10 pt-3 flex justify-between text-sm font-bold">
            <span className="text-white">Average Initial Rating</span>
            <span className="text-[#00C8DC] text-base">
              {avgRating.toFixed(2)}
            </span>
          </div>
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
            disabled={confirming}
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

export default function RecruitPage() {
  const { signupId } = useParams<{ signupId: string }>();
  const [state, setState] = useState<RecruitPageState>({ stage: "loading" });
  const [currentPlayerId, setCurrentPlayerId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [recruited, setRecruited] = useState(false);

  useEffect(() => {
    async function init() {
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

      if (user) {
        const { data: adminRow } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        setIsAdmin(Boolean(adminRow));

        if (user.email) {
          const { data: playerRow } = await supabase
            .from("players")
            .select("player_id")
            .eq("email", user.email)
            .maybeSingle();
          if (playerRow) {
            setCurrentPlayerId(playerRow.player_id as number);
          }
        }
      }

      setState({
        stage: "loaded",
        signup: json.signup as RecruitSignup,
        referrers: json.referrers as SignupPlayersReferrer[],
      });
    }

    void init();
  }, [signupId]);

  function updateReferrer(updated: SignupPlayersReferrer) {
    if (state.stage !== "loaded") return;
    setState({
      ...state,
      referrers: state.referrers.map((r) =>
        r.id === updated.id ? { ...r, ...updated } : r,
      ),
    });
  }

  function addReferrer(referrer: SignupPlayersReferrer) {
    if (state.stage !== "loaded") return;
    setState({ ...state, referrers: [...state.referrers, referrer] });
  }

  function removeReferrer(id: string) {
    if (state.stage !== "loaded") return;
    setState({
      ...state,
      referrers: state.referrers.filter((r) => r.id !== id),
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
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <p className="text-white/60">Sign in to access this page.</p>
          </div>
        </div>
      </div>
    );
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

  const { signup, referrers } = state;
  const namedReferrers = referrers.filter((r) => r.is_named_referrer);
  const voluntaryVoters = referrers.filter((r) => !r.is_named_referrer);
  const ratedReferrers = referrers.filter((r) => r.initial_rating !== null);
  const ratedCount = ratedReferrers.length;
  const readyToRecruit = ratedCount >= MIN_REFERRER_RATINGS;
  const isLocked = signup.status === "accepted" || recruited;

  const effectivePlayerId = currentPlayerId;
  const effectiveIsAdmin = isAdmin;

  const currentUserIsReferrer =
    effectivePlayerId !== null &&
    referrers.some((r) => r.referrer_player_id === effectivePlayerId);

  const currentUserIsNamedReferrer =
    effectivePlayerId !== null &&
    referrers.some(
      (r) => r.referrer_player_id === effectivePlayerId && r.is_named_referrer,
    );

  const canSeeContact = effectiveIsAdmin || currentUserIsNamedReferrer;

  const ownReferrerEntry =
    effectivePlayerId !== null
      ? referrers.find((r) => r.referrer_player_id === effectivePlayerId)
      : undefined;

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

      <div className="flex-1 px-4 py-8 max-w-xl mx-auto w-full space-y-6">
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

        <ApplicantCard signup={signup} canSeeContact={canSeeContact} />

        {effectiveIsAdmin ? (
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

              {namedReferrers.length > 0 && (
                <p className="text-xs text-[#687FA3] leading-relaxed -mt-1">
                  These are the members listed by the applicant as referrers. Each
                  referrer submits their own skill assessment, and we take the
                  average across all inputs.
                </p>
              )}

              {namedReferrers.length === 0 && (
                <p className="text-sm text-[#687FA3] italic">
                  No referrers listed by the applicant.
                </p>
              )}

              {namedReferrers.map((referrer) => (
                <ReferrerCard
                  key={referrer.id}
                  referrer={referrer}
                  isOwn={referrer.referrer_player_id === effectivePlayerId}
                  isAdmin={effectiveIsAdmin}
                  isLocked={isLocked}
                  signupId={signupId}
                  onUpdated={updateReferrer}
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
                    {
                      voluntaryVoters.filter((r) => r.initial_rating !== null)
                        .length
                    }{" "}
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
                  isOwn={referrer.referrer_player_id === effectivePlayerId}
                  isAdmin={effectiveIsAdmin}
                  isLocked={isLocked}
                  signupId={signupId}
                  onUpdated={updateReferrer}
                  onDeleted={() => removeReferrer(referrer.id)}
                />
              ))}

              {!isLocked && !currentUserIsReferrer && effectivePlayerId !== null && (
                <SelfVotePanel
                  signupId={signupId}
                  currentPlayerId={effectivePlayerId}
                  onAdded={addReferrer}
                />
              )}
            </div>
          </>
        ) : currentUserIsNamedReferrer ? (
          /* Named referrer: only your own assessment is shown — no visibility into
             other referrers' or community members' ratings. */
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

            <p className="text-xs text-[#687FA3] leading-relaxed -mt-1">
              These are the members listed by the applicant as referrers. Each
              referrer submits their own skill assessment, and we take the
              average across all inputs.
            </p>

            {ownReferrerEntry && (
              <ReferrerCard
                key={ownReferrerEntry.id}
                referrer={ownReferrerEntry}
                isOwn
                isAdmin={false}
                isLocked={isLocked}
                signupId={signupId}
                onUpdated={updateReferrer}
                onDeleted={() => removeReferrer(ownReferrerEntry.id)}
              />
            )}
          </div>
        ) : (
          /* Regular member, not a named referrer: only your own community vote
             is shown — no visibility into referrers' or other members' ratings. */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-violet-400/80 uppercase tracking-widest">
                Community Votes
              </p>
              {voluntaryVoters.length > 0 && (
                <span className="text-xs text-[#687FA3]">
                  {
                    voluntaryVoters.filter((r) => r.initial_rating !== null)
                      .length
                  }{" "}
                  / {voluntaryVoters.length} rated
                </span>
              )}
            </div>

            {ownReferrerEntry ? (
              <ReferrerCard
                key={ownReferrerEntry.id}
                referrer={ownReferrerEntry}
                isOwn
                isAdmin={false}
                isLocked={isLocked}
                signupId={signupId}
                onUpdated={updateReferrer}
                onDeleted={() => removeReferrer(ownReferrerEntry.id)}
              />
            ) : (
              !isLocked &&
              effectivePlayerId !== null && (
                <SelfVotePanel
                  signupId={signupId}
                  currentPlayerId={effectivePlayerId}
                  onAdded={addReferrer}
                />
              )
            )}
          </div>
        )}

        <div className="border-t border-white/10 pt-6">
          {isLocked ? (
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-5 py-3 rounded-xl text-sm font-bold">
              ✓ Already Recruited
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#687FA3]">
                {ratedCount} total vote{ratedCount === 1 ? "" : "s"} (named +
                community)
                {readyToRecruit ? (
                  <span className="text-emerald-400 ml-1">
                    — ready for admin to recruit.
                  </span>
                ) : (
                  <span className="ml-1">
                    — {MIN_REFERRER_RATINGS - ratedCount} more needed to unlock.
                  </span>
                )}
              </p>
              <button
                type="button"
                disabled={!effectiveIsAdmin || !readyToRecruit}
                onClick={() => setShowModal(true)}
                className={`w-full py-3 px-6 rounded-xl font-black text-sm transition-colors ${
                  readyToRecruit
                    ? effectiveIsAdmin
                      ? "bg-green-700 hover:bg-green-600 text-white cursor-pointer"
                      : "bg-transparent border-2 border-green-700 text-green-500 cursor-not-allowed"
                    : "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"
                }`}
              >
                Recruit{effectiveIsAdmin ? "" : " (Admin Only)"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showModal && !isLocked && (
        <RecruitModal
          ratedReferrers={ratedReferrers}
          avgRating={avgRating}
          signupId={signupId}
          onClose={() => setShowModal(false)}
          onRecruited={() => {
            setShowModal(false);
            setRecruited(true);
          }}
        />
      )}
    </div>
  );
}
