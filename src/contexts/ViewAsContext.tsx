"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/lib/types";

type ViewAsContextValue = {
  isAdmin: boolean;
  viewAsPlayer: Player | null;
  isViewingAs: boolean;
  setViewAsPlayer: (p: Player | null) => void;
};

const ViewAsContext = createContext<ViewAsContextValue | null>(null);

async function checkAdminStatus(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewAsPlayer, setViewAsPlayer] = useState<Player | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (user && mounted) {
        const admin = await checkAdminStatus(user.id);
        if (mounted) setIsAdmin(admin);
      }
    }
    void init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!session?.user) {
        if (mounted) {
          setIsAdmin(false);
          setViewAsPlayer(null);
        }
      } else {
        const admin = await checkAdminStatus(session.user.id);
        if (mounted) setIsAdmin(admin);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <ViewAsContext.Provider
      value={{
        isAdmin,
        viewAsPlayer,
        isViewingAs: isAdmin && viewAsPlayer !== null,
        setViewAsPlayer,
      }}
    >
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  const ctx = useContext(ViewAsContext);
  if (!ctx) throw new Error("useViewAs must be used within ViewAsProvider");
  return ctx;
}
