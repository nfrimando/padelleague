"use client";

import { useViewAs } from "@/contexts/ViewAsContext";
import { usePlayers } from "@/lib/usePlayers";
import ViewAsSelector from "@/components/ViewAsSelector";

export default function AdminViewAsControl() {
  const { isAdmin, viewAsPlayer, setViewAsPlayer } = useViewAs();
  const { players } = usePlayers({ enabled: isAdmin, orderByName: true });

  if (!isAdmin) return null;

  return (
    <ViewAsSelector
      players={players}
      selected={viewAsPlayer}
      onSelect={setViewAsPlayer}
    />
  );
}
