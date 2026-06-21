"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase";

const MIN_RESPONDENTS = 3;

type RecalibrationListItem = {
  id: number;
  player_id: number;
  requested_at: string;
  requestor_notes: string | null;
  respondent_count: number;
  rated_count: number;
  player: {
    player_id: number;
    name: string | null;
    nickname: string | null;
    image_link: string | null;
  } | null;
};

type PageState =
  | { stage: "loading" }
  | { stage: "unauthenticated" }
  | { stage: "forbidden" }
  | { stage: "error"; message: string }
  | { stage: "loaded"; requests: RecalibrationListItem[] };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RequestorAvatar({
  name,
  imageUrl,
}: {
  name: string | null | undefined;
  imageUrl: string | null | undefined;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? "Player"}
        className="w-12 h-12 rounded-full object-cover shrink-0"
      />
    );
  }

  return (
    <div className="w-12 h-12 rounded-full bg-[#687FA3]/20 shrink-0 flex items-center justify-center text-[#687FA3] font-bold text-sm">
      {initials}
    </div>
  );
}

function RespondentBadge({
  ratedCount,
  respondentCount,
}: {
  ratedCount: number;
  respondentCount: number;
}) {
  const ready = ratedCount >= MIN_RESPONDENTS;
  const started = ratedCount > 0;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
        ready
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : started
            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
            : "bg-white/5 border-white/10 text-[#687FA3]"
      }`}
    >
      {ratedCount} / {Math.max(respondentCount, MIN_RESPONDENTS)} responded
      {ready && " ✓"}
    </span>
  );
}

export default function RecalibrationListPage() {
  const [state, setState] = useState<PageState>({ stage: "loading" });

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setState({ stage: "unauthenticated" });
        return;
      }

      const res = await fetch("/api/recalibration", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 403) {
        setState({ stage: "forbidden" });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ stage: "error", message: body.error ?? `Server error (${res.status})` });
        return;
      }

      const json = await res.json();
      setState({
        stage: "loaded",
        requests: json.requests as RecalibrationListItem[],
      });
    }

    void load();
  }, []);

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
          <p className="text-white/60 text-sm">Sign in to view this page.</p>
        </div>
      </div>
    );
  }

  if (state.stage === "forbidden") {
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-white/60 text-sm text-center max-w-sm">
            This page is only accessible to league admins.
          </p>
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

  const { requests } = state;

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />

      <div className="flex-1 px-4 py-8 max-w-xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
            Recalibration Requests
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Players awaiting a rating recalibration review.
            {requests.length > 0 && <> {requests.length} pending.</>}
          </p>
        </div>

        {requests.length === 0 ? (
          <div className="border border-white/10 rounded-2xl p-10 text-center space-y-2">
            <p className="text-white/60 text-sm">No pending recalibration requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Link
                key={req.id}
                href={`/recalibrate/${req.id}`}
                className="flex items-center gap-4 border border-white/10 hover:border-white/20 bg-white/2 hover:bg-white/5 rounded-2xl px-5 py-4 transition-colors group"
              >
                <RequestorAvatar name={req.player?.name} imageUrl={req.player?.image_link} />

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">
                    {req.player?.name ?? "Unknown player"}
                    {req.player?.nickname && (
                      <span className="text-[#687FA3] font-normal ml-1.5">
                        {req.player.nickname}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#687FA3] mt-0.5">
                    Requested {formatDate(req.requested_at)}
                  </p>
                  <div className="mt-2">
                    <RespondentBadge
                      ratedCount={req.rated_count}
                      respondentCount={req.respondent_count}
                    />
                  </div>
                </div>

                <svg
                  className="w-4 h-4 text-[#687FA3] group-hover:text-white shrink-0 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
