"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import PlayerCard from "@/components/PlayerCard";
import Toggle from "@/components/Toggle";
import EventSignupConfirmModal from "@/components/EventSignupConfirmModal";
import { useCurrentPlayer } from "@/lib/useCurrentPlayer";
import { useEventSignup } from "@/lib/useEventSignup";
import {
  signupStatusLabel,
  signupStatusBadgeClass,
  type EventSignupStatus,
} from "@/lib/eventSignupStatus";
import { supabase } from "@/lib/supabase";
import { Event, EventRestrictions } from "@/lib/types";

type EventCreator = {
  player_id: number;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

type EventWithCreator = Event & { creator?: EventCreator | null };

type RosterPlayer = {
  player_id: number | null;
  name: string | null;
  nickname: string | null;
  image_link: string | null;
};

type ManagedSignupRow = RosterPlayer & {
  id: string;
  status: EventSignupStatus;
  paid: boolean;
};

type SignupsResponse = {
  signupListVisible: boolean;
  canManage: boolean;
  viewerSignup: { status: EventSignupStatus } | null;
  roster: RosterPlayer[];
  signups?: ManagedSignupRow[];
  statusCounts?: Record<EventSignupStatus, number>;
  hidden?: boolean;
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return "Dates TBD";
  if (start && !end) return formatDate(start);
  if (!start && end) return `Until ${formatDate(end)}`;
  const s = new Date(start! + "T00:00:00");
  const e = new Date(end! + "T00:00:00");
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${s.toLocaleDateString("en-PH", { month: "long", day: "numeric" })} – ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${s.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

const inputCls =
  "block w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";
const labelCls =
  "block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5";

type EditForm = {
  name: string;
  start_date: string;
  signup_deadline: string;
  end_date: string;
  format: string;
  player_limit: string;
  min_rating: string;
  max_rating: string;
  description: string;
  notes: string;
  image_url: string;
  signup_list_visible: boolean;
};

function makeEditForm(event: EventWithCreator): EditForm {
  return {
    name: event.name ?? "",
    start_date: event.start_date ?? "",
    signup_deadline: event.signup_deadline ?? "",
    end_date: event.end_date ?? "",
    format: event.format ?? "",
    player_limit: event.player_limit != null ? String(event.player_limit) : "",
    min_rating:
      event.restrictions?.min_rating != null
        ? String(event.restrictions.min_rating)
        : "",
    max_rating:
      event.restrictions?.max_rating != null
        ? String(event.restrictions.max_rating)
        : "",
    description: event.description ?? "",
    notes: event.notes ?? "",
    image_url: event.image_url ?? "",
    signup_list_visible: event.signup_list_visible ?? true,
  };
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.event_id as string;
  const { player, isLinked } = useCurrentPlayer();

  const [event, setEvent] = useState<EventWithCreator | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [signupsData, setSignupsData] = useState<SignupsResponse | null>(null);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const {
    handleSignup,
    loading: signupSubmitting,
    error: signupError,
  } = useEventSignup();

  // Load event
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNotFound(false);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/events/${eventId}`, { headers });
      if (cancelled) return;

      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Failed to load event.");
        setLoading(false);
        return;
      }

      const json = (await res.json()) as { event: Event };
      if (!cancelled) {
        setEvent(json.event);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Check admin status
  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("admin_users")
        .select("auth_user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      setIsAdmin(!!data);
    }
    void checkAdmin();
  }, [isLinked]);

  // Load roster + viewer's own signup status
  useEffect(() => {
    let cancelled = false;
    async function loadSignups() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/events/${eventId}/signups`, { headers });
      if (cancelled) return;
      if (res.ok) {
        const json = (await res.json()) as SignupsResponse;
        setSignupsData(json);
      }
    }
    void loadSignups();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const isCreator =
    isLinked &&
    player &&
    event?.created_by_player_id != null &&
    Number(player.player_id) === event.created_by_player_id;
  const canEdit = isCreator || isAdmin;

  const handleEditOpen = () => {
    if (!event) return;
    setEditForm(makeEditForm(event));
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!editForm || !event) return;
    setSaving(true);
    setSaveError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSaveError("Not authenticated.");
      setSaving(false);
      return;
    }

    const body: Record<string, unknown> = {
      name: editForm.name,
      start_date: editForm.start_date,
      signup_deadline: editForm.signup_deadline || null,
      end_date: editForm.end_date || null,
      format: editForm.format || null,
      player_limit: editForm.player_limit
        ? parseInt(editForm.player_limit, 10)
        : null,
      description: editForm.description || null,
      notes: editForm.notes || null,
      image_url: editForm.image_url || null,
      signup_list_visible: editForm.signup_list_visible,
    };
    if (editForm.min_rating || editForm.max_rating) {
      body.min_rating = editForm.min_rating
        ? parseFloat(editForm.min_rating)
        : null;
      body.max_rating = editForm.max_rating
        ? parseFloat(editForm.max_rating)
        : null;
    }

    const res = await fetch(`/api/events/${event.event_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { error?: string; event?: Event };
    if (!res.ok) {
      setSaveError(json.error ?? "Failed to save.");
      setSaving(false);
      return;
    }
    if (json.event) setEvent(json.event);
    setSaving(false);
    setEditing(false);
  };

  const handlePublish = async () => {
    if (!event) return;
    setPublishing(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setPublishing(false);
      return;
    }

    const res = await fetch(`/api/admin/events/${event.event_id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { event?: Event };
    if (res.ok && json.event) setEvent(json.event);
    setPublishing(false);
  };

  const isDraft = event?.visibility === "draft";

  const restrictionTags: string[] = [];
  const r: EventRestrictions | null | undefined = event?.restrictions;
  if (r?.min_rating != null && r?.max_rating != null)
    restrictionTags.push(`Suggested rating ${r.min_rating}–${r.max_rating}`);
  else if (r?.min_rating != null)
    restrictionTags.push(`Suggested rating ≥ ${r.min_rating}`);
  else if (r?.max_rating != null)
    restrictionTags.push(`Suggested rating ≤ ${r.max_rating}`);

  const viewerSignupStatus = signupsData?.viewerSignup?.status ?? null;
  const canSignUpAgain = !viewerSignupStatus || viewerSignupStatus === "cancelled";
  const isVerifiedPlayer = isLinked && !!player?.is_profile_complete;

  const handleSignupConfirm = async () => {
    if (!event) return;
    const outcome = await handleSignup(event.event_id);
    if (outcome === "registered") {
      setSignupsData((d) => (d ? { ...d, viewerSignup: { status: "applied" } } : d));
      setShowSignupModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <SiteHeader activePath="/events" />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-24 pb-20">
        {/* Back */}
        <div className="mb-6">
          <Link
            href="/events"
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← Back to Events
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="aspect-[16/7] rounded-2xl bg-slate-800" />
            <div className="h-8 bg-slate-800 rounded w-1/2" />
            <div className="h-4 bg-slate-800 rounded w-1/3" />
          </div>
        ) : notFound ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm">
              This event doesn&apos;t exist or isn&apos;t available.
            </p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-800/60 bg-rose-900/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        ) : event ? (
          <div className="space-y-6">
            {/* Draft banner */}
            {isDraft && (
              <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-300">
                    Pending Admin Review
                  </p>
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    This event is not yet publicly visible. It will appear on
                    the events listing once approved by the committee.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void handlePublish()}
                    disabled={publishing}
                    className="shrink-0 inline-flex items-center rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {publishing ? "Publishing…" : "Publish"}
                  </button>
                )}
              </div>
            )}

            {/* Image */}
            <div className="relative aspect-[16/7] rounded-2xl overflow-hidden bg-slate-800">
              {event.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.image_url}
                  alt={event.name ?? "Event"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-slate-600 text-5xl font-black italic uppercase tracking-tighter select-none">
                    PADEL
                  </span>
                </div>
              )}
              <span
                className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                  event.status === "ongoing"
                    ? "bg-blue-900/60 text-blue-300"
                    : event.status === "completed"
                      ? "bg-slate-800 text-slate-400"
                      : "bg-amber-900/60 text-amber-300"
                }`}
              >
                {event.status}
              </span>
              {event.registration_status === "open" && (
                <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-emerald-900/60 text-emerald-300">
                  Open
                </span>
              )}
              {isDraft && (
                <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-amber-900/60 text-amber-300">
                  Draft
                </span>
              )}
            </div>

            {/* Title row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  {event.event_type.replace(/_/g, " ")}
                </p>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-100 leading-tight">
                  {event.name ?? `Event #${event.event_id}`}
                </h1>
              </div>
              {canEdit && !editing && (
                <button
                  type="button"
                  onClick={handleEditOpen}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
                >
                  Edit Details
                </button>
              )}
            </div>

            {/* Creator */}
            {event.creator && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span>Created by</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    event.creator.image_link && event.creator.image_link !== "null"
                      ? event.creator.image_link
                      : "/default-avatar.webp"
                  }
                  alt={event.creator.name ?? "Creator"}
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span className="text-slate-200 font-medium">
                  {event.creator.name ?? event.creator.nickname ?? "Unknown"}
                </span>
              </div>
            )}

            {/* Key details */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Event Dates
                  </p>
                  <p className="text-sm text-slate-200">
                    {formatDateRange(event.start_date, event.end_date)}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Signup Deadline
                  </p>
                  <p className="text-sm text-slate-200">
                    {event.signup_deadline ? (
                      formatDate(event.signup_deadline)
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </p>
                </div>
              </div>
              {(event.format || event.player_limit) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
                  {event.format && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                        Format
                      </p>
                      <p className="text-sm text-slate-200">{event.format}</p>
                    </div>
                  )}
                  {event.player_limit && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                        Estimated Player Pool
                      </p>
                      <p className="text-sm text-slate-200">
                        {event.player_limit} players
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Restrictions */}
            {restrictionTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {restrictionTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  About
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {event.description}
                </p>
              </div>
            )}

            {/* Players */}
            {signupsData?.canManage && signupsData.signups ? (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Players
                </h2>
                {signupsData.statusCounts && (
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        "accepted",
                        "pending_payment",
                        "applied",
                        "waitlisted",
                        "cancelled",
                      ] as const
                    ).map((s) =>
                      signupsData.statusCounts![s] > 0 ? (
                        <span
                          key={s}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${signupStatusBadgeClass(s)}`}
                        >
                          {signupStatusLabel(s)}: {signupsData.statusCounts![s]}
                        </span>
                      ) : null,
                    )}
                  </div>
                )}
                {signupsData.signups.length === 0 ? (
                  <p className="text-sm text-slate-500">No signups yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {signupsData.signups.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <PlayerCard
                          player={{
                            player_id: s.player_id ?? 0,
                            name: s.name ?? "Unknown",
                            nickname: s.nickname ?? "",
                            image_link: s.image_link,
                          }}
                          size="sm"
                          showLatestRating={false}
                        />
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${signupStatusBadgeClass(s.status)}`}
                          >
                            {signupStatusLabel(s.status)}
                          </span>
                          {event.requires_payment && s.status === "accepted" && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                s.paid
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : "bg-slate-800 border-slate-700 text-slate-400"
                              }`}
                            >
                              {s.paid ? "Paid" : "Unpaid"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : signupsData?.signupListVisible && signupsData.roster.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Accepted Players ({signupsData.roster.length})
                </h2>
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                  {signupsData.roster.map((p, i) => (
                    <PlayerCard
                      key={p.player_id ?? i}
                      player={{
                        player_id: p.player_id ?? 0,
                        name: p.name ?? "Unknown",
                        nickname: p.nickname ?? "",
                        image_link: p.image_link,
                      }}
                      size="sm"
                      showLatestRating={false}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Sign up CTA */}
            {event.registration_status === "open" && !isDraft && (
              <div className="pt-2">
                {viewerSignupStatus && !canSignUpAgain ? (
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${signupStatusBadgeClass(viewerSignupStatus)}`}
                  >
                    {signupStatusLabel(viewerSignupStatus)}
                  </span>
                ) : isVerifiedPlayer ? (
                  <button
                    type="button"
                    onClick={() => setShowSignupModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    Sign Up!
                  </button>
                ) : (
                  <Link
                    href={`/register?eventId=${event.event_id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors"
                  >
                    Sign Up!
                  </Link>
                )}
              </div>
            )}

            {/* Edit form (inline) */}
            {editing && editForm && (
              <div className="rounded-xl border border-[#00C8DC]/30 bg-slate-900 p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#00C8DC]">
                  Edit Event
                </h3>

                {/* Required */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-2">
                    Required
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Event Name</label>
                      <input
                        type="text"
                        className={inputCls}
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, name: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Start Date</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={editForm.start_date}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, start_date: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Signup Deadline</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={editForm.signup_deadline}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, signup_deadline: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-700/60" />

                {/* Optional */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Optional
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>End Date</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={editForm.end_date}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, end_date: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Format</label>
                      <input
                        type="text"
                        className={inputCls}
                        placeholder="e.g. Doubles, Mixed"
                        value={editForm.format}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, format: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Estimated Player Pool</label>
                      <input
                        type="number"
                        min={1}
                        className={inputCls}
                        placeholder="e.g. 32"
                        value={editForm.player_limit}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, player_limit: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div />
                    <div>
                      <label className={labelCls}>Minimum Rating</label>
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="e.g. 2.00"
                        value={editForm.min_rating}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, min_rating: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Maximum Rating</label>
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="e.g. 4.00"
                        value={editForm.max_rating}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, max_rating: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-slate-500 -mt-1">
                      Guideline only — shown to players to help them
                      self-select. Doesn&apos;t block signup.
                    </p>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Description</label>
                      <textarea
                        rows={3}
                        className={inputCls}
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, description: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Other Notes</label>
                      <textarea
                        rows={2}
                        className={inputCls}
                        value={editForm.notes}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, notes: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Image URL</label>
                      <input
                        type="url"
                        className={inputCls}
                        placeholder="https://..."
                        value={editForm.image_url}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, image_url: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-700/60" />

                <Toggle
                  checked={editForm.signup_list_visible}
                  onChange={(v) =>
                    setEditForm((f) => (f ? { ...f, signup_list_visible: v } : f))
                  }
                  label="Signup list visible to others"
                  description="When on, anyone can see the players who've been accepted into this event."
                />

                {saveError && (
                  <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
                    {saveError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="inline-flex items-center rounded-full bg-[#00C8DC] px-5 py-1.5 text-sm font-bold text-slate-900 hover:bg-[#00b5c8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setSaveError(null);
                    }}
                    className="inline-flex items-center rounded-full border border-slate-700 px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </main>

      {showSignupModal && event && (
        <EventSignupConfirmModal
          eventName={event.name ?? `Event #${event.event_id}`}
          loading={signupSubmitting}
          error={signupError}
          onConfirm={() => void handleSignupConfirm()}
          onCancel={() => setShowSignupModal(false)}
        />
      )}
    </div>
  );
}
