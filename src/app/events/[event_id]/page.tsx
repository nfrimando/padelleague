"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Gauge, X } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import PlayerCard from "@/components/PlayerCard";
import Toggle from "@/components/Toggle";
import EventSignupConfirmModal from "@/components/EventSignupConfirmModal";
import EventPairSignupModal from "@/components/EventPairSignupModal";
import EventSignupCta, {
  EventSignupStickyBar,
  resolveSignupState,
  type ViewerSignupInfo,
} from "@/components/EventSignupCta";
import { useCurrentPlayer } from "@/lib/useCurrentPlayer";
import { useEventSignup } from "@/lib/useEventSignup";
import {
  signupStatusLabel,
  signupStatusBadgeClass,
  LOOKING_FOR_PARTNER_BADGE_CLASS,
  type EventSignupStatus,
} from "@/lib/eventSignupStatus";
import {
  isEventRated,
  ratedStatusBadgeClass,
  ratedStatusLabel,
} from "@/lib/eventRatedStatus";
import { supabase } from "@/lib/supabase";
import { checkIsAdmin } from "@/lib/adminCheck";
import { Event, EventRestrictions, PairPartnerView } from "@/lib/types";

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
  latest_rating: number | null;
};

type ManagedSignupRow = RosterPlayer & {
  id: string;
  status: EventSignupStatus;
  paid: boolean;
  pair_id: string | null;
  looking_for_partner: boolean;
};

type PendingInvite = {
  pair_id: string;
  initiator: RosterPlayer | null;
  invitee: RosterPlayer | null;
  created_at: string;
};

type SignupsResponse = {
  signupMode?: "individual" | "paired";
  signupListVisible: boolean;
  canManage: boolean;
  viewerSignup: ViewerSignupInfo | null;
  viewerIncomingInvite?: PairPartnerView | null;
  roster: (RosterPlayer & { pair_id?: string | null })[];
  signups?: ManagedSignupRow[];
  statusCounts?: Record<EventSignupStatus, number>;
  pairCounts?: {
    accepted_pairs: number;
    pending_invites: number;
    solo_looking: number;
  };
  pendingInvites?: PendingInvite[];
  capacity?: {
    player_limit: number | null;
    accepted_players: number;
    accepted_pairs: number;
    remaining: number | null;
  };
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
  if (start === end) return formatDate(start);
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
  registration_fee: string;
  min_rating: string;
  max_rating: string;
  description: string;
  notes: string;
  image_url: string;
  signup_list_visible: boolean;
  registration_open: boolean;
  is_rated: boolean;
  rating_details: string;
};

