"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { countryToFlag } from "@/lib/utils";
import { COUNTRY_LIST, PHONE_CODES } from "@/lib/countries";
import type { Player } from "@/lib/types";

type Props = {
  player: Player;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (player: Player) => void;
};

type FormState = {
  nickname: string;
  phone_country_code: string;
  phone_number: string;
  country: string;
  is_public: boolean;
  is_notifications_subscribed: boolean;
  preferred_side: "left" | "right" | "both" | "";
};

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 w-full text-left group"
    >
      <div
        className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? "bg-[#00C8DC]" : "bg-[#687FA3]/30"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
      <div>
        <p className="text-sm font-bold text-white/90">{label}</p>
        {description && (
          <p className="text-xs text-[#687FA3] mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}

export default function EditProfileModal({
  player,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [form, setForm] = useState<FormState>({
    nickname: player.nickname ?? "",
    phone_country_code: player.phone_country_code ?? "+63",
    phone_number: player.phone_number ?? "",
    country: player.country ?? "PH",
    is_public: player.is_public ?? false,
    is_notifications_subscribed: player.is_notifications_subscribed ?? false,
    preferred_side: player.preferred_side ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync form when player prop changes (e.g. after a save)
  useEffect(() => {
    setForm({
      nickname: player.nickname ?? "",
      phone_country_code: player.phone_country_code ?? "+63",
      phone_number: player.phone_number ?? "",
      country: player.country ?? "PH",
      is_public: player.is_public ?? false,
      is_notifications_subscribed: player.is_notifications_subscribed ?? false,
      preferred_side: player.preferred_side ?? "",
    });
  }, [player]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Session expired. Please refresh and try again.");
        return;
      }

      const res = await fetch("/api/players/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nickname: form.nickname,
          phone_country_code: form.phone_number ? form.phone_country_code : null,
          phone_number: form.phone_number || null,
          country: form.country || null,
          is_public: form.is_public,
          is_notifications_subscribed: form.is_notifications_subscribed,
          preferred_side: form.preferred_side || null,
        }),
      });

      const json = (await res.json()) as { player?: Player; error?: string };
      if (!res.ok || !json.player) {
        setError(json.error ?? "Failed to save profile.");
        return;
      }

      onSaved(json.player);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/60 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm bg-[#162032] border border-[#687FA3]/20 rounded-2xl shadow-2xl p-6 space-y-5 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00C8DC] mb-0.5">
              Profile
            </p>
            <h2 className="text-base font-black text-white">Edit Profile</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nickname */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
            Nickname
          </label>
          <input
            type="text"
            value={form.nickname}
            onChange={(e) =>
              setForm((f) => ({ ...f, nickname: e.target.value }))
            }
            maxLength={50}
            placeholder="Your nickname"
            className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
          />
        </div>

        {/* Phone number */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
            Phone Number
          </label>
          <div className="flex gap-2">
            <select
              value={form.phone_country_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone_country_code: e.target.value }))
              }
              className="bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C8DC]/50 transition-colors shrink-0 cursor-pointer"
            >
              {PHONE_CODES.map((pc) => (
                <option key={pc.code} value={pc.code}>
                  {pc.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              value={form.phone_number}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setForm((f) => ({ ...f, phone_number: val }));
              }}
              maxLength={12}
              placeholder="9XXXXXXXXX"
              className="flex-1 bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#687FA3]/60 focus:outline-none focus:border-[#00C8DC]/50 transition-colors"
            />
          </div>
        </div>

        {/* Country */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
            Country
          </label>
          <select
            value={form.country}
            onChange={(e) =>
              setForm((f) => ({ ...f, country: e.target.value }))
            }
            className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C8DC]/50 transition-colors cursor-pointer"
          >
            <option value="">— Not set —</option>
            {COUNTRY_LIST.map((c) => (
              <option key={c.code} value={c.code}>
                {countryToFlag(c.code)} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Preferred Side */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#687FA3]">
            Preferred Side
          </label>
          <select
            value={form.preferred_side}
            onChange={(e) =>
              setForm((f) => ({ ...f, preferred_side: e.target.value as FormState["preferred_side"] }))
            }
            className="w-full bg-[#1a2540] border border-[#687FA3]/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00C8DC]/50 transition-colors cursor-pointer"
          >
            <option value="">— Not set —</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="both">Both</option>
          </select>
        </div>

        {/* Divider */}
        <div className="border-t border-[#687FA3]/10" />

        {/* Toggles */}
        <div className="space-y-4">
          <Toggle
            checked={form.is_public}
            onChange={(v) => setForm((f) => ({ ...f, is_public: v }))}
            label="Public profile"
            description="Anyone can see your photo and contact details. When off, only league members can."
          />
          <Toggle
            checked={form.is_notifications_subscribed}
            onChange={(v) =>
              setForm((f) => ({ ...f, is_notifications_subscribed: v }))
            }
            label="Email updates"
            description="Receive notifications about events and league news."
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-[#1a2540] hover:bg-[#1e2d50] border border-[#687FA3]/20 text-white/70 font-black py-2.5 px-4 rounded-xl text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 bg-[#00C8DC] hover:bg-white disabled:opacity-50 text-[#0E1523] font-black py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-[#0E1523] border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
