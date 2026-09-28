"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";

type SignupResult = null | "registered" | "pending_verification" | "no_profile";

type RegisterResponse = {
  registered?: boolean;
  pendingVerification?: boolean;
  noProfile?: boolean;
  error?: string;
};

/** Paired events either name a partner or ask to be matched with one. */
export type SignupOptions = {
  partnerPlayerId?: number;
  lookingForPartner?: boolean;
};

export function useEventSignup(): {
  handleSignup: (eventId: number, options?: SignupOptions) => Promise<SignupResult>;
  loading: boolean;
  error: string | null;
  result: SignupResult;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignupResult>(null);

  const handleSignup = useCallback(async (eventId: number, options: SignupOptions = {}) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Session expired. Please sign in again.");
        return null;
      }

      const registerRes = await fetch("/api/events/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          event_id: eventId,
          ...(options.partnerPlayerId != null
            ? { partner_player_id: options.partnerPlayerId }
            : {}),
          ...(options.lookingForPartner ? { looking_for_partner: true } : {}),
        }),
      });

      const registerJson = (await registerRes.json()) as RegisterResponse;

      if (registerJson.registered === true) {
        setResult("registered");
        return "registered" as const;
      }

      if (registerJson.pendingVerification === true) {
        setResult("pending_verification");
        setError("Your account is pending verification.");
        return "pending_verification" as const;
      }

      if (registerJson.noProfile === true) {
        setResult("no_profile");
        setError(registerJson.error ?? "No player profile linked to your account.");
        return "no_profile" as const;
      }

      if (!registerRes.ok) {
        setError(registerJson.error ?? "Something went wrong. Please try again.");
        return null;
      }

      setError(registerJson.error ?? "Something went wrong. Please try again.");
      return null;
    } catch {
      setError("Network error. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    handleSignup,
    loading,
    error,
    result,
  };
}