function makeEditForm(event: EventWithCreator): EditForm {
  return {
    name: event.name ?? "",
    start_date: event.start_date ?? "",
    signup_deadline: event.signup_deadline ?? "",
    end_date: event.end_date ?? "",
    format: event.format ?? "",
    player_limit: event.player_limit != null ? String(event.player_limit) : "",
    registration_fee:
      event.registration_fee != null ? String(event.registration_fee) : "",
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
    registration_open: event.registration_status === "open",
    is_rated: event.is_rated ?? true,
    rating_details: event.rating_details ?? "",
  };
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [signupsData, setSignupsData] = useState<SignupsResponse | null>(null);
  const [signupsLoading, setSignupsLoading] = useState(true);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [paymentJustCompleted, setPaymentJustCompleted] = useState(false);
  const [updatingSignupId, setUpdatingSignupId] = useState<string | null>(null);
  const [signupStatusError, setSignupStatusError] = useState<string | null>(null);
  const {
    handleSignup,
    loading: signupSubmitting,
    error: signupError,
  } = useEventSignup();

  // Detect return from PayMongo payment
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setPaymentJustCompleted(true);
      window.history.replaceState(null, "", `/events/${eventId}`);
    }
  }, [eventId]);

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
      setIsAdmin(await checkIsAdmin(supabase, user.id));
    }
    void checkAdmin();
  }, [isLinked]);

  // Load roster + viewer's own signup status. Extracted so every mutation can
  // refetch the real state instead of patching it optimistically.
  const loadSignups = useCallback(
    async (options: { showSpinner?: boolean } = {}) => {
      if (options.showSpinner !== false) setSignupsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/events/${eventId}/signups`, { headers });
      if (res.ok) {
        const json = (await res.json()) as SignupsResponse;
        setSignupsData(json);
      }
      setSignupsLoading(false);
    },
    [eventId],
  );

  useEffect(() => {
    async function run() {
      await loadSignups();
    }
    void run();
  }, [loadSignups]);

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
      registration_fee: editForm.registration_fee
        ? parseFloat(editForm.registration_fee)
        : null,
      description: editForm.description || null,
      notes: editForm.notes || null,
      image_url: editForm.image_url || null,
      signup_list_visible: editForm.signup_list_visible,
      registration_status: editForm.registration_open ? "open" : "closed",
      is_rated: editForm.is_rated,
      rating_details: editForm.is_rated
        ? editForm.rating_details.trim() || null
        : null,
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

  const handleUnpublish = async () => {
    if (!event) return;
    setPublishing(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setPublishing(false);
      return;
    }

    const res = await fetch(`/api/admin/events/${event.event_id}/unpublish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { event?: Event };
    if (res.ok && json.event) setEvent(json.event);
    setPublishing(false);
  };

  const handleDelete = async () => {
    if (!event) return;
    setDeleting(true);
    setDeleteError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setDeleteError("Not authenticated.");
      setDeleting(false);
      return;
    }

    const res = await fetch(`/api/events/${event.event_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setDeleteError(json.error ?? "Failed to delete event.");
      setDeleting(false);
      return;
    }

    router.push("/events");
  };

  const isDraft = event?.visibility === "draft";
  const rated = event ? isEventRated(event) : true;

  const restrictionTags: string[] = [];
  const r: EventRestrictions | null | undefined = event?.restrictions;
  if (r?.min_rating != null && r?.max_rating != null)
    restrictionTags.push(`Suggested rating ${r.min_rating}–${r.max_rating}`);
  else if (r?.min_rating != null)
    restrictionTags.push(`Suggested rating ≥ ${r.min_rating}`);
  else if (r?.max_rating != null)
    restrictionTags.push(`Suggested rating ≤ ${r.max_rating}`);

  const signupMode = signupsData?.signupMode ?? event?.signup_mode ?? "individual";
  const isPairedEvent = signupMode === "paired";
  const viewerSignup = signupsData?.viewerSignup ?? null;
  const viewerIncomingInvite = signupsData?.viewerIncomingInvite ?? null;
  const isVerifiedPlayer = isLinked && !!player?.is_profile_complete;
  const isManager = Boolean(signupsData?.canManage);

  const ctaState = event
    ? resolveSignupState({
        event,
        signupMode,
        viewerSignup,
        viewerIncomingInvite,
        isSignedIn: Boolean(player) || isLinked,
        isLinked,
        isVerified: isVerifiedPlayer,
      })
    : null;

  // The partner's own row, so the card can show whether they've paid.
  const partnerStatus = useMemo(() => {
    const partnerId = viewerSignup?.pair?.partner?.player_id;
    if (!partnerId || viewerSignup?.pair?.status !== "accepted") return null;
    const row = signupsData?.signups?.find(
      (s) => s.player_id != null && Number(s.player_id) === Number(partnerId),
    );
    return row ? { status: row.status, paid: row.paid } : null;
  }, [signupsData?.signups, viewerSignup?.pair]);

  // Players the partner picker must not offer: the viewer, and anyone already
  // holding a live signup or pair for this event.
  const excludedPartnerIds = useMemo(() => {
    const ids = new Set<number>();
    if (player?.player_id != null) ids.add(Number(player.player_id));
    for (const row of signupsData?.signups ?? []) {
      if (row.player_id == null) continue;
      if (row.status === "cancelled") continue;
      // A solo player looking for a partner is exactly who we want to offer.
      if (row.looking_for_partner && row.pair_id === null) continue;
      ids.add(Number(row.player_id));
    }
    for (const invite of signupsData?.pendingInvites ?? []) {
      if (invite.initiator?.player_id != null) ids.add(Number(invite.initiator.player_id));
      if (invite.invitee?.player_id != null) ids.add(Number(invite.invitee.player_id));
    }
    return [...ids];
  }, [player, signupsData?.signups, signupsData?.pendingInvites]);

  // Group the manager list so partners sit together in one block. Preserves the
  // server's ordering: a pair takes the position of whichever half came first.
  const groupedSignups = useMemo(() => {
    const rows = signupsData?.signups ?? [];
    const entries: { pairId: string | null; rows: ManagedSignupRow[] }[] = [];
    const indexByPair = new Map<string, number>();

    for (const row of rows) {
      if (row.pair_id) {
        const existing = indexByPair.get(row.pair_id);
        if (existing != null) {
          entries[existing].rows.push(row);
          continue;
        }
        indexByPair.set(row.pair_id, entries.length);
        entries.push({ pairId: row.pair_id, rows: [row] });
        continue;
      }
      entries.push({ pairId: null, rows: [row] });
    }
    return entries;
  }, [signupsData?.signups]);

  // Same grouping for the public roster, which only carries accepted players.
  const groupedRoster = useMemo(() => {
    const rows = signupsData?.roster ?? [];
    const pairs: (RosterPlayer & { pair_id?: string | null })[][] = [];
    const solos: (RosterPlayer & { pair_id?: string | null })[] = [];
    const indexByPair = new Map<string, number>();

    for (const row of rows) {
      const pairId = row.pair_id ?? null;
      if (!pairId) {
        solos.push(row);
        continue;
      }
      const existing = indexByPair.get(pairId);
      if (existing != null) {
        pairs[existing].push(row);
        continue;
      }
      indexByPair.set(pairId, pairs.length);
      pairs.push([row]);
    }
    return { pairs, solos };
  }, [signupsData?.roster]);

  const scrollToCta = () => {
    document
      .getElementById("event-signup-cta")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSignupConfirm = async () => {
    if (!event) return;
    const outcome = await handleSignup(event.event_id);
    if (outcome === "registered") {
      setShowSignupModal(false);
      await loadSignups({ showSpinner: false });
    }
  };

  /** Solo signup — on a paired event this flags the player as looking for a partner. */
  const handleSignupSolo = async () => {
    if (!event) return;
    if (!isPairedEvent) {
      setShowSignupModal(true);
      return;
    }
    setPairError(null);
    const outcome = await handleSignup(event.event_id, { lookingForPartner: true });
    if (outcome === "registered") {
      setShowPairModal(false);
      await loadSignups({ showSpinner: false });
    }
  };

  const handleSignupWithPartner = async (partnerPlayerId: number) => {
    if (!event) return;
    setPairError(null);
    const outcome = await handleSignup(event.event_id, { partnerPlayerId });
    if (outcome === "registered") {
      setShowPairModal(false);
      await loadSignups({ showSpinner: false });
    }
  };

  /** Shared wrapper for the pair endpoints — all of them just refetch on success. */
  const callPairEndpoint = async (
    path: string,
    method: "POST" | "DELETE",
  ): Promise<boolean> => {
    if (!event) return false;
    setPairBusy(true);
    setPairError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setPairError("Not authenticated.");
      setPairBusy(false);
      return false;
    }

    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setPairError(json.error ?? "Something went wrong. Please try again.");
      setPairBusy(false);
      return false;
    }

    await loadSignups({ showSpinner: false });
    setPairBusy(false);
    return true;
  };

  const handleAcceptInvite = (pairId: string) =>
    void callPairEndpoint(
      `/api/events/${eventId}/pairs/${pairId}/accept`,
      "POST",
    );

  const handleDeclineInvite = (pairId: string) =>
    void callPairEndpoint(
      `/api/events/${eventId}/pairs/${pairId}/decline`,
      "POST",
    );

  const handleCancelPair = (pairId: string) =>
    void callPairEndpoint(`/api/events/${eventId}/pairs/${pairId}`, "DELETE");

  const handleWithdraw = () =>
    void callPairEndpoint(`/api/events/${eventId}/signups/me/cancel`, "POST");

  const handleChangeSignupStatus = async (
    signupId: string,
    status: EventSignupStatus,
  ) => {
    if (!event) return;
    const previous = signupsData?.signups?.find((s) => s.id === signupId);
    if (!previous || previous.status === status) return;

    setUpdatingSignupId(signupId);
    setSignupStatusError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSignupStatusError("Not authenticated.");
      setUpdatingSignupId(null);
      return;
    }

    const res = await fetch(
      `/api/events/${event.event_id}/signups/${signupId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      },
    );

    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setSignupStatusError(json.error ?? "Failed to update status.");
      setUpdatingSignupId(null);
      return;
    }

    setSignupsData((d) => {
      if (!d?.signups || !d.statusCounts) return d;
      const statusCounts = { ...d.statusCounts };
      statusCounts[previous.status] -= 1;
      statusCounts[status] += 1;
      return {
        ...d,
        statusCounts,
        signups: d.signups.map((s) => (s.id === signupId ? { ...s, status } : s)),
      };
    });
    setUpdatingSignupId(null);
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
            {/* Payment success banner */}
            {paymentJustCompleted && (
              <div className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-300">
                    Payment Received
                  </p>
                  <p className="text-xs text-emerald-400/80 mt-0.5">
                    Your registration is being confirmed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentJustCompleted(false)}
                  className="text-emerald-400/60 hover:text-emerald-200 transition-colors shrink-0 cursor-pointer"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            )}

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

            {/* Published banner (admin-only) */}
            {!isDraft && isAdmin && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="flex-1 text-xs text-slate-500">
                  This event is published and visible on the events listing.
                </p>
                <button
                  type="button"
                  onClick={() => void handleUnpublish()}
                  disabled={publishing}
                  className="shrink-0 inline-flex items-center rounded-md border border-slate-600 px-4 py-1.5 text-sm font-medium text-slate-300 hover:border-slate-400 hover:text-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {publishing ? "Unpublishing…" : "Unpublish"}
                </button>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${ratedStatusBadgeClass(rated)}`}
                  >
                    <Gauge size={13} />
                    {ratedStatusLabel(rated)}
                  </span>
                  {restrictionTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-300"
                    >
                      <Gauge size={13} />
                      {tag}
                    </span>
                  ))}
                </div>
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

            {/* Sign up CTA — the primary call to action, stated unambiguously */}
            <div id="event-signup-cta">
              <EventSignupCta
                event={event}
                signupMode={signupMode}
                viewerSignup={viewerSignup}
                viewerIncomingInvite={viewerIncomingInvite}
                partnerStatus={partnerStatus}
                isSignedIn={Boolean(player) || isLinked}
                isLinked={isLinked}
                isVerified={isVerifiedPlayer}
                isManager={isManager}
                loading={signupsLoading}
                busy={pairBusy || signupSubmitting}
                error={pairError ?? signupError}
                onSignupSolo={() => void handleSignupSolo()}
                onOpenPartnerPicker={() => {
                  setPairError(null);
                  setShowPairModal(true);
                }}
                onAcceptInvite={handleAcceptInvite}
                onDeclineInvite={handleDeclineInvite}
                onCancelPair={handleCancelPair}
                onWithdraw={handleWithdraw}
              />
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
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Entry Fee
                </p>
                <p className="text-sm text-slate-200">
                  {event.requires_payment
                    ? `₱${(event.registration_fee ?? 0).toLocaleString()}`
                    : "Free"}
                </p>
              </div>
            </div>

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

            {/* Rating */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Rating
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ratedStatusBadgeClass(rated)}`}
                >
                  {ratedStatusLabel(rated)}
                </span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {rated
                  ? event.rating_details?.trim()
                    ? event.rating_details
                    : "Results from this event affect player ratings."
                  : "This event is unrated — results don't affect player ratings."}
              </p>
            </div>

            {/* Players */}
            {signupsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-[#00C8DC] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : signupsData?.canManage && signupsData.signups ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Players
                  </h2>
                  {signupsData.capacity?.player_limit != null && (
                    <span className="text-xs font-medium text-slate-500">
                      {signupsData.capacity.accepted_players} /{" "}
                      {signupsData.capacity.player_limit} players
                    </span>
                  )}
                </div>
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
                {isPairedEvent && signupsData.pairCounts && (
                  <div className="flex flex-wrap gap-2">
                    {signupsData.pairCounts.accepted_pairs > 0 && (
                      <span className="inline-flex items-center rounded-full border border-[#00C8DC]/30 bg-[#00C8DC]/5 px-3 py-1 text-xs font-medium text-[#00C8DC]">
                        Pairs: {signupsData.pairCounts.accepted_pairs}
                      </span>
                    )}
                    {signupsData.pairCounts.pending_invites > 0 && (
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                        Pending invites: {signupsData.pairCounts.pending_invites}
                      </span>
                    )}
                    {signupsData.pairCounts.solo_looking > 0 && (
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${LOOKING_FOR_PARTNER_BADGE_CLASS}`}
                      >
                        Looking for a partner: {signupsData.pairCounts.solo_looking}
                      </span>
                    )}
                  </div>
                )}
                {isPairedEvent && (signupsData.pendingInvites?.length ?? 0) > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                      Pending Partner Invites
                    </h3>
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                      {signupsData.pendingInvites!.map((invite) => (
                        <div
                          key={invite.pair_id}
                          className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                        >
                          <p className="text-[11px] text-slate-400">
                            <span className="font-bold text-slate-200">
                              {invite.initiator?.nickname ??
                                invite.initiator?.name ??
                                "Someone"}
                            </span>{" "}
                            invited{" "}
                            <span className="font-bold text-slate-200">
                              {invite.invitee?.nickname ??
                                invite.invitee?.name ??
                                "someone"}
                            </span>
                          </p>
                          <button
                            type="button"
                            disabled={pairBusy}
                            onClick={() => handleCancelPair(invite.pair_id)}
                            className="text-[11px] font-medium text-slate-400 hover:text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            Cancel invite
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {signupStatusError && (
                  <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
                    {signupStatusError}
                  </div>
                )}
                {signupsData.signups.length === 0 ? (
                  <p className="text-sm text-slate-500">No signups yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groupedSignups.map((entry) => {
                      const isPair = entry.pairId !== null && entry.rows.length > 1;
                      const paidCount = entry.rows.filter((r) => r.paid).length;
                      const showPaidSplit =
                        isPair &&
                        event.requires_payment &&
                        paidCount > 0 &&
                        paidCount < entry.rows.length;

                      return (
                        <div
                          key={entry.pairId ?? entry.rows[0].id}
                          className={
                            isPair
                              ? "sm:col-span-2 flex flex-col gap-2 rounded-lg border border-[#00C8DC]/25 bg-[#00C8DC]/5 px-3 py-2"
                              : "flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                          }
                        >
                          {isPair && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[#00C8DC]">
                                Pair
                              </span>
                              {showPaidSplit && (
                                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                                  {paidCount} / {entry.rows.length} paid
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500">
                                Changing one half changes both
                              </span>
                            </div>
                          )}

                          {entry.rows.map((s) => (
                            <div key={s.id} className="flex flex-col gap-2">
                              <PlayerCard
                                player={{
                                  player_id: s.player_id ?? 0,
                                  name: s.name ?? "Unknown",
                                  nickname: s.nickname ?? "",
                                  image_link: s.image_link,
                                  latest_rating: s.latest_rating,
                                }}
                                size="sm"
                                showLatestRating
                              />
                              <div className="flex items-center gap-2 border-t border-slate-800 pt-2">
                                <select
                                  value={s.status}
                                  disabled={updatingSignupId === s.id}
                                  onChange={(e) =>
                                    void handleChangeSignupStatus(
                                      s.id,
                                      e.target.value as EventSignupStatus,
                                    )
                                  }
                                  className={`flex-1 min-w-0 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40 disabled:opacity-50 cursor-pointer ${signupStatusBadgeClass(s.status)}`}
                                >
                                  {(
                                    [
                                      "applied",
                                      "pending_payment",
                                      "accepted",
                                      "waitlisted",
                                      "cancelled",
                                    ] as const
                                  ).map((statusOption) => (
                                    <option
                                      key={statusOption}
                                      value={statusOption}
                                      className="bg-slate-800 text-slate-100"
                                    >
                                      {signupStatusLabel(statusOption)}
                                    </option>
                                  ))}
                                </select>
                                {isPairedEvent &&
                                  !isPair &&
                                  s.looking_for_partner &&
                                  s.status !== "cancelled" && (
                                    <span
                                      className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${LOOKING_FOR_PARTNER_BADGE_CLASS}`}
                                    >
                                      Looking
                                    </span>
                                  )}
                                {event.requires_payment && s.status === "accepted" && (
                                  <span
                                    className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
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

                          {isPair && entry.pairId && (
                            <button
                              type="button"
                              disabled={pairBusy}
                              onClick={() => handleCancelPair(entry.pairId!)}
                              className="self-start text-[11px] font-medium text-slate-400 hover:text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                              Break up pair
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : signupsData?.signupListVisible && signupsData.roster.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Accepted Players ({signupsData.roster.length})
                </h2>
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                  {/* Teams first, so a paired roster reads as pairs rather than a list. */}
                  {groupedRoster.pairs.map((teamRows, teamIndex) => (
                    <div
                      key={teamRows[0].pair_id ?? `team-${teamIndex}`}
                      className="sm:col-span-2 space-y-2 rounded-lg border border-[#00C8DC]/25 bg-[#00C8DC]/5 px-3 py-2"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#00C8DC]">
                        Team
                      </span>
                      {teamRows.map((p, i) => (
                        <PlayerCard
                          key={p.player_id ?? i}
                          player={{
                            player_id: p.player_id ?? 0,
                            name: p.name ?? "Unknown",
                            nickname: p.nickname ?? "",
                            image_link: p.image_link,
                            latest_rating: p.latest_rating,
                          }}
                          size="sm"
                          showLatestRating
                        />
                      ))}
                    </div>
                  ))}
                  {groupedRoster.solos.map((p, i) => (
                    <PlayerCard
                      key={p.player_id ?? `solo-${i}`}
                      player={{
                        player_id: p.player_id ?? 0,
                        name: p.name ?? "Unknown",
                        nickname: p.nickname ?? "",
                        image_link: p.image_link,
                        latest_rating: p.latest_rating,
                      }}
                      size="sm"
                      showLatestRating
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Edit form modal */}
            {editing && editForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
                  onClick={() => {
                    setEditing(false);
                    setSaveError(null);
                  }}
                />
                <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[#00C8DC]/30 bg-slate-900 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#00C8DC]">
                  Edit Event
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setSaveError(null);
                  }}
                  className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
                </div>

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
                    <div>
                      <label className={labelCls}>Entry Fee (₱)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputCls}
                        placeholder="e.g. 1000"
                        value={editForm.registration_fee}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f ? { ...f, registration_fee: e.target.value } : f,
                          )
                        }
                      />
                    </div>
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
                  checked={editForm.is_rated}
                  onChange={(v) =>
                    setEditForm((f) => (f ? { ...f, is_rated: v } : f))
                  }
                  label="Rated event"
                  description="When on, playing this event affects player ratings. Turn off for casual / friendly events that don't count."
                />
                {editForm.is_rated && (
                  <div>
                    <label className={labelCls}>Rating Details</label>
                    <textarea
                      rows={2}
                      className={inputCls}
                      placeholder="How does this event affect ratings? (optional)"
                      value={editForm.rating_details}
                      onChange={(e) =>
                        setEditForm((f) =>
                          f ? { ...f, rating_details: e.target.value } : f,
                        )
                      }
                    />
                  </div>
                )}

                <Toggle
                  checked={editForm.registration_open}
                  onChange={(v) =>
                    setEditForm((f) => (f ? { ...f, registration_open: v } : f))
                  }
                  label="Registration open"
                  description="When on, players can sign up for this event. Turn off to pause new signups."
                />

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
              </div>
            )}

            {/* Danger zone */}
            {canEdit && (
              <div className="rounded-xl border border-rose-900/40 bg-rose-950/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-rose-300">
                    Delete Event
                  </p>
                  <p className="text-xs text-rose-400/70 mt-0.5">
                    This removes the event from the listing. This can&apos;t
                    be undone.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setShowDeleteConfirm(true);
                  }}
                  className="shrink-0 inline-flex items-center rounded-md border border-rose-700/60 px-4 py-1.5 text-sm font-medium text-rose-300 hover:bg-rose-900/30 hover:border-rose-600 transition-colors cursor-pointer"
                >
                  Delete Event
                </button>
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

      {showPairModal && event && (
        <EventPairSignupModal
          eventName={event.name ?? `Event #${event.event_id}`}
          registrationFee={event.registration_fee}
          requiresPayment={event.requires_payment}
          restrictions={event.restrictions}
          viewerRating={player?.latest_rating ?? null}
          excludePlayerIds={excludedPartnerIds}
          alreadySignedUp={Boolean(
            viewerSignup && viewerSignup.status !== "cancelled",
          )}
          loading={signupSubmitting || pairBusy}
          error={pairError ?? signupError}
          onConfirmPartner={(id) => void handleSignupWithPartner(id)}
          onConfirmSolo={() => void handleSignupSolo()}
          onCancel={() => {
            setShowPairModal(false);
            setPairError(null);
          }}
        />
      )}

      {event && ctaState && (
        <EventSignupStickyBar
          state={ctaState}
          signupMode={signupMode}
          incomingInvitePairId={viewerIncomingInvite?.pair_id ?? null}
          busy={pairBusy || signupSubmitting}
          onSignupSolo={() => void handleSignupSolo()}
          onOpenPartnerPicker={() => {
            setPairError(null);
            setShowPairModal(true);
          }}
          onAcceptInvite={handleAcceptInvite}
          onScrollToCard={scrollToCta}
        />
      )}

      {showDeleteConfirm && event && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={() => !deleting && setShowDeleteConfirm(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-rose-900/40 bg-slate-900 p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-rose-400">
              Delete Event
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-100">
                {event.name ?? `Event #${event.event_id}`}
              </span>
              ? This can&apos;t be undone.
            </p>
            {deleteError && (
              <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="inline-flex items-center rounded-full bg-rose-700 px-5 py-1.5 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {deleting ? "Deleting…" : "Delete Event"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="inline-flex items-center rounded-full border border-slate-700 px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
