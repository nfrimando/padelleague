"use client";

import { supabase } from "@/lib/supabase";
import { useAdminPlayerClaims } from "@/lib/useAdminPlayerClaims";
import { useAdminMembershipApplications } from "@/lib/useAdminMembershipApplications";
import type { AdminPlayerClaim } from "@/lib/useAdminPlayerClaims";
import type { AdminMembershipApplication } from "@/lib/useAdminMembershipApplications";

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

  const handleReviewClaim = async (claimId: string, approved: boolean) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/admin/player-claims/${claimId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ approved }),
    });
    if (res.ok) {
      setClaims((prev) =>
        prev.filter((c: AdminPlayerClaim) => c.id !== claimId),
      );
    }
  };

  const handleReviewApplication = async (id: string, approved: boolean) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/admin/membership-applications/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ approved }),
    });
    if (res.ok) {
      setApplications((prev) =>
        prev.filter((a: AdminMembershipApplication) => a.id !== id),
      );
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
          {claims.map((c: AdminPlayerClaim) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900"
            >
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
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleReviewClaim(c.id, true)}
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void handleReviewClaim(c.id, false)}
                  className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
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
          {applications.map((a: AdminMembershipApplication) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900"
            >
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
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleReviewApplication(a.id, true)}
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void handleReviewApplication(a.id, false)}
                  className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
