"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminPlayerClaims } from "@/lib/useAdminPlayerClaims";
import { useAdminMembershipApplications } from "@/lib/useAdminMembershipApplications";
import type { AdminPlayerClaim } from "@/lib/useAdminPlayerClaims";
import type { AdminMembershipApplication } from "@/lib/useAdminMembershipApplications";
import { InitialRatingInput } from "@/components/InitialRatingInput";

type ActiveAction =
  | { kind: "review-claim" | "review-application"; id: string; approved: boolean; notes: string; initialRating: string }
  | { kind: "change-status"; id: string; status: "cancelled" | "waitlisted"; notes: string }
  | { kind: "cancel"; id: string; notes: string };

export function MembersTab({ enabled }: { enabled: boolean }) {
  const {
    claims,
    setClaims,
    loading: claimsLoading,
  } = useAdminPlayerClaims(enabled);
  const {
    applications,
    setApplications,
    loading: applicationsLoading,
  } = useAdminMembershipApplications(enabled);

  const [action, setAction] = useState<ActiveAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const startReview = (
    id: string,
    kind: "review-claim" | "review-application",
    approved: boolean,
  ) => {
    setAction({ kind, id, approved, notes: "", initialRating: "" });
    setSubmitError(null);
  };

  const startChangeStatus = (id: string) => {
    setAction({ kind: "change-status", id, status: "cancelled", notes: "" });
    setSubmitError(null);
  };

  const startCancel = (id: string) => {
    setAction({ kind: "cancel", id, notes: "" });
    setSubmitError(null);
  };

  const cancelAction = () => {
    setAction(null);
    setSubmitError(null);
  };

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  };

  const removeApplication = (id: string) => {
    setApplications((prev) => prev.filter((a: AdminMembershipApplication) => a.id !== id));
  };

  const handleConfirm = async () => {
    if (!action) return;
    const session = await getSession();
    if (!session) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (action.kind === "review-claim" || action.kind === "review-application") {
        const url =
          action.kind === "review-claim"
            ? `/api/admin/player-claims/${action.id}`
            : `/api/admin/membership-applications/${action.id}`;

        const res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            approved: action.approved,
            notes: action.notes || null,
            ...(action.kind === "review-application" && action.approved
              ? { initialRating: parseFloat(action.initialRating) }
              : {}),
          }),
        });

        if (res.ok) {
          if (action.kind === "review-claim") {
            setClaims((prev) => prev.filter((c: AdminPlayerClaim) => c.id !== action.id));
          } else {
            removeApplication(action.id);
          }
          setAction(null);
        } else {
          const json = await res.json().catch(() => ({})) as { error?: string };
          setSubmitError(json.error ?? `Request failed (${res.status})`);
        }
        return;
      }

      if (action.kind === "change-status") {
        const res = await fetch(`/api/admin/membership-applications/${action.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status: action.status, notes: action.notes || null }),
        });

        if (res.ok) {
          removeApplication(action.id);
          setAction(null);
        } else {
          const json = await res.json().catch(() => ({})) as { error?: string };
          setSubmitError(json.error ?? `Request failed (${res.status})`);
        }
        return;
      }

      if (action.kind === "cancel") {
        const res = await fetch(`/api/admin/membership-applications/${action.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status: "cancelled", notes: action.notes || null }),
        });

        if (res.ok) {
          removeApplication(action.id);
          setAction(null);
        } else {
          const json = await res.json().catch(() => ({})) as { error?: string };
          setSubmitError(json.error ?? `Request failed (${res.status})`);
        }
      }
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* ── Profile Claims ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Members
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Review pending profile claims and new membership applications.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Profile Claims
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Players who signed in and want to link their account to an existing
            player profile. Approving updates the players table row with their
            email.
          </p>
        </div>

        {claimsLoading ? (
          <div className="text-slate-500 dark:text-slate-400 animate-pulse">
            Loading…
          </div>
        ) : claims.length === 0 ? (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-3 py-3 text-emerald-700 dark:text-emerald-300">
            ✓ No pending profile claims.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {claims.map((c: AdminPlayerClaim) => {
              const isActive = action?.id === c.id;
              return (
                <div
                  key={c.id}
                  className="bg-white dark:bg-slate-900"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center text-slate-400 font-bold text-sm">
                      {(c.claimed_by_name ?? c.claimed_by_email)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {c.claimed_by_name ?? c.claimed_by_email}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                        {c.claimed_by_email}
                      </p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
                        <span className="text-slate-600 dark:text-slate-300 font-medium">
                          Claims:{" "}
                        </span>
                        {c.player?.name ?? `Player #${c.player_id}`}
                        {c.player?.nickname ? ` "${c.player.nickname}"` : ""}
                      </p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs">
                        Submitted{" "}
                        {new Date(c.created_at).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    {!isActive && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startReview(c.id, "review-claim", true)}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => startReview(c.id, "review-claim", false)}
                          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  {isActive && (action?.kind === "review-claim") && (
                    <NotesPanel
                      approved={action.approved}
                      notes={action.notes}
                      submitting={submitting}
                      error={submitError}
                      onChange={(notes) =>
                        setAction((a) => a && a.kind === "review-claim" ? { ...a, notes } : a)
                      }
                      onConfirm={() => void handleConfirm()}
                      onCancel={cancelAction}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Pending Membership Applications ──────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Membership Applications
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            New player applications submitted via the Join page. Referrers
            assess the recruit, then an admin finalizes via the Review page.
          </p>
        </div>

        {applicationsLoading ? (
          <div className="text-slate-500 dark:text-slate-400 animate-pulse">
            Loading…
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-3 py-3 text-emerald-700 dark:text-emerald-300">
            ✓ No pending membership applications.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {applications.map((a: AdminMembershipApplication) => {
              const isActive = action?.id === a.id;
              return (
                <div key={a.id} className="bg-white dark:bg-slate-900">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center text-slate-400 font-bold text-sm">
                      {(a.applicant_name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {a.applicant_name ?? "Unknown applicant"}
                        {a.applicant_nickname ? ` "${a.applicant_nickname}"` : ""}
                      </p>
                      {a.applicant_email && (
                        <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                          {a.applicant_email}
                        </p>
                      )}
                      {a.applicant_contact && (
                        <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                          Contact: {a.applicant_contact}
                        </p>
                      )}
                      <p className="text-slate-400 dark:text-slate-500 text-xs">
                        Submitted{" "}
                        {new Date(a.created_at).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
                        Assessments:{" "}
                        <span
                          className={
                            a.rated_count >= 3
                              ? "text-emerald-600 dark:text-emerald-400 font-medium"
                              : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {a.rated_count} / {a.referrer_count} rated
                        </span>
                      </p>
                    </div>
                    {!isActive && (
                      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        <a
                          href={`/recruit/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                          Review ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => startChangeStatus(a.id)}
                          className="inline-flex items-center justify-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer transition-colors"
                        >
                          Change Status
                        </button>
                        <button
                          type="button"
                          onClick={() => startCancel(a.id)}
                          className="inline-flex items-center justify-center rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer transition-colors"
                        >
                          Cancel Application
                        </button>
                      </div>
                    )}
                  </div>
                  {isActive && action?.kind === "change-status" && (
                    <StatusChangePanel
                      status={action.status}
                      notes={action.notes}
                      submitting={submitting}
                      error={submitError}
                      onStatusChange={(status) =>
                        setAction((prev) => prev && prev.kind === "change-status" ? { ...prev, status } : prev)
                      }
                      onNotesChange={(notes) =>
                        setAction((prev) => prev && prev.kind === "change-status" ? { ...prev, notes } : prev)
                      }
                      onConfirm={() => void handleConfirm()}
                      onCancel={cancelAction}
                    />
                  )}
                  {isActive && action?.kind === "cancel" && (
                    <CancelPanel
                      name={a.applicant_name ?? "this applicant"}
                      notes={action.notes}
                      submitting={submitting}
                      error={submitError}
                      onNotesChange={(notes) =>
                        setAction((prev) => prev && prev.kind === "cancel" ? { ...prev, notes } : prev)
                      }
                      onConfirm={() => void handleConfirm()}
                      onCancel={cancelAction}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function NotesPanel({
  approved,
  notes,
  submitting,
  error,
  showInitialRating,
  initialRating,
  onInitialRatingChange,
  onChange,
  onConfirm,
  onCancel,
}: {
  approved: boolean;
  notes: string;
  submitting: boolean;
  error: string | null;
  showInitialRating?: boolean;
  initialRating?: string;
  onInitialRatingChange?: (v: string) => void;
  onChange: (notes: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ratingValid =
    !showInitialRating ||
    (initialRating !== undefined &&
      initialRating.trim() !== "" &&
      !isNaN(parseFloat(initialRating)) &&
      parseFloat(initialRating) >= 0);

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {approved ? "Approving" : "Rejecting"} — add a note (optional)
      </p>
      {showInitialRating && (
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Initial Rating <span className="text-red-400">*</span>
          </label>
          <InitialRatingInput
            value={initialRating ?? ""}
            onChange={(v) => onInitialRatingChange?.(v)}
            required
            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500"
          />
        </div>
      )}
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Verified identity via referral from existing member"
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 resize-none"
      />
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting || !ratingValid}
          className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
            approved
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {submitting
            ? "Saving…"
            : approved
              ? "Confirm Approve"
              : "Confirm Reject"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function StatusChangePanel({
  status,
  notes,
  submitting,
  error,
  onStatusChange,
  onNotesChange,
  onConfirm,
  onCancel,
}: {
  status: "cancelled" | "waitlisted";
  notes: string;
  submitting: boolean;
  error: string | null;
  onStatusChange: (status: "cancelled" | "waitlisted") => void;
  onNotesChange: (notes: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Change status
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
          New status
        </label>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as "cancelled" | "waitlisted")}
          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 cursor-pointer"
        >
          <option value="cancelled">Cancelled</option>
          <option value="waitlisted">Waitlisted</option>
        </select>
      </div>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Reason for status change (optional)"
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 resize-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="inline-flex items-center rounded-md bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? "Saving…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CancelPanel({
  name,
  notes,
  submitting,
  error,
  onNotesChange,
  onConfirm,
  onCancel,
}: {
  name: string;
  notes: string;
  submitting: boolean;
  error: string | null;
  onNotesChange: (notes: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-slate-100 dark:border-slate-800 bg-red-50 dark:bg-red-900/10 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-red-600 dark:text-red-400">
        Mark <span className="font-semibold">{name}</span>&apos;s application as
        cancelled? They will no longer appear in the pending list.
      </p>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Optional — reason for cancelling…"
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 resize-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="inline-flex items-center rounded-md bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? "Cancelling…" : "Confirm Cancel"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 cursor-pointer"
        >
          Keep
        </button>
      </div>
    </div>
  );
}
