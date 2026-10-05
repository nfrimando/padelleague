import LadderView from "@/components/LadderView";
import { fetchLadderPageData } from "@/lib/ladderData";
import { fetchLadderDuoPageData } from "@/lib/ladderDuoData";

export default async function LadderPage() {
  const [data, duo] = await Promise.all([fetchLadderPageData(), fetchLadderDuoPageData()]);

  return <LadderView {...data} duo={duo} />;
}
