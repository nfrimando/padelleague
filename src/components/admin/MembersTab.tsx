"use client";

import { supabase } from "@/lib/supabase";
import { usePendingMembers } from "@/lib/usePendingMembers";

type PendingMemberItem = {
  player_id: number;
  name: string;
  nickname: string;
  email: string;
  image_link: string | null;
  created_at: string;
};

export function MembersTab({ enabled }: { enabled: boolean }) {
  const { pendingMembers, setPendingMembers, loading } =
    usePendingMembers(enabled);

  const handleVerify = async (id: number, verified: boolean) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/admin/players/${id}/verify`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ verified }),
    });
    if (res.ok) {
      setPendingMembers((prev) =>
        prev.filter((m: PendingMemberItem) => m.player_id !== id),
      );
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4 text-sm">
      <div>
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Pending Verification
        </div>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
          New members who signed up via Google and are awaiting approval.
          Verified members can register for seasons.
        </p>
      </div>

      {loading ? (
        <div className="text-slate-500 dark:text-slate-400 animate-pulse">
          Loading…
        </div>
      ) : pendingMembers.length === 0 ? (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-3 py-3 text-emerald-700 dark:text-emerald-300">
          ✓ No members pending verification.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {pendingMembers.map((m: PendingMemberItem) => (
            <div
              key={m.player_id}
              className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900"
            >
              {m.image_link ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.image_link}
                  alt="avatar"
                  className="w-9 h-9 rounded-full shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center text-slate-400 font-bold text-sm">
                  {m.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  {m.name}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                  {m.email}
                </p>
                <p className="text-slate-400 dark:text-slate-500 text-xs">
                  Joined{" "}
                  {new Date(m.created_at).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleVerify(m.player_id, true)}
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => void handleVerify(m.player_id, false)}
                  className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
