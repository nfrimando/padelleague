import LadderView from "@/components/LadderView";
import { fetchLadderPageData } from "@/lib/ladderData";

export default async function LadderPage() {
  const { hasActiveCycle, activeCycle, tiers, groupedPlayers, pendingMatchesByTier } =
    await fetchLadderPageData();

  return (
    <LadderView
      hasActiveCycle={hasActiveCycle}
      activeCycle={activeCycle}
      tiers={tiers}
      groupedPlayers={groupedPlayers}
      pendingMatchesByTier={pendingMatchesByTier}
    />
  );
}
