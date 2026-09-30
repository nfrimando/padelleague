import LadderView from "@/components/LadderView";
import { fetchLadderPageData } from "@/lib/ladderData";

export default async function LadderPage() {
  const data = await fetchLadderPageData();

  return <LadderView {...data} />;
}
