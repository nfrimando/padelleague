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

export function useEventSignup(): {
  handleSignup: (eventId: number) => Promise<SignupResult>;
  loading: boolean;
  error: string | null;
  result: SignupResult;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignupResult>(null);

  const handleSignup = useCallback(async (eventId: number) => {
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
        body: JSON.stringify({ event_id: eventId }),
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