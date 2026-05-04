import BackToHome from "@/components/BackToHome";

export default function LoadingLeaderboardPage() {
  return (
    <>
      <BackToHome />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
          <p className="mt-1 text-xs text-[#687FA3]">Loading leaderboard...</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#22304a] bg-[#0E1523]">
          <div className="flex items-center justify-center p-12 text-sm text-[#687FA3]">
            Loading leaderboard...
          </div>
        </div>
      </div>
    </>
  );
}
