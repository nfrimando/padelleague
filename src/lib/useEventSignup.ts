"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";

type SignupResult = null | "registered" | "requires_payment" | "pending_verification";

type RegisterResponse = {
  registered?: boolean;
  requires_payment?: boolean;
  pending?: boolean;
  pendingVerification?: boolean;
  error?: string;
};

type CreateLinkResponse = {
  checkout_url?: string;
  error?: string;
};

export function useEventSignup(): {
  handleSignup: (eventId: number) => Promise<void>;
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
        return;
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
        return;
      }

      if (registerJson.pendingVerification === true) {
        setResult("pending_verification");
        setError("Your account is pending verification.");
        return;
      }

      if (registerJson.requires_payment === true) {
        const paymentRes = await fetch("/api/payments/create-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ event_id: eventId }),
        });

        const paymentJson = (await paymentRes.json()) as CreateLinkResponse;

        if (!paymentRes.ok || !paymentJson.checkout_url) {
          setError(
            paymentJson.error ?? "Unable to start payment checkout. Please try again.",
          );
          return;
        }

        setResult("requires_payment");
        window.location.href = paymentJson.checkout_url;
        return;
      }

      if (!registerRes.ok) {
        setError(registerJson.error ?? "Something went wrong. Please try again.");
        return;
      }

      setError(registerJson.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
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