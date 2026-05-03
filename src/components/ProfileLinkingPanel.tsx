"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Search, UserPlus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { Player } from "@/lib/types";
import { supabase } from "@/lib/supabase";

type ClaimablePlayer = {
  player_id: number;
  name: string;
  nickname: string;
};

type ClaimStatus = "none" | "pending" | "rejected";

type Props = {
  user: User;
  onProfileLinked?: (player: Player) => void;
  newPlayerHref?: string;
};

export default function ProfileLinkingPanel({
  user,
  newPlayerHref = "/join",
}: Props) {
  const [loading, setLoading] = useState(true);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>("none");
  const [claimablePlayers, setClaimablePlayers] = useState<ClaimablePlayer[]>(
    [],
  );
  const [claimSearch, setClaimSearch] = useState("");
  const [claimTarget, setClaimTarget] = useState<number | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [existingClaimResult, claimableResult] = await Promise.all([
      supabase
        .from("player_claims")
        .select("id, status")
        .eq("claimed_by_email", user.email ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("players")
        .select("player_id, name, nickname")
        .is("email", null)
        .eq("is_profile_complete", true)
        .order("name", { ascending: true }),
    ]);

    const existingClaim = existingClaimResult.data;
    if (existingClaim?.status === "pending") {
      setClaimStatus("pending");
    } else if (existingClaim?.status === "rejected") {
      setClaimStatus("rejected");
    } else {
      setClaimStatus("none");
    }

    setClaimablePlayers((claimableResult.data ?? []) as ClaimablePlayer[]);
    setLoading(false);
  }, [user.email]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredClaimable = useMemo(
    () =>
      claimablePlayers.filter(
        (p) =>
          claimSearch === "" ||
          p.name.toLowerCase().includes(claimSearch.toLowerCase()) ||
          p.nickname.toLowerCase().includes(claimSearch.toLowerCase()),
      ),
    [claimablePlayers, claimSearch],
  );

  const handleClaim = useCallback(async () => {
    if (!claimTarget) return;

    setClaimSubmitting(true);
    setClaimError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setClaimError("Session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/players/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ player_id: claimTarget }),
      });

      const json = (await res.json()) as { claimed?: boolean; error?: string };

      if (json.claimed) {
        setClaimStatus("pending");
      } else {
        setClaimError(json.error ?? "Failed to submit claim.");
      }
    } catch {
      setClaimError("Network error. Please try again.");
    } finally {
      setClaimSubmitting(false);
    }
  }, [claimTarget]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {claimStatus === "pending" && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex gap-4">
          <span className="text-2xl mt-0.5">⏳</span>
          <div>
            <p className="font-bold text-amber-300 mb-1">
              Claim Pending Review
            </p>
            <p className="text-amber-200/60 text-sm leading-relaxed">
              Your request to claim a player profile has been submitted. An
              admin will review it shortly. You&apos;ll be able to register for
              events once it&apos;s approved.
            </p>
          </div>
        </div>
      )}

      {claimStatus === "rejected" && (
        <div className="space-y-4">
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 flex gap-4">
            <span className="text-2xl mt-0.5">✗</span>
            <div>
              <p className="font-bold text-red-400 mb-1">Claim Rejected</p>
              <p className="text-red-200/60 text-sm leading-relaxed">
                Your profile claim was not approved. You can submit a new claim
                or register as a new player.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setClaimStatus("none")}
            className="text-[11px] font-black uppercase tracking-widest text-[#687FA3] hover:text-white transition-colors"
          >
            ← Try again
          </button>
        </div>
      )}

      {claimStatus === "none" && (
        <div className="space-y-4">
          <p className="text-[#687FA3] text-sm">
            Your Google account is not linked to a player profile yet. Are you
            an existing player?
          </p>

          <div className="bg-[#162032] border border-[#687FA3]/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-[#00C8DC] shrink-0" />
              <p className="font-bold text-sm">Claim an existing profile</p>
            </div>
            <p className="text-[#687FA3] text-xs leading-relaxed">
              If you&apos;ve played in previous seasons, find your name below
              and submit a claim. An admin will verify and link your account.
            </p>

            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#687FA3]"
              />
              <input
                type="text"
                value={claimSearch}
                onChange={(e) => setClaimSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl pl-8 pr-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
              />
            </div>

            {claimSearch && filteredClaimable.length === 0 && (
              <p className="text-[#687FA3] text-xs text-center py-2">
                No players found.
              </p>
            )}

            {filteredClaimable.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {filteredClaimable.map((p) => (
                  <button
                    key={p.player_id}
                    type="button"
                    onClick={() =>
                      setClaimTarget(
                        claimTarget === p.player_id ? null : p.player_id,
                      )
                    }
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left text-sm transition-all border ${
                      claimTarget === p.player_id
                        ? "border-[#00C8DC]/50 bg-[#00C8DC]/5 text-white"
                        : "border-transparent hover:border-[#687FA3]/20 hover:bg-white/2 text-white/80"
                    }`}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[#687FA3] text-xs">{p.nickname}</span>
                  </button>
                ))}
              </div>
            )}

            {claimError && (
              <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {claimError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleClaim()}
              disabled={!claimTarget || claimSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-[#00C8DC] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-[#0E1523] font-black text-[11px] uppercase tracking-widest py-3 rounded-xl transition-all"
            >
              {claimSubmitting ? (
                <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Link2 size={13} />
                  Submit Claim
                </>
              )}
            </button>
          </div>

          <Link
            href={newPlayerHref}
            className="w-full flex items-center justify-center gap-2 bg-transparent border border-[#687FA3]/20 hover:border-[#687FA3]/50 text-[#687FA3] hover:text-white font-black text-[11px] uppercase tracking-widest py-3 rounded-xl transition-all"
          >
            <UserPlus size={13} />
            I&apos;m a new player
          </Link>
        </div>
      )}
    </div>
  );
}
