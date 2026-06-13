"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ProfileLinkingPanel from "@/components/ProfileLinkingPanel";
import EmailAuthForm from "@/components/EmailAuthForm";
import SiteHeader from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase";
import { fetchPlayerByEmail } from "@/lib/playerLookup";
import { usePlayers } from "@/lib/usePlayers";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import type { Player } from "@/lib/types";
import { useRef } from "react";
import type { User } from "@supabase/supabase-js";

type ExistingPlayerLookup = {
  player_id: number;
  name: string;
  is_profile_complete: boolean;
};

type ApplyResponse = {
  applied?: boolean;
  error?: string;
};

type ReferrerRow = {
  search: string;
  player: Player | null;
};

const COUNTRY_CODES = [
  { value: "+63", label: "🇵🇭 +63" },
  { value: "+1", label: "🇺🇸 +1" },
  { value: "+44", label: "🇬🇧 +44" },
  { value: "+61", label: "🇦🇺 +61" },
  { value: "+65", label: "🇸🇬 +65" },
  { value: "other", label: "Other" },
] as const;

function ReferrerSearchInput({
  value,
  suggestions,
  onChange,
  onSelect,
  onClear,
}: {
  value: string;
  suggestions: Player[];
  onChange: (value: string) => void;
  onSelect: (player: Player) => void;
  onClear: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const visibleSuggestions = suggestions.slice(0, 6);
  const showDropdown = value.trim().length > 0 && visibleSuggestions.length > 0;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setActiveIndex(-1);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (showDropdown) {
              setActiveIndex((prev) =>
                prev < visibleSuggestions.length - 1 ? prev + 1 : 0,
              );
            }
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (showDropdown) {
              setActiveIndex((prev) =>
                prev > 0 ? prev - 1 : visibleSuggestions.length - 1,
              );
            }
          } else if (e.key === "Enter") {
            if (showDropdown && activeIndex >= 0) {
              e.preventDefault();
              const selected = visibleSuggestions[activeIndex];
              if (selected) onSelect(selected);
            }
          } else if (e.key === "Escape") {
            setActiveIndex(-1);
          }
        }}
        placeholder="Search by name or nickname..."
        className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
      />

      {value.trim().length > 0 && (
        <button
          type="button"
          aria-label="Clear referrer search"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full text-[#687FA3] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          ×
        </button>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 border border-[#687FA3]/20 rounded-xl shadow-2xl overflow-hidden bg-[#0E1523]">
          {visibleSuggestions.map((player, index) => (
            <button
              key={player.player_id}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(player)}
              className={`w-full text-left px-4 py-2.5 transition-colors cursor-pointer ${
                index === activeIndex ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <div className="text-sm font-medium text-white">
                {player.name}
              </div>
              {player.nickname && (
                <div className="text-xs text-[#687FA3]">{player.nickname}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferrerRowItem({
  row,
  candidates,
  showRemove,
  onUpdate,
  onRemove,
}: {
  row: ReferrerRow;
  candidates: Player[];
  showRemove: boolean;
  onUpdate: (patch: Partial<ReferrerRow>) => void;
  onRemove: () => void;
}) {
  const suggestions = usePlayerSearch(candidates, row.search);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        {row.player ? (
          <div className="flex items-center justify-between gap-3 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5">
            <div>
              <div className="text-sm font-medium text-white">
                {row.player.name}
              </div>
              {row.player.nickname && (
                <div className="text-xs text-[#687FA3]">
                  {row.player.nickname}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ player: null, search: "" })}
              className="text-xs font-bold text-[#687FA3] hover:text-white transition-colors cursor-pointer"
            >
              Change
            </button>
          </div>
        ) : (
          <ReferrerSearchInput
            value={row.search}
            suggestions={suggestions}
            onChange={(v) => onUpdate({ search: v })}
            onSelect={(player) => onUpdate({ player, search: "" })}
            onClear={() => onUpdate({ search: "" })}
          />
        )}
      </div>
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove row"
          className="text-[#687FA3] hover:text-red-400 transition-colors cursor-pointer text-lg leading-none px-1"
        >
          ×
        </button>
      )}
    </div>
  );
}

function JoinPageContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [existingPlayer, setExistingPlayer] =
    useState<ExistingPlayerLookup | null>(null);
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [countryCode, setCountryCode] = useState<string>("+63");
  const [customCountryCode, setCustomCountryCode] = useState("");
  const [contact, setContact] = useState("");
  const [referrerRows, setReferrerRows] = useState<ReferrerRow[]>([
    { search: "", player: null },
    { search: "", player: null },
    { search: "", player: null },
  ]);
  const [applicantImageUrl, setApplicantImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { players: referrerCandidates } = usePlayers({
    orderByName: true,
    select: "player_id, name, nickname",
  });

  useEffect(() => {
    async function lookupPlayer(currentUser: User) {
      if (!currentUser.email) return;
      const { player } = await fetchPlayerByEmail<ExistingPlayerLookup>({
        email: currentUser.email,
        select: "player_id, name, is_profile_complete",
      });
      setExistingPlayer(player ?? null);
      if (player?.is_profile_complete) {
        setAlreadyMember(true);
      }
    }

    async function init() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      setUser(currentUser ?? null);
      setExistingPlayer(null);
      setAlreadyMember(false);

      if (currentUser) {
        const full =
          (
            currentUser.user_metadata?.full_name as string | undefined
          )?.trim() || "";
        if (full) {
          setFullName(full);
          setNickname(full.split(" ")[0] ?? "");
        }

        await lookupPlayer(currentUser);
      }

      setLoading(false);
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (event === "SIGNED_IN" && currentUser) {
        setExistingPlayer(null);
        setAlreadyMember(false);
        void lookupPlayer(currentUser);
      } else if (event === "SIGNED_OUT") {
        setExistingPlayer(null);
        setAlreadyMember(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleImageSelect = async (file: File) => {
    setImageError(null);
    const preview = URL.createObjectURL(file);
    setImagePreview(preview);
    setImageUploading(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/membership/upload-image", {
        method: "POST",
        body: form,
      });
      const json = await res.json() as { imageUrl?: string; error?: string };
      if (!res.ok || !json.imageUrl) {
        setImageError(json.error ?? "Upload failed. Your application can still be submitted without a photo.");
        setApplicantImageUrl(null);
      } else {
        setApplicantImageUrl(json.imageUrl);
      }
    } catch {
      setImageError("Upload failed. Your application can still be submitted without a photo.");
      setApplicantImageUrl(null);
    } finally {
      setImageUploading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/join`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const selectedPlayerIds = new Set(
    referrerRows
      .filter((r) => r.player !== null)
      .map((r) => String(r.player!.player_id)),
  );

  function updateReferrerRow(index: number, patch: Partial<ReferrerRow>) {
    setReferrerRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function addReferrerRow() {
    setReferrerRows((rows) => [...rows, { search: "", player: null }]);
  }

  function removeReferrerRow(index: number) {
    setReferrerRows((rows) => rows.filter((_, i) => i !== index));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedContact = contact.trim();
    const normalizedPrefix =
      countryCode === "other" ? customCountryCode.trim() : countryCode;
    if (!fullName.trim() || !nickname.trim() || !normalizedContact) {
      setError("Full name, nickname, and contact number are required.");
      return;
    }

    if (!normalizedPrefix || !/^\+\d{1,4}$/.test(normalizedPrefix)) {
      setError("Please enter a valid country code (example: +63).");
      return;
    }

    const selectedReferrers = referrerRows
      .map((r) => r.player)
      .filter((p): p is Player => p !== null);

    if (selectedReferrers.length === 0) {
      setError("Please select at least one league member you've played with.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/membership/apply", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: fullName.trim(),
          nickname: nickname.trim(),
          contact: `${normalizedPrefix} ${normalizedContact}`,
          referrer_ids: selectedReferrers.map((p) => Number(p.player_id)),
          ...(applicantImageUrl ? { applicant_image_url: applicantImageUrl } : {}),
        }),
      });

      const json = (await res.json()) as ApplyResponse;

      if (!res.ok || !json.applied) {
        setError(json.error ?? "Failed to submit application.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
        <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const authenticated = Boolean(user);
  const showAuthenticatedApplication =
    authenticated && searchParams.get("apply") === "1";
  const isPendingVerification = Boolean(
    existingPlayer && !existingPlayer.is_profile_complete,
  );
  const showProfileLinking =
    authenticated &&
    !alreadyMember &&
    !isPendingVerification &&
    !existingPlayer &&
    !showAuthenticatedApplication;

  const hasAtLeastOneReferrer = referrerRows.some((r) => r.player !== null);

  return (
    <div className="min-h-screen bg-[#0E1523] text-white flex flex-col">
      <SiteHeader />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-2">
            Join The League
          </h1>
          <p className="text-white/50 mb-2 text-sm">
            Apply for membership. Admin approval is required before event
            registration.
          </p>

          {authenticated && alreadyMember ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-bold">
                ✓ You are already a verified member
              </div>
              <Link
                href="/dashboard"
                className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Go to your dashboard →
              </Link>
            </div>
          ) : authenticated && isPendingVerification ? (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-8 space-y-4">
              <div className="flex gap-3">
                <span className="text-xl">⏳</span>
                <div>
                  <p className="font-bold text-amber-300 mb-1">
                    Pending Verification
                  </p>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Your account is waiting for admin approval before you can
                    become a verified member. No need to submit another
                    application.
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Go to your dashboard →
              </Link>
            </div>
          ) : showProfileLinking && user ? (
            <ProfileLinkingPanel user={user} newPlayerHref="/join?apply=1" />
          ) : submitted ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-bold">
                ✓ Application submitted
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                Thanks for applying. The members you listed will be asked to
                assess your skill level before an admin finalizes your
                membership.
              </p>
              <Link
                href="/register"
                className="inline-block text-[#00C8DC] text-sm font-bold hover:underline"
              >
                Go to event registration →
              </Link>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6">
              {!user && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-4">
                  <p className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-3">
                    Existing Member — Profile Claim
                  </p>
                  <p className="text-xs text-white/50 mb-3">
                    Sign in to link your account to your existing player
                    profile.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 bg-white text-[#0E1523] font-semibold py-2.5 px-4 rounded-xl hover:bg-white/90 transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Continue with Google
                  </button>
                  <EmailAuthForm redirectTo="/join" />
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="border-t border-amber-500/30 pt-4">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">
                    New Member Application
                  </p>
                  <p className="text-xs text-white/50">
                    Only fill this out if you have never played in the league
                    before.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Lance Agril Gulfo"
                    className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="e.g. Qoqo"
                    className="w-full bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-2">
                    Contact number
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-32 min-w-0 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                    >
                      {COUNTRY_CODES.map((code) => (
                        <option key={code.value} value={code.value}>
                          {code.label}
                        </option>
                      ))}
                    </select>
                    {countryCode === "other" && (
                      <input
                        type="text"
                        value={customCountryCode}
                        onChange={(e) => setCustomCountryCode(e.target.value)}
                        placeholder="e.g. +81"
                        className="w-28 min-w-0 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                      />
                    )}
                    <input
                      type="tel"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="e.g. 9171234567"
                      className="flex-1 min-w-0 bg-[#0E1523] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/50 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
                    Profile photo
                    <span className="ml-2 normal-case font-normal text-[#687FA3]/60">
                      optional
                    </span>
                  </label>
                  <p className="text-xs text-white/40 mb-3">
                    A photo helps the members you listed identify you faster and
                    makes the assessment smoother.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImageSelect(file);
                    }}
                  />
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={imageUploading}
                      className="relative w-20 h-20 rounded-2xl border-2 border-dashed border-[#687FA3]/30 hover:border-[#00C8DC]/50 transition-colors flex items-center justify-center overflow-hidden cursor-pointer disabled:cursor-not-allowed"
                    >
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg
                          className="w-7 h-7 text-[#687FA3]/50"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
                          />
                        </svg>
                      )}
                      {imageUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </button>
                    <div className="flex-1 text-xs text-[#687FA3]">
                      {imageUploading ? (
                        <p>Uploading…</p>
                      ) : applicantImageUrl ? (
                        <p className="text-emerald-400">Photo uploaded</p>
                      ) : (
                        <p>
                          Click to upload · JPEG, PNG, WebP, GIF · max 5 MB
                        </p>
                      )}
                      {imageError && (
                        <p className="text-amber-400 mt-1">{imageError}</p>
                      )}
                      {imagePreview && !imageUploading && (
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview(null);
                            setApplicantImageUrl(null);
                            setImageError(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="mt-2 text-[#687FA3] hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#687FA3] uppercase tracking-widest mb-1">
                    Which league members have you played with before?
                  </label>
                  <p className="text-xs text-white/40 mb-3">
                    Name at least one — adding up to three helps us assess your
                    level faster.
                  </p>

                  <div className="space-y-3">
                    {referrerRows.map((row, index) => (
                      <ReferrerRowItem
                        key={index}
                        row={row}
                        candidates={referrerCandidates.filter(
                          (p) => !selectedPlayerIds.has(String(p.player_id)),
                        )}
                        showRemove={referrerRows.length > 1}
                        onUpdate={(patch) => updateReferrerRow(index, patch)}
                        onRemove={() => removeReferrerRow(index)}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addReferrerRow}
                    className="mt-3 text-xs text-[#00C8DC] hover:text-white transition-colors cursor-pointer"
                  >
                    + Add another member
                  </button>
                </div>

                {error && (
                  <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    !fullName.trim() ||
                    !nickname.trim() ||
                    (countryCode === "other" && !customCountryCode.trim()) ||
                    !contact.trim() ||
                    !hasAtLeastOneReferrer
                  }
                  className="w-full bg-[#00C8DC] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#0E1523] font-black py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    "Submit Membership Application"
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0E1523]">
          <div className="w-8 h-8 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}
