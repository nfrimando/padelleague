"use client";

import { useEffect, useState } from "react";
import BackToHome from "@/components/BackToHome";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAIL = "nfrimando@gmail.com";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkIsAdmin = (userEmail: string | null) => {
    return (userEmail || "").trim().toLowerCase() === ADMIN_EMAIL;
  };

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) {
        return;
      }

      const nextEmail = data.user?.email ?? null;
      setEmail(nextEmail);
      setIsAdmin(checkIsAdmin(nextEmail));
      setLoading(false);
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      const nextEmail = session?.user?.email ?? null;
      setEmail(nextEmail);
      setIsAdmin(checkIsAdmin(nextEmail));
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setEmail(null);
    setIsAdmin(false);
  };

  return (
    <>
      <BackToHome />
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Admin</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Google sign-in is required to access this page.
        </p>

        {loading ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-300">
            Checking authentication...
          </div>
        ) : email ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
            <div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Signed in as
              </div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {email}
              </div>
            </div>

            <div
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                isAdmin
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
              }`}
            >
              Admin: {isAdmin ? "Yes" : "No"}
            </div>

            <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              Authenticated. You can now add admin tools here.
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              You are not signed in.
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue with Google
            </button>
          </div>
        )}
      </div>
    </>
  );
}
