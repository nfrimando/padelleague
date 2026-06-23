"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { useCurrentPlayer } from "@/lib/useCurrentPlayer";
import type { Player } from "@/lib/types";

// Wraps members-only tool pages. A "member" is a signed-in user whose auth email
// maps to a row in `players`. Mirrors the dashboard/recruit gating: unauthenticated
// → redirect home; authenticated-but-unlinked → members-only notice; linked →
// renders children with the resolved player.
export default function MembersOnlyGate({
  children,
}: {
  children: (player: Player) => React.ReactNode;
}) {
  const router = useRouter();
  const { user, player, isLinked, isLoading } = useCurrentPlayer();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLinked || !player) {
    return (
      <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 max-w-sm">
            <p className="text-white/60 text-sm">
              These tools are only available to existing league members. Link
              your profile to get access.
            </p>
            <Link
              href="/dashboard"
              className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
            >
              Go to your dashboard →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children(player)}</>;
}
