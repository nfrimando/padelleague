"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminPlayerClaims } from "@/lib/useAdminPlayerClaims";
import { useAdminMembershipApplications } from "@/lib/useAdminMembershipApplications";
import type { AdminPlayerClaim } from "@/lib/useAdminPlayerClaims";
import type { AdminMembershipApplication } from "@/lib/useAdminMembershipApplications";

type ReviewTarget = {
  id: string;
  kind: "claim" | "application";
  approved: boolean;
  notes: string;
};

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

  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startReview = (
    id: string,
    kind: "claim" | "application",
    approved: boolean,
  ) => {
    setReviewing({ id, kind, approved, notes: "" });
  };

  const cancelReview = () => setReviewing(null);

  const handleConfirm = async () => {
    if (!reviewing) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    setSubmitting(true);
    try {
      const url =
        reviewing.kind === "claim"
          ? `/api/admin/player-claims/${reviewing.id}`
          : `/api/admin/membership-applications/${reviewing.id}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          approved: reviewing.approved,
          notes: reviewing.notes || null,
        }),
      });

      if (res.ok) {
        if (reviewing.kind === "claim") {
          setClaims((prev) =>
            prev.filter((c: AdminPlayerClaim) => c.id !== reviewing.id),
          );
        } else {
          setApplications((prev) =>
            prev.filter(
              (a: AdminMembershipApplication) => a.id !== reviewing.id,
            ),
          );
        }
        setReviewing(null);
      }
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
              const isReviewing = reviewing?.id === c.id;
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
                    {!isReviewing && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startReview(c.id, "claim", true)}
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => startReview(c.id, "claim", false)}
                          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  {isReviewing && (
                    <NotesPanel
                      approved={reviewing.approved}
                      notes={reviewing.notes}
                      submitting={submitting}
                      onChange={(notes) =>
                        setReviewing((r) => r && { ...r, notes })
                      }
                      onConfirm={() => void handleConfirm()}
                      onCancel={cancelReview}
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
            New player applications submitted via the Join page. Approving
            creates a new row in players table.
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
              const isReviewing = reviewing?.id === a.id;
              return (
                <div
                  key={a.id}
                  className="bg-white dark:bg-slate-900"
                >
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
                    </div>
                    {!isReviewing && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            startReview(a.id, "application", true)
                          }
                          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            startReview(a.id, "application", false)
                          }
                          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  {isReviewing && (
                    <NotesPanel
                      approved={reviewing.approved}
                      notes={reviewing.notes}
                      submitting={submitting}
                      onChange={(notes) =>
                        setReviewing((r) => r && { ...r, notes })
                      }
                      onConfirm={() => void handleConfirm()}
                      onCancel={cancelReview}
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
  onChange,
  onConfirm,
  onCancel,
}: {
  approved: boolean;
  notes: string;
  submitting: boolean;
  onChange: (notes: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {approved ? "Approving" : "Rejecting"} — add a note (optional)
      </p>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Verified identity via referral from existing member"
        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
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
          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
