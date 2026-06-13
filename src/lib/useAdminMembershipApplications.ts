"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AdminMembershipApplication = {
  id: string;
  status: "registered" | "accepted" | "waitlisted" | "cancelled";
  applicant_name: string | null;
  applicant_nickname: string | null;
  applicant_contact: string | null;
  applicant_email: string | null;
  player_id: number | null;
  created_at: string;
  updated_at: string;
  referrer_count: number;
  rated_count: number;
};

export function useAdminMembershipApplications(enabled = true) {
  const [applications, setApplications] = useState<AdminMembershipApplication[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setApplications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setApplications([]);
        return;
      }

      const res = await fetch("/api/admin/membership-applications", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = (await res.json()) as {
          applications: AdminMembershipApplication[];
        };
        setApplications(json.applications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { applications, setApplications, loading, reload: load };
}
