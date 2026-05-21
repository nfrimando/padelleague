"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import PlayerSearchBox from "@/components/PlayerSearchBox";
import { supabase } from "@/lib/supabase";
import { usePlayerSearch } from "@/lib/usePlayerSearch";
import { usePlayers } from "@/lib/usePlayers";
import { Player } from "@/lib/types";

type AdminEventRow = {
  event_id: number;
  name?: string | null;
  event_type: string;
  start_date?: string | null;
  end_date?: string | null;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  image_url?: string | null;
  description?: string | null;
  registration_fee?: number | null;
  payment_instructions?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

type SignupStatus = "applied" | "pending_payment" | "accepted" | "waitlisted" | "cancelled";

type AdminSignupRow = {
  id: string;
  event_id: number;
  player_id: number | null;
  status: SignupStatus;
  applicant_name?: string | null;
  applicant_contact?: string | null;
  applicant_email?: string | null;
  created_at: string;
  updated_at: string;
  player: {
    player_id: number;
    name: string | null;
    email: string | null;
    nickname: string | null;
    image_link: string | null;
  } | null;
};

type EventEditForm = {
  name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  image_url: string;
  description: string;
  registration_fee: string;
  payment_instructions: string;
};

type PayForm = {
  method: "cash" | "bank_transfer" | "gcash" | "other";
  amount: string;
  reference_number: string;
  notes: string;
};

type EventStatusFilter = "non_completed" | "upcoming" | "ongoing" | "completed" | "all";

const EMPTY_PAY_FORM: PayForm = { method: "cash", amount: "", reference_number: "", notes: "" };

function makeEditDraft(e: AdminEventRow): EventEditForm {
  return {
    name: e.name ?? "",
    event_type: e.event_type,
    start_date: e.start_date ?? "",
    end_date: e.end_date ?? "",
    registration_status: e.registration_status,
    status: e.status,
    image_url: e.image_url ?? "",
    description: e.description ?? "",
    registration_fee: e.registration_fee != null ? String(e.registration_fee) : "",
    payment_instructions: e.payment_instructions ?? "",
  };
}

const inputCls =
  "block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";
const labelCls =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5";

const SIGNUP_STATUS_OPTIONS: SignupStatus[] = [
  "applied",
  "pending_payment",
  "accepted",
  "waitlisted",
  "cancelled",
];

const SIGNUP_STATUS_ORDER: SignupStatus[] = [
  "accepted",
  "pending_payment",
  "applied",
  "waitlisted",
  "cancelled",
];

export function EventsTab({ enabled }: { enabled: boolean }) {
  const { players } = usePlayers({ enabled, orderByName: true });
  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>("non_completed");

  const [updatingEventId, setUpdatingEventId] = useState<number | null>(null);

  // Single selection — replaces editingEventId + expandedSignupsEventId
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EventEditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [signupsByEvent, setSignupsByEvent] = useState<Record<number, AdminSignupRow[]>>({});
  const [signupStatusDrafts, setSignupStatusDrafts] = useState<Record<string, SignupStatus>>({});
  const [loadingSignupsEventId, setLoadingSignupsEventId] = useState<number | null>(null);
  const [savingSignupId, setSavingSignupId] = useState<string | null>(null);
  const [signupPanelError, setSignupPanelError] = useState<string | null>(null);

  const [addSignupSearch, setAddSignupSearch] = useState("");
  const [addSignupStatus, setAddSignupStatus] = useState<SignupStatus>("applied");
  const [addSignupSelectedPlayer, setAddSignupSelectedPlayer] = useState<Player | null>(null);
  const [creatingSignup, setCreatingSignup] = useState(false);

  const [markingPaidSignupId, setMarkingPaidSignupId] = useState<string | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState<PayForm>(EMPTY_PAY_FORM);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);

  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState<SignupStatus>("accepted");
  const [bulkSaving, setBulkSaving] = useState(false);

  const [bulkMarkPaidOpen, setBulkMarkPaidOpen] = useState(false);
  const [bulkMarkPaidForm, setBulkMarkPaidForm] = useState<PayForm>(EMPTY_PAY_FORM);
  const [bulkMarkPaidLoading, setBulkMarkPaidLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [eventInfoExpanded, setEventInfoExpanded] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkAddSearch, setBulkAddSearch] = useState("");
  const [bulkAddSelectedIds, setBulkAddSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAddStatus, setBulkAddStatus] = useState<SignupStatus>("applied");
  const [bulkAddLoading, setBulkAddLoading] = useState(false);

  const [signupSearch, setSignupSearch] = useState("");

  const addSignupSuggestions = usePlayerSearch(players, addSignupSearch);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const loadEvents = useCallback(async () => {
    if (!enabled) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) { setError("No active session."); setLoading(false); return; }
    const query = showArchived ? "?include_deleted=true" : "";
    const res = await fetch(`/api/admin/events${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { error?: string; events?: AdminEventRow[] };
    if (!res.ok) { setError(json.error ?? "Failed to load events."); setEvents([]); }
    else { setEvents((json.events ?? []) as AdminEventRow[]); }
    setLoading(false);
  }, [enabled, getAccessToken, showArchived]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const loadSignupsForEvent = useCallback(async (eventId: number) => {
    setLoadingSignupsEventId(eventId);
    setSignupPanelError(null);
    const token = await getAccessToken();
    if (!token) { setSignupPanelError("No active session."); setLoadingSignupsEventId(null); return; }
    const res = await fetch(`/api/admin/signups?event_id=${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { error?: string; signups?: AdminSignupRow[] };
    if (!res.ok) { setSignupPanelError(json.error ?? "Failed to load signups."); setLoadingSignupsEventId(null); return; }
    const rows = (json.signups ?? []) as AdminSignupRow[];
    setSignupsByEvent(prev => ({ ...prev, [eventId]: rows }));
    setSignupStatusDrafts(prev => {
      const next = { ...prev };
      rows.forEach(row => { next[row.id] = row.status; });
      return next;
    });
    setLoadingSignupsEventId(null);
  }, [getAccessToken]);

  // Derived
  const selectedEvent = selectedEventId !== null
    ? (events.find(e => e.event_id === selectedEventId) ?? null)
    : null;
  const eventSignups = selectedEventId !== null ? (signupsByEvent[selectedEventId] ?? []) : [];

  const editDraftDirty = useMemo(() => {
    if (!editDraft || !selectedEvent) return false;
    const original = makeEditDraft(selectedEvent);
    return (Object.keys(editDraft) as (keyof EventEditForm)[]).some(k => editDraft[k] !== original[k]);
  }, [editDraft, selectedEvent]);

  const signupSummary = useMemo(() => {
    const counts: Partial<Record<SignupStatus, number>> = {};
    for (const s of eventSignups) counts[s.status] = (counts[s.status] ?? 0) + 1;
    return counts;
  }, [eventSignups]);

  const sortedFilteredSignups = useMemo(() => {
    const getName = (s: AdminSignupRow) =>
      s.player?.name || s.player?.nickname || s.applicant_name || "";
    const sorted = [...eventSignups].sort((a, b) =>
      getName(a).localeCompare(getName(b))
    );
    const q = signupSearch.toLowerCase().trim();
    if (!q) return sorted;
    return sorted.filter(s =>
      getName(s).toLowerCase().includes(q) ||
      (s.player?.email || s.applicant_email || s.applicant_contact || "").toLowerCase().includes(q)
    );
  }, [eventSignups, signupSearch]);

  const alreadySignedUpPlayerIds = useMemo(
    () => new Set(eventSignups.map(s => s.player_id).filter((id): id is number => id !== null)),
    [eventSignups],
  );

  const bulkAddFilteredPlayers = useMemo(() => {
    const q = bulkAddSearch.toLowerCase().trim();
    return players.filter(p => {
      if (alreadySignedUpPlayerIds.has(Number(p.player_id))) return false;
      if (!q) return true;
      return (p.name?.toLowerCase().includes(q) ?? false) || (p.nickname?.toLowerCase().includes(q) ?? false);
    });
  }, [players, bulkAddSearch, alreadySignedUpPlayerIds]);

  const filteredEvents = events.filter(event => {
    if (statusFilter === "all") return true;
    if (statusFilter === "non_completed") return event.status !== "completed";
    return event.status === statusFilter;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDeselectEvent = () => {
    setSelectedEventId(null);
    setEditDraft(null);
    setBulkSelectedIds(new Set());
    setMarkingPaidSignupId(null);
    setMarkPaidForm(EMPTY_PAY_FORM);
    setSignupPanelError(null);
    setEventInfoExpanded(false);
    setShowBulkAdd(false);
    setBulkAddSearch("");
    setBulkAddSelectedIds(new Set());
    setSignupSearch("");
    setBulkMarkPaidOpen(false);
    setBulkMarkPaidForm(EMPTY_PAY_FORM);
  };

  const handleSelectEvent = async (event: AdminEventRow) => {
    if (selectedEventId === event.event_id) { handleDeselectEvent(); return; }
    setSelectedEventId(event.event_id);
    setEditDraft(makeEditDraft(event));
    setBulkSelectedIds(new Set());
    setMarkingPaidSignupId(null);
    setMarkPaidForm(EMPTY_PAY_FORM);
    setAddSignupSearch("");
    setAddSignupSelectedPlayer(null);
    setAddSignupStatus("applied");
    setSignupPanelError(null);
    setSuccess(null);
    setError(null);
    setEventInfoExpanded(false);
    setShowBulkAdd(false);
    setBulkAddSearch("");
    setBulkAddSelectedIds(new Set());
    setSignupSearch("");
    setBulkMarkPaidOpen(false);
    setBulkMarkPaidForm(EMPTY_PAY_FORM);
    if (!signupsByEvent[event.event_id]) {
      await loadSignupsForEvent(event.event_id);
    } else {
      setSignupStatusDrafts(prev => {
        const next = { ...prev };
        (signupsByEvent[event.event_id] ?? []).forEach(row => { next[row.id] = row.status; });
        return next;
      });
    }
  };

  const handleEditDraftChange = (field: keyof EventEditForm, value: string) => {
    setEditDraft(prev => prev ? { ...prev, [field]: value } as EventEditForm : prev);
  };

  const handleSaveEdit = async (eventId: number) => {
    if (!editDraft) return;
    setSavingEdit(true);
    setError(null);
    setSuccess(null);
    const token = await getAccessToken();
    if (!token) { setError("No active session."); setSavingEdit(false); return; }
    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        event_id: eventId,
        name: editDraft.name || null,
        event_type: editDraft.event_type,
        start_date: editDraft.start_date || null,
        end_date: editDraft.end_date || null,
        registration_status: editDraft.registration_status,
        status: editDraft.status,
        image_url: editDraft.image_url || null,
        description: editDraft.description || null,
        registration_fee: editDraft.registration_fee ? Number(editDraft.registration_fee) : null,
        payment_instructions: editDraft.payment_instructions || null,
      }),
    });
    const json = (await res.json()) as { error?: string; event?: AdminEventRow };
    if (!res.ok) { setError(json.error ?? "Failed to update event."); setSavingEdit(false); return; }
    if (json.event) {
      setEvents(prev => prev.map(e => e.event_id === eventId ? (json.event as AdminEventRow) : e));
      setEditDraft(makeEditDraft(json.event as AdminEventRow));
      setSuccess("Saved.");
    }
    setSavingEdit(false);
  };

  const handleToggleReg = async (event: AdminEventRow) => {
    setUpdatingEventId(event.event_id);
    const newStatus = event.registration_status === "open" ? "closed" : "open";
    const token = await getAccessToken();
    if (!token) { setUpdatingEventId(null); setError("No active session."); return; }
    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: event.event_id, registration_status: newStatus }),
    });
    if (res.ok) {
      const json = (await res.json()) as { event?: AdminEventRow };
      if (json.event) setEvents(prev => prev.map(e => e.event_id === event.event_id ? (json.event as AdminEventRow) : e));
    }
    setUpdatingEventId(null);
  };

  const handleArchive = async (event: AdminEventRow) => {
    if (!window.confirm("Archive this event?")) return;
    setUpdatingEventId(event.event_id);
    setError(null);
    setSuccess(null);
    const token = await getAccessToken();
    if (!token) { setError("No active session."); setUpdatingEventId(null); return; }
    const res = await fetch("/api/admin/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: event.event_id }),
    });
    const json = (await res.json()) as { error?: string; event?: AdminEventRow };
    if (res.status === 409) {
      setError(json.error ?? "Event has active signups. Cancel all signups first.");
      setUpdatingEventId(null);
      return;
    }
    if (!res.ok) { setError(json.error ?? "Failed to archive event."); setUpdatingEventId(null); return; }
    if (showArchived) {
      if (json.event) setEvents(prev => prev.map(e => e.event_id === event.event_id ? (json.event as AdminEventRow) : e));
    } else {
      setEvents(prev => prev.filter(e => e.event_id !== event.event_id));
    }
    if (selectedEventId === event.event_id) handleDeselectEvent();
    setSuccess("Event archived.");
    setUpdatingEventId(null);
  };

  const handleRestore = async (eventId: number) => {
    setUpdatingEventId(eventId);
    setError(null);
    setSuccess(null);
    const token = await getAccessToken();
    if (!token) { setError("No active session."); setUpdatingEventId(null); return; }
    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: eventId, deleted_at: null }),
    });
    const json = (await res.json()) as { error?: string; event?: AdminEventRow };
    if (!res.ok) { setError(json.error ?? "Failed to restore event."); setUpdatingEventId(null); return; }
    if (json.event) setEvents(prev => prev.map(e => e.event_id === eventId ? (json.event as AdminEventRow) : e));
    setSuccess("Event restored.");
    setUpdatingEventId(null);
  };

  const handleSaveSignupStatus = async (eventId: number, signupId: string) => {
    const status = signupStatusDrafts[signupId];
    if (!status) return;
    setSavingSignupId(signupId);
    setSignupPanelError(null);
    const token = await getAccessToken();
    if (!token) { setSignupPanelError("No active session."); setSavingSignupId(null); return; }
    const res = await fetch(`/api/admin/signups/${encodeURIComponent(signupId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const json = (await res.json()) as { error?: string; signup?: { status: SignupStatus } };
    if (!res.ok) { setSignupPanelError(json.error ?? "Failed to update signup."); setSavingSignupId(null); return; }
    if (json.signup) {
      setSignupsByEvent(prev => ({
        ...prev,
        [eventId]: (prev[eventId] ?? []).map(row =>
          row.id === signupId ? { ...row, status: json.signup!.status } : row,
        ),
      }));
    }
    setSavingSignupId(null);
  };

  const handleAddSignup = async (eventId: number) => {
    if (!addSignupSelectedPlayer?.player_id) { setSignupPanelError("Select a player to add."); return; }
    setCreatingSignup(true);
    setSignupPanelError(null);
    const token = await getAccessToken();
    if (!token) { setSignupPanelError("No active session."); setCreatingSignup(false); return; }
    const res = await fetch("/api/admin/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: eventId, player_id: Number(addSignupSelectedPlayer.player_id), status: addSignupStatus }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) { setSignupPanelError(json.error ?? "Failed to add signup."); setCreatingSignup(false); return; }
    setAddSignupSearch("");
    setAddSignupSelectedPlayer(null);
    setAddSignupStatus("applied");
    setCreatingSignup(false);
    await loadSignupsForEvent(eventId);
  };

  const handleOpenMarkPaid = (signupId: string) => {
    setMarkingPaidSignupId(signupId);
    setMarkPaidForm(EMPTY_PAY_FORM);
    setSignupPanelError(null);
  };

  const handleMarkPaid = async (eventId: number, signupId: string) => {
    const amount = Number(markPaidForm.amount);
    if (!amount || amount <= 0) { setSignupPanelError("Enter a valid amount."); return; }
    setMarkPaidLoading(true);
    setSignupPanelError(null);
    const token = await getAccessToken();
    if (!token) { setSignupPanelError("No active session."); setMarkPaidLoading(false); return; }
    const res = await fetch(`/api/admin/signups/${encodeURIComponent(signupId)}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        method: markPaidForm.method,
        amount,
        reference_number: markPaidForm.reference_number || undefined,
        notes: markPaidForm.notes || undefined,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) { setSignupPanelError(json.error ?? "Failed to record payment."); setMarkPaidLoading(false); return; }
    setMarkingPaidSignupId(null);
    setMarkPaidForm(EMPTY_PAY_FORM);
    setMarkPaidLoading(false);
    await loadSignupsForEvent(eventId);
  };

  const handleBulkToggleAll = (signups: AdminSignupRow[]) => {
    if (bulkSelectedIds.size === signups.length) setBulkSelectedIds(new Set());
    else setBulkSelectedIds(new Set(signups.map(s => s.id)));
  };

  const handleBulkToggleOne = (id: string) => {
    setBulkSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApply = async (eventId: number) => {
    if (bulkSelectedIds.size === 0) return;
    setBulkSaving(true);
    setSignupPanelError(null);
    const token = await getAccessToken();
    if (!token) { setSignupPanelError("No active session."); setBulkSaving(false); return; }
    const ids = Array.from(bulkSelectedIds);
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`/api/admin/signups/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: bulkTargetStatus }),
        }),
      ),
    );
    const failures = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
    if (failures > 0) setSignupPanelError(`${failures} of ${ids.length} updates failed.`);
    await loadSignupsForEvent(eventId);
    setBulkSelectedIds(new Set());
    setBulkSaving(false);
  };

  const handleBulkMarkPaid = async (eventId: number) => {
    const amount = Number(bulkMarkPaidForm.amount);
    if (!amount || amount <= 0) { setSignupPanelError("Enter a valid amount."); return; }
    setBulkMarkPaidLoading(true);
    setSignupPanelError(null);
    const token = await getAccessToken();
    if (!token) { setSignupPanelError("No active session."); setBulkMarkPaidLoading(false); return; }
    const pendingIds = Array.from(bulkSelectedIds).filter(id =>
      eventSignups.find(s => s.id === id)?.status === "pending_payment"
    );
    if (pendingIds.length === 0) {
      setSignupPanelError("No selected signups are in pending_payment status.");
      setBulkMarkPaidLoading(false);
      return;
    }
    const results = await Promise.allSettled(
      pendingIds.map(id =>
        fetch(`/api/admin/signups/${encodeURIComponent(id)}/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            method: bulkMarkPaidForm.method,
            amount,
            reference_number: bulkMarkPaidForm.reference_number || undefined,
            notes: bulkMarkPaidForm.notes || undefined,
          }),
        }),
      ),
    );
    const failures = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
    if (failures > 0) setSignupPanelError(`${failures} of ${pendingIds.length} payments failed.`);
    await loadSignupsForEvent(eventId);
    setBulkSelectedIds(new Set());
    setBulkMarkPaidOpen(false);
    setBulkMarkPaidForm(EMPTY_PAY_FORM);
    setBulkMarkPaidLoading(false);
  };

  const handleBulkAddSignups = async (eventId: number) => {
    if (bulkAddSelectedIds.size === 0) return;
    setBulkAddLoading(true);
    setSignupPanelError(null);
    const token = await getAccessToken();
    if (!token) { setSignupPanelError("No active session."); setBulkAddLoading(false); return; }
    const ids = Array.from(bulkAddSelectedIds);
    const results = await Promise.allSettled(
      ids.map(playerId =>
        fetch("/api/admin/signups", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event_id: eventId, player_id: playerId, status: bulkAddStatus }),
        }),
      ),
    );
    const failures = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
    if (failures > 0) setSignupPanelError(`${failures} of ${ids.length} signups failed.`);
    await loadSignupsForEvent(eventId);
    setBulkAddSelectedIds(new Set());
    setBulkAddSearch("");
    setBulkAddLoading(false);
  };

  const regBadge = (s: string) =>
    s === "open"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";

  const statusBadge = (s: string) => {
    if (s === "ongoing") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    if (s === "completed") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Manage Events</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Click an event to edit details and manage signups.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            { value: "non_completed", label: "Open + Ongoing" },
            { value: "upcoming", label: "Upcoming" },
            { value: "ongoing", label: "Ongoing" },
            { value: "completed", label: "Completed" },
            { value: "all", label: "All" },
          ] as { value: EventStatusFilter; label: string }[]).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "border-[#00C8DC] bg-[#00C8DC]/10 text-[#00C8DC]"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={ev => setShowArchived(ev.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700"
          />
          Show archived
        </label>
      </div>

      {/* Global messages */}
      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      )}

      {/* Event list */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? (
          <div className="py-10 text-center text-slate-500 animate-pulse text-sm">Loading…</div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-10 text-center text-slate-500 dark:text-slate-400 text-sm">
            No events match the current filters.
          </div>
        ) : (
          filteredEvents.map(e => {
            const isSelected = selectedEventId === e.event_id;
            const isArchived = !!e.deleted_at;
            return (
              <div
                key={e.event_id}
                role="button"
                tabIndex={0}
                onClick={() => void handleSelectEvent(e)}
                onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") void handleSelectEvent(e); }}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-2 ${
                  isSelected
                    ? "border-[#00C8DC] bg-[#00C8DC]/5"
                    : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {e.name ?? `Event ${e.event_id}`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {e.start_date && e.end_date ? `${e.start_date} → ${e.end_date}` : "Dates TBD"}
                    {" · "}
                    {e.event_type}
                    {isArchived && " · Archived"}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase shrink-0 ${statusBadge(e.status)}`}>
                  {e.status}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase shrink-0 ${regBadge(e.registration_status)}`}>
                  Reg: {e.registration_status}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Detail panel */}
      {selectedEvent && editDraft && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">

          {/* Detail header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex-wrap">
            <button
              type="button"
              onClick={handleDeselectEvent}
              className="text-xs font-medium text-[#00C8DC] hover:underline shrink-0"
            >
              ← Back
            </button>
            <p className="flex-1 min-w-0 font-semibold text-slate-900 dark:text-slate-100 truncate">
              {selectedEvent.name ?? `Event ${selectedEvent.event_id}`}
            </p>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {!selectedEvent.deleted_at && (
                <button
                  type="button"
                  disabled={updatingEventId === selectedEvent.event_id}
                  onClick={() => void handleToggleReg(selectedEvent)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 transition-colors"
                >
                  {updatingEventId === selectedEvent.event_id
                    ? "…"
                    : selectedEvent.registration_status === "open"
                      ? "Close Reg"
                      : "Open Reg"}
                </button>
              )}
              {selectedEvent.deleted_at ? (
                <button
                  type="button"
                  disabled={updatingEventId === selectedEvent.event_id}
                  onClick={() => void handleRestore(selectedEvent.event_id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 text-emerald-700 dark:text-emerald-300 transition-colors"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  disabled={updatingEventId === selectedEvent.event_id}
                  onClick={() => void handleArchive(selectedEvent)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-rose-200 dark:border-rose-900/70 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 text-rose-700 dark:text-rose-300 transition-colors"
                >
                  Archive
                </button>
              )}
            </div>
          </div>

          {/* Event Info */}
          <div className="border-b border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setEventInfoExpanded(prev => !prev)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
                  Event Info
                </span>
                {!eventInfoExpanded && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {[
                      selectedEvent.registration_fee != null && `₱${selectedEvent.registration_fee.toLocaleString()}`,
                      selectedEvent.status,
                      `reg ${selectedEvent.registration_status}`,
                    ].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <span className="flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors shrink-0">
                {eventInfoExpanded ? "collapse" : "edit"}
                <ChevronRight size={12} className={`transition-transform duration-150 ${eventInfoExpanded ? "rotate-90" : ""}`} />
              </span>
            </button>

            {eventInfoExpanded && (
              <div className="px-4 pb-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input type="text" className={inputCls} value={editDraft.name}
                      onChange={ev => handleEditDraftChange("name", ev.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Type</label>
                    <input type="text" className={inputCls} value={editDraft.event_type}
                      onChange={ev => handleEditDraftChange("event_type", ev.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Start Date</label>
                    <input type="date" className={inputCls} value={editDraft.start_date}
                      onChange={ev => handleEditDraftChange("start_date", ev.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>End Date</label>
                    <input type="date" className={inputCls} value={editDraft.end_date}
                      onChange={ev => handleEditDraftChange("end_date", ev.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Registration Fee (PHP)</label>
                    <input type="number" min="0" className={inputCls} placeholder="1000"
                      value={editDraft.registration_fee}
                      onChange={ev => handleEditDraftChange("registration_fee", ev.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Registration</label>
                    <select className={inputCls} value={editDraft.registration_status}
                      onChange={ev => handleEditDraftChange("registration_status", ev.target.value)}>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select className={inputCls} value={editDraft.status}
                      onChange={ev => handleEditDraftChange("status", ev.target.value)}>
                      <option value="upcoming">Upcoming</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelCls}>Image URL (optional)</label>
                    <input type="url" className={inputCls} placeholder="https://…"
                      value={editDraft.image_url}
                      onChange={ev => handleEditDraftChange("image_url", ev.target.value)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelCls}>Description (optional)</label>
                    <textarea rows={3} className={inputCls} placeholder="Short description…"
                      value={editDraft.description}
                      onChange={ev => handleEditDraftChange("description", ev.target.value)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelCls}>Payment Instructions (optional)</label>
                    <textarea rows={4} className={inputCls}
                      placeholder={"e.g. Bank: BDO\nAccount: 1234567890\nGCash: 0917-xxx-xxxx"}
                      value={editDraft.payment_instructions}
                      onChange={ev => handleEditDraftChange("payment_instructions", ev.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleSaveEdit(selectedEvent.event_id)}
                    disabled={!editDraftDirty || savingEdit}
                    className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {savingEdit ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Signups */}
          <div className="px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
              Signups
              {loadingSignupsEventId !== selectedEvent.event_id && eventSignups.length > 0
                ? ` (${eventSignups.length})`
                : ""}
            </p>

            {loadingSignupsEventId === selectedEvent.event_id ? (
              <div className="py-6 text-center text-sm text-slate-500 animate-pulse">Loading…</div>
            ) : (
              <>
                {/* Summary */}
                {eventSignups.length > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    {SIGNUP_STATUS_ORDER
                      .filter(s => (signupSummary[s] ?? 0) > 0)
                      .map(s => `${signupSummary[s]!} ${s}`)
                      .join(" · ")}
                  </p>
                )}

                {/* Add signup — single */}
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-52">
                    <PlayerSearchBox
                      value={addSignupSearch}
                      suggestions={addSignupSuggestions}
                      onValueChange={setAddSignupSearch}
                      onClear={() => { setAddSignupSearch(""); setAddSignupSelectedPlayer(null); }}
                      onSelectPlayer={player => {
                        setAddSignupSelectedPlayer(player);
                        setAddSignupSearch(String(player.name || "").trim());
                      }}
                      selectedPlayerName={addSignupSelectedPlayer?.name ?? null}
                      maxSuggestions={6}
                      placeholder="Search players…"
                      showSuggestions
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select className={inputCls} value={addSignupStatus}
                      onChange={ev => setAddSignupStatus(ev.target.value as SignupStatus)}>
                      {SIGNUP_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddSignup(selectedEvent.event_id)}
                    disabled={creatingSignup || !addSignupSelectedPlayer}
                    className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {creatingSignup ? "Adding…" : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowBulkAdd(prev => !prev); setBulkAddSearch(""); setBulkAddSelectedIds(new Set()); }}
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border ${
                      showBulkAdd
                        ? "border-[#00C8DC] text-[#00C8DC] bg-[#00C8DC]/5"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    Bulk add
                    <ChevronRight size={11} className={`transition-transform duration-150 ${showBulkAdd ? "rotate-90" : ""}`} />
                  </button>
                </div>

                {/* Add signup — bulk */}
                {showBulkAdd && (
                  <div className="mt-2 mb-4 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
                      <input
                        type="text"
                        className={inputCls}
                        placeholder="Filter players by name or nickname…"
                        value={bulkAddSearch}
                        onChange={ev => setBulkAddSearch(ev.target.value)}
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {bulkAddFilteredPlayers.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                          {players.length === 0 ? "Loading players…" : "No players available to add."}
                        </div>
                      ) : (
                        bulkAddFilteredPlayers.map(player => {
                          const pid = Number(player.player_id);
                          return (
                            <label
                              key={pid}
                              className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={bulkAddSelectedIds.has(pid)}
                                onChange={() => setBulkAddSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(pid)) next.delete(pid); else next.add(pid);
                                  return next;
                                })}
                              />
                              <span className="text-sm text-slate-900 dark:text-slate-100">{player.name}</span>
                              {player.nickname && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">&ldquo;{player.nickname}&rdquo;</span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                        {bulkAddSelectedIds.size > 0 ? `${bulkAddSelectedIds.size} selected` : "Select players above"}
                      </span>
                      <div className="flex-1" />
                      <select
                        className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100 text-xs"
                        value={bulkAddStatus}
                        onChange={ev => setBulkAddStatus(ev.target.value as SignupStatus)}
                      >
                        {SIGNUP_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={bulkAddSelectedIds.size === 0 || bulkAddLoading}
                        onClick={() => void handleBulkAddSignups(selectedEvent.event_id)}
                        className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {bulkAddLoading ? "Adding…" : `Add ${bulkAddSelectedIds.size || ""} Players`.trim()}
                      </button>
                    </div>
                  </div>
                )}

                {!showBulkAdd && <div className="mb-4" />}

                {eventSignups.length > 0 ? (
                  <>
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        className={`${inputCls} flex-1 min-w-36`}
                        placeholder="Search signups by name or email…"
                        value={signupSearch}
                        onChange={ev => setSignupSearch(ev.target.value)}
                      />
                      {bulkSelectedIds.size > 0 && (
                        <>
                          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                            {bulkSelectedIds.size} selected
                          </span>
                          <select
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-900 dark:text-slate-100 text-xs shrink-0"
                            value={bulkTargetStatus}
                            onChange={ev => setBulkTargetStatus(ev.target.value as SignupStatus)}
                          >
                            {SIGNUP_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleBulkApply(selectedEvent.event_id)}
                            disabled={bulkSaving || bulkMarkPaidLoading}
                            className="inline-flex items-center rounded-md bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors shrink-0"
                          >
                            {bulkSaving ? "Applying…" : "Set status"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setBulkMarkPaidOpen(true); setBulkMarkPaidForm(EMPTY_PAY_FORM); setSignupPanelError(null); }}
                            disabled={bulkSaving || bulkMarkPaidLoading}
                            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                          >
                            Mark Paid…
                          </button>
                        </>
                      )}
                    </div>

                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                          <tr>
                            <th className="w-8 px-3 py-2">
                              <input
                                type="checkbox"
                                ref={el => {
                                  if (el) el.indeterminate = bulkSelectedIds.size > 0 && bulkSelectedIds.size < sortedFilteredSignups.length;
                                }}
                                checked={sortedFilteredSignups.length > 0 && bulkSelectedIds.size === sortedFilteredSignups.length}
                                onChange={() => handleBulkToggleAll(sortedFilteredSignups)}
                              />
                            </th>
                            <th className="text-left px-3 py-2">Player</th>
                            <th className="text-left px-3 py-2">Contact</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2 w-16">Save</th>
                            <th className="text-left px-3 py-2 w-28">Payment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedFilteredSignups.map(signup => (
                            <Fragment key={signup.id}>
                              <tr className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={bulkSelectedIds.has(signup.id)}
                                    onChange={() => handleBulkToggleOne(signup.id)}
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle text-slate-900 dark:text-slate-100">
                                  {signup.player?.name ||
                                    signup.player?.nickname ||
                                    signup.applicant_name ||
                                    (signup.player_id != null ? `Player ${signup.player_id}` : "Guest")}
                                </td>
                                <td className="px-3 py-2 align-middle text-slate-600 dark:text-slate-300">
                                  {signup.player?.email || signup.applicant_email || signup.applicant_contact || "—"}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <select
                                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100 text-xs"
                                    value={signupStatusDrafts[signup.id] ?? signup.status}
                                    onChange={ev =>
                                      setSignupStatusDrafts(prev => ({
                                        ...prev,
                                        [signup.id]: ev.target.value as SignupStatus,
                                      }))
                                    }
                                  >
                                    {SIGNUP_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveSignupStatus(selectedEvent.event_id, signup.id)}
                                    disabled={
                                      savingSignupId === signup.id ||
                                      (signupStatusDrafts[signup.id] ?? signup.status) === signup.status
                                    }
                                    className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors"
                                  >
                                    {savingSignupId === signup.id ? "…" : "Save"}
                                  </button>
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  {signup.status === "pending_payment" && (
                                    <button
                                      type="button"
                                      onClick={() => { handleOpenMarkPaid(signup.id); setSignupPanelError(null); }}
                                      className="inline-flex items-center rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-700 transition-colors"
                                    >
                                      Mark Paid
                                    </button>
                                  )}
                                </td>
                              </tr>
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-md">
                    No signups yet.
                  </div>
                )}

                {signupPanelError && (
                  <div className="mt-2 rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300 text-xs">
                    {signupPanelError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Mark Paid Modal — single and bulk */}
      {(markingPaidSignupId !== null || bulkMarkPaidOpen) && selectedEvent && (() => {
        const isBulk = bulkMarkPaidOpen;
        const singleSignup = !isBulk && markingPaidSignupId
          ? (eventSignups.find(s => s.id === markingPaidSignupId) ?? null)
          : null;
        const eligibleCount = isBulk
          ? Array.from(bulkSelectedIds).filter(id =>
              eventSignups.find(s => s.id === id)?.status === "pending_payment"
            ).length
          : 0;
        const form = isBulk ? bulkMarkPaidForm : markPaidForm;
        const updateForm = (update: Partial<PayForm>) => {
          if (isBulk) setBulkMarkPaidForm(prev => ({ ...prev, ...update }));
          else setMarkPaidForm(prev => ({ ...prev, ...update }));
        };
        const isLoading = isBulk ? bulkMarkPaidLoading : markPaidLoading;
        const handleClose = () => {
          if (isBulk) { setBulkMarkPaidOpen(false); setBulkMarkPaidForm(EMPTY_PAY_FORM); }
          else { setMarkingPaidSignupId(null); setMarkPaidForm(EMPTY_PAY_FORM); }
          setSignupPanelError(null);
        };
        const handleConfirm = () => {
          if (isBulk) void handleBulkMarkPaid(selectedEvent.event_id);
          else if (markingPaidSignupId) void handleMarkPaid(selectedEvent.event_id, markingPaidSignupId);
        };
        const playerName = singleSignup?.player?.name
          ?? singleSignup?.player?.nickname
          ?? singleSignup?.applicant_name
          ?? "this signup";

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={ev => { if (ev.target === ev.currentTarget) handleClose(); }}
          >
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg">
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-700">
                <p className="font-semibold text-slate-100 text-sm">Confirm Payment</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isBulk
                    ? `${eligibleCount} of ${bulkSelectedIds.size} selected signup${bulkSelectedIds.size !== 1 ? "s" : ""} are in pending_payment status`
                    : `Recording payment for ${playerName}`}
                </p>
              </div>

              {/* Warning */}
              <div className="px-5 py-3 flex items-start gap-2 bg-amber-950/30 border-b border-amber-800/30">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  {isBulk && eligibleCount === 0
                    ? "None of the selected signups are in pending_payment status — nothing will be changed."
                    : "This will record a payment and move the signup to accepted. This cannot be undone."}
                </p>
              </div>

              {/* Form */}
              <div className="px-5 py-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Method</label>
                  <select className={inputCls} value={form.method}
                    onChange={ev => updateForm({ method: ev.target.value as PayForm["method"] })}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="gcash">GCash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Amount (PHP)</label>
                  <input type="number" min="0" className={inputCls} placeholder="1000"
                    value={form.amount}
                    onChange={ev => updateForm({ amount: ev.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Ref # (optional)</label>
                  <input type="text" className={inputCls} placeholder="e.g. GCash ref"
                    value={form.reference_number}
                    onChange={ev => updateForm({ reference_number: ev.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Notes (optional)</label>
                  <input type="text" className={inputCls}
                    value={form.notes}
                    onChange={ev => updateForm({ notes: ev.target.value })} />
                </div>
              </div>

              {signupPanelError && (
                <div className="mx-5 mb-3 rounded bg-rose-900/30 border border-rose-800/40 px-3 py-2 text-rose-300 text-xs">
                  {signupPanelError}
                </div>
              )}

              {/* Actions */}
              <div className="px-5 py-4 border-t border-slate-700 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="inline-flex items-center rounded-md bg-slate-800 border border-slate-600 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  No, cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isLoading || (isBulk && eligibleCount === 0)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading
                    ? "Saving…"
                    : `🤝 Yes, confirm${isBulk && eligibleCount > 0 ? ` (${eligibleCount})` : ""}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
