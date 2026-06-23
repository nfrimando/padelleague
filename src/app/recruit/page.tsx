"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase";
import { MIN_REFERRER_RATINGS } from "@/lib/recruitConfig";

type RecruitListItem = {
  id: string;
  applicant_name: string | null;
  applicant_nickname: string | null;
  applicant_image_url: string | null;
  created_at: string;
  referrer_count: number;
  rated_count: number;
};

type PageState =
  | { stage: "loading" }
  | { stage: "unauthenticated" }
  | { stage: "not-member" }
  | { stage: "error"; message: string }
  | { stage: "loaded"; applications: RecruitListItem[] };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ApplicantAvatar({
  name,
  imageUrl,
}: {
  name: string | null;
  imageUrl: string | null;
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
        alt={name ?? "Applicant"}
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

function RatingBadge({
  ratedCount,
  referrerCount,
}: {
  ratedCount: number;
  referrerCount: number;
}) {
  const ready = ratedCount >= MIN_REFERRER_RATINGS;
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
      {ratedCount} / {Math.max(referrerCount, MIN_REFERRER_RATINGS)} rated
      {ready && " ✓"}
    </span>
  );
}

export default function RecruitListPage() {
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

      const res = await fetch("/api/recruit", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 403) {
        setState({ stage: "not-member" });
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
        applications: json.applications as RecruitListItem[],
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
          <div className="text-center space-y-4 max-w-sm">
            <p className="text-white/60 text-sm">
              Sign in to view pending member applications.
            </p>
            <Link
              href="/join"
              className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
            >
              Or apply to join the league →
            </Link>
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
            <p className="text-white/60 text-sm">Something went wrong.</p>
            <p className="text-white/30 text-xs font-mono">{state.message}</p>
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
          <div className="text-center space-y-4 max-w-sm">
            <p className="text-white/60 text-sm">
              This page is only accessible to existing league members.
            </p>
            <Link
              href="/join"
              className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
            >
              Apply to join the league →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { applications } = state;

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />

      <div className="flex-1 px-4 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
            Pending Recruits
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Members who have applied and are awaiting peer assessment.
            {applications.length > 0 && (
              <> {applications.length} pending.</>
            )}
          </p>
        </div>

        {applications.length === 0 ? (
          <div className="border border-white/10 rounded-2xl p-10 text-center space-y-2">
            <p className="text-white/60 text-sm">No pending applications.</p>
            <p className="text-white/30 text-xs">
              When someone applies via{" "}
              <Link href="/join" className="text-[#00C8DC] hover:underline">
                /join
              </Link>
              , they will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {applications.map((app) => (
              <Link
                key={app.id}
                href={`/recruit/${app.id}`}
                className="flex items-center gap-4 border border-white/10 hover:border-white/20 bg-white/2 hover:bg-white/5 rounded-2xl px-5 py-4 transition-colors group"
              >
                <ApplicantAvatar
                  name={app.applicant_name}
                  imageUrl={app.applicant_image_url}
                />

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">
                    {app.applicant_name ?? "Unknown applicant"}
                    {app.applicant_nickname && (
                      <span className="text-[#687FA3] font-normal ml-1.5">
                        {app.applicant_nickname}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#687FA3] mt-0.5">
                    Applied {formatDate(app.created_at)}
                  </p>
                  <div className="mt-2">
                    <RatingBadge
                      ratedCount={app.rated_count}
                      referrerCount={app.referrer_count}
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
