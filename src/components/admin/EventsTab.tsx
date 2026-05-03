"use client";

import { useCallback, useEffect, useState } from "react";
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
  registration_fee?: number | null;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  requires_payment?: boolean | null;
  image_url?: string | null;
  description?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

type SignupStatus = "registered" | "accepted" | "waitlisted" | "cancelled";

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
  registration_fee: string;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  requires_payment: boolean;
  image_url: string;
  description: string;
};

type EventStatusFilter =
  | "non_completed"
  | "upcoming"
  | "ongoing"
  | "completed"
  | "all";

const inputCls =
  "mt-1 block w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-900 dark:text-slate-100 text-sm";
const labelCls =
  "text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide";

const SIGNUP_STATUS_OPTIONS: SignupStatus[] = [
  "registered",
  "accepted",
  "waitlisted",
  "cancelled",
];

export function EventsTab({ enabled }: { enabled: boolean }) {
  const { players } = usePlayers({ enabled, orderByName: true });
  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] =
    useState<EventStatusFilter>("non_completed");

  const [updatingEventId, setUpdatingEventId] = useState<number | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EventEditForm | null>(null);

  const [expandedSignupsEventId, setExpandedSignupsEventId] = useState<
    number | null
  >(null);
  const [signupsByEvent, setSignupsByEvent] = useState<
    Record<number, AdminSignupRow[]>
  >({});
  const [signupStatusDrafts, setSignupStatusDrafts] = useState<
    Record<string, SignupStatus>
  >({});
  const [loadingSignupsEventId, setLoadingSignupsEventId] = useState<
    number | null
  >(null);
  const [savingSignupId, setSavingSignupId] = useState<string | null>(null);
  const [signupPanelError, setSignupPanelError] = useState<string | null>(null);

  const [addSignupSearch, setAddSignupSearch] = useState("");
  const [addSignupStatus, setAddSignupStatus] =
    useState<SignupStatus>("registered");
  const [addSignupSelectedPlayer, setAddSignupSelectedPlayer] =
    useState<Player | null>(null);
  const [creatingSignup, setCreatingSignup] = useState(false);

  const addSignupSuggestions = usePlayerSearch(players, addSignupSearch);

  const [newEventName, setNewEventName] = useState("");
  const [newEventType, setNewEventType] = useState("league_season");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventFee, setNewEventFee] = useState("1000");
  const [newEventImageUrl, setNewEventImageUrl] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventRegStatus, setNewEventRegStatus] = useState<"open" | "closed">(
    "open",
  );
  const [newEventStatus, setNewEventStatus] = useState<
    "upcoming" | "ongoing" | "completed"
  >("upcoming");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const loadEvents = useCallback(async () => {
    if (!enabled) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const token = await getAccessToken();
    if (!token) {
      setError("No active session.");
      setLoading(false);
      return;
    }

    const query = showArchived ? "?include_deleted=true" : "";
    const res = await fetch(`/api/admin/events${query}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = (await res.json()) as {
      error?: string;
      events?: AdminEventRow[];
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to load events.");
      setEvents([]);
    } else {
      setEvents((json.events ?? []) as AdminEventRow[]);
    }

    setLoading(false);
  }, [enabled, getAccessToken, showArchived]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handleCreate = async () => {
    if (!newEventStart || !newEventEnd) {
      setError("Start date and end date are required.");
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError("No active session.");
      setCreating(false);
      return;
    }

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: newEventName || undefined,
        event_type: newEventType,
        start_date: newEventStart,
        end_date: newEventEnd,
        registration_fee: newEventFee ? Number(newEventFee) : 1000,
        registration_status: newEventRegStatus,
        status: newEventStatus,
        image_url: newEventImageUrl || undefined,
        description: newEventDescription || undefined,
      }),
    });

    const json = (await res.json()) as {
      error?: string;
      event?: AdminEventRow;
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to create event.");
    } else if (json.event) {
      setSuccess(`Event created (ID ${json.event.event_id}).`);
      setEvents((prev) => [json.event as AdminEventRow, ...prev]);
      setNewEventName("");
      setNewEventType("league_season");
      setNewEventStart("");
      setNewEventEnd("");
      setNewEventFee("1000");
      setNewEventImageUrl("");
      setNewEventDescription("");
    }
    setCreating(false);
  };

  const handleToggleReg = async (event: AdminEventRow) => {
    setUpdatingEventId(event.event_id);
    const newStatus = event.registration_status === "open" ? "closed" : "open";
    const token = await getAccessToken();
    if (!token) {
      setUpdatingEventId(null);
      setError("No active session.");
      return;
    }

    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_id: event.event_id,
        registration_status: newStatus,
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as { event?: AdminEventRow };
      if (json.event) {
        setEvents((prev) =>
          prev.map((e) =>
            e.event_id === event.event_id ? (json.event as AdminEventRow) : e,
          ),
        );
      }
    }
    setUpdatingEventId(null);
  };

  const startEdit = (event: AdminEventRow) => {
    setEditingEventId(event.event_id);
    setEditForm({
      name: event.name ?? "",
      event_type: event.event_type,
      start_date: event.start_date ?? "",
      end_date: event.end_date ?? "",
      registration_fee:
        event.registration_fee != null
          ? String(event.registration_fee)
          : "1000",
      registration_status: event.registration_status,
      status: event.status,
      requires_payment: event.requires_payment !== false,
      image_url: event.image_url ?? "",
      description: event.description ?? "",
    });
    setSuccess(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingEventId(null);
    setEditForm(null);
  };

  const handleSaveEdit = async (eventId: number) => {
    if (!editForm) return;

    setUpdatingEventId(eventId);
    setError(null);
    setSuccess(null);

    const token = await getAccessToken();
    if (!token) {
      setError("No active session.");
      setUpdatingEventId(null);
      return;
    }

    const fee = Number(editForm.registration_fee);

    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_id: eventId,
        name: editForm.name,
        event_type: editForm.event_type,
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        registration_fee: Number.isFinite(fee) ? fee : 1000,
        registration_status: editForm.registration_status,
        status: editForm.status,
        requires_payment: editForm.requires_payment,
        image_url: editForm.image_url || null,
        description: editForm.description || null,
      }),
    });

    const json = (await res.json()) as {
      error?: string;
      event?: AdminEventRow;
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to update event.");
      setUpdatingEventId(null);
      return;
    }

    if (json.event) {
      setEvents((prev) =>
        prev.map((e) =>
          e.event_id === eventId ? (json.event as AdminEventRow) : e,
        ),
      );
      setSuccess("Event updated.");
      cancelEdit();
    }

    setUpdatingEventId(null);
  };

  const handleArchive = async (event: AdminEventRow) => {
    if (!window.confirm("Archive this event?")) {
      return;
    }

    setUpdatingEventId(event.event_id);
    setError(null);
    setSuccess(null);

    const token = await getAccessToken();
    if (!token) {
      setError("No active session.");
      setUpdatingEventId(null);
      return;
    }

    const res = await fetch("/api/admin/events", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_id: event.event_id }),
    });

    const json = (await res.json()) as {
      error?: string;
      event?: AdminEventRow;
    };

    if (res.status === 409) {
      setError(
        json.error ??
          "Event has active signups. Cancel all signups before archiving.",
      );
      setUpdatingEventId(null);
      return;
    }

    if (!res.ok) {
      setError(json.error ?? "Failed to archive event.");
      setUpdatingEventId(null);
      return;
    }

    if (showArchived) {
      if (json.event) {
        setEvents((prev) =>
          prev.map((e) =>
            e.event_id === event.event_id ? (json.event as AdminEventRow) : e,
          ),
        );
      }
    } else {
      setEvents((prev) => prev.filter((e) => e.event_id !== event.event_id));
    }

    setSuccess("Event archived.");
    setUpdatingEventId(null);
  };

  const handleRestore = async (eventId: number) => {
    setUpdatingEventId(eventId);
    setError(null);
    setSuccess(null);

    const token = await getAccessToken();
    if (!token) {
      setError("No active session.");
      setUpdatingEventId(null);
      return;
    }

    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_id: eventId, deleted_at: null }),
    });

    const json = (await res.json()) as {
      error?: string;
      event?: AdminEventRow;
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to restore event.");
      setUpdatingEventId(null);
      return;
    }

    if (json.event) {
      setEvents((prev) =>
        prev.map((e) =>
          e.event_id === eventId ? (json.event as AdminEventRow) : e,
        ),
      );
    }

    setSuccess("Event restored.");
    setUpdatingEventId(null);
  };

  const loadSignupsForEvent = useCallback(
    async (eventId: number) => {
      setLoadingSignupsEventId(eventId);
      setSignupPanelError(null);

      const token = await getAccessToken();
      if (!token) {
        setSignupPanelError("No active session.");
        setLoadingSignupsEventId(null);
        return;
      }

      const res = await fetch(`/api/admin/signups?event_id=${eventId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = (await res.json()) as {
        error?: string;
        signups?: AdminSignupRow[];
      };

      if (!res.ok) {
        setSignupPanelError(json.error ?? "Failed to load signups.");
        setLoadingSignupsEventId(null);
        return;
      }

      const rows = (json.signups ?? []) as AdminSignupRow[];
      setSignupsByEvent((prev) => ({ ...prev, [eventId]: rows }));
      setSignupStatusDrafts((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          next[row.id] = row.status;
        });
        return next;
      });

      setLoadingSignupsEventId(null);
    },
    [getAccessToken],
  );

  const toggleManageSignups = async (eventId: number) => {
    if (expandedSignupsEventId === eventId) {
      setExpandedSignupsEventId(null);
      setSignupPanelError(null);
      return;
    }

    setExpandedSignupsEventId(eventId);
    setAddSignupSearch("");
    setAddSignupSelectedPlayer(null);
    setAddSignupStatus("registered");
    await loadSignupsForEvent(eventId);
  };

  const handleSaveSignupStatus = async (eventId: number, signupId: string) => {
    const status = signupStatusDrafts[signupId];
    if (!status) return;

    setSavingSignupId(signupId);
    setSignupPanelError(null);

    const token = await getAccessToken();
    if (!token) {
      setSignupPanelError("No active session.");
      setSavingSignupId(null);
      return;
    }

    const res = await fetch(
      `/api/admin/signups/${encodeURIComponent(signupId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      },
    );

    const json = (await res.json()) as {
      error?: string;
      signup?: { status: SignupStatus };
    };

    if (!res.ok) {
      setSignupPanelError(json.error ?? "Failed to update signup.");
      setSavingSignupId(null);
      return;
    }

    if (json.signup) {
      setSignupsByEvent((prev) => ({
        ...prev,
        [eventId]: (prev[eventId] ?? []).map((row) =>
          row.id === signupId ? { ...row, status: json.signup!.status } : row,
        ),
      }));
    }

    setSavingSignupId(null);
  };

  const handleAddSignup = async (eventId: number) => {
    if (!addSignupSelectedPlayer?.player_id) {
      setSignupPanelError("Select a player to add.");
      return;
    }

    setCreatingSignup(true);
    setSignupPanelError(null);

    const token = await getAccessToken();
    if (!token) {
      setSignupPanelError("No active session.");
      setCreatingSignup(false);
      return;
    }

    const res = await fetch("/api/admin/signups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_id: eventId,
        player_id: Number(addSignupSelectedPlayer.player_id),
        status: addSignupStatus,
      }),
    });

    const json = (await res.json()) as { error?: string };

    if (!res.ok) {
      setSignupPanelError(json.error ?? "Failed to add signup.");
      setCreatingSignup(false);
      return;
    }

    setAddSignupSearch("");
    setAddSignupSelectedPlayer(null);
    setAddSignupStatus("registered");
    setCreatingSignup(false);
    await loadSignupsForEvent(eventId);
  };

  const regBadge = (status: string) =>
    status === "open"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";

  const statusBadge = (s: string) => {
    if (s === "ongoing") {
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    }
    if (s === "completed") {
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    }
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  };

  const filteredEvents = events.filter((event) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "non_completed") return event.status !== "completed";
    return event.status === statusFilter;
  });

  return (
    <div className="w-full min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-6 text-sm">
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Events
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(ev) => setShowArchived(ev.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700"
            />
            Show archived events
          </label>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { value: "non_completed", label: "Open + Ongoing" },
            { value: "upcoming", label: "Upcoming" },
            { value: "ongoing", label: "Ongoing" },
            { value: "completed", label: "Completed" },
            { value: "all", label: "All Statuses" },
          ].map((option) => {
            const active = statusFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setStatusFilter(option.value as EventStatusFilter)
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="w-full min-w-0 min-h-[360px] max-h-[62vh] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {loading ? (
            <div className="h-full w-full flex items-center justify-center text-slate-500 animate-pulse">
              Loading…
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center px-4 text-center text-slate-500 dark:text-slate-400">
              No events match the current filters.
            </div>
          ) : (
            <div className="w-full min-w-0 divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEvents.map((e) => {
                const label = e.name ?? `Event ${e.event_id}`;
                const isArchived = !!e.deleted_at;
                const eventSignups = signupsByEvent[e.event_id] ?? [];

                return (
                  <div
                    key={e.event_id}
                    className="w-full min-w-0 bg-white dark:bg-slate-900"
                  >
                    <div className="w-full min-w-0 flex items-center gap-3 px-4 py-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {label}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                          {e.start_date && e.end_date
                            ? `${e.start_date} → ${e.end_date}`
                            : "Dates TBD"}
                          {` · ${e.event_type}`}
                          {e.registration_fee != null
                            ? ` · ₱${e.registration_fee.toLocaleString()}`
                            : ""}
                          {` · ${e.requires_payment === false ? "Free" : "Paid"}`}
                          {isArchived ? " · Archived" : ""}
                        </p>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${statusBadge(e.status)}`}
                      >
                        {e.status}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${regBadge(e.registration_status)}`}
                      >
                        Reg: {e.registration_status}
                      </span>

                      <button
                        type="button"
                        onClick={() => startEdit(e)}
                        className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                      >
                        Edit
                      </button>

                      {!isArchived ? (
                        <button
                          type="button"
                          disabled={updatingEventId === e.event_id}
                          onClick={() => void handleToggleReg(e)}
                          className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300"
                        >
                          {updatingEventId === e.event_id
                            ? "..."
                            : e.registration_status === "open"
                              ? "Close Registration"
                              : "Open Registration"}
                        </button>
                      ) : null}

                      {!isArchived ? (
                        <button
                          type="button"
                          disabled={updatingEventId === e.event_id}
                          onClick={() => void handleArchive(e)}
                          className="text-xs font-medium px-3 py-1.5 rounded-md border border-rose-200 dark:border-rose-900/70 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 text-rose-700 dark:text-rose-300"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingEventId === e.event_id}
                          onClick={() => void handleRestore(e.event_id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-900/70 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 text-emerald-700 dark:text-emerald-300"
                        >
                          Restore
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void toggleManageSignups(e.event_id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                      >
                        {expandedSignupsEventId === e.event_id
                          ? "Hide Signups"
                          : "Manage Signups"}
                      </button>
                    </div>

                    {editingEventId === e.event_id && editForm ? (
                      <div className="px-4 pb-4">
                        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/60">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <label className={labelCls}>Name</label>
                              <input
                                type="text"
                                className={inputCls}
                                value={editForm.name}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? { ...prev, name: ev.target.value }
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Type</label>
                              <input
                                type="text"
                                className={inputCls}
                                value={editForm.event_type}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? { ...prev, event_type: ev.target.value }
                                      : prev,
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
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? { ...prev, start_date: ev.target.value }
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label className={labelCls}>End Date</label>
                              <input
                                type="date"
                                className={inputCls}
                                value={editForm.end_date}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? { ...prev, end_date: ev.target.value }
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label className={labelCls}>
                                Registration Fee (₱)
                              </label>
                              <input
                                type="number"
                                className={inputCls}
                                value={editForm.registration_fee}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          registration_fee: ev.target.value,
                                        }
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Registration</label>
                              <select
                                className={inputCls}
                                value={editForm.registration_status}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          registration_status: ev.target
                                            .value as "open" | "closed",
                                        }
                                      : prev,
                                  )
                                }
                              >
                                <option value="open">Open</option>
                                <option value="closed">Closed</option>
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>Status</label>
                              <select
                                className={inputCls}
                                value={editForm.status}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          status: ev.target.value as
                                            | "upcoming"
                                            | "ongoing"
                                            | "completed",
                                        }
                                      : prev,
                                  )
                                }
                              >
                                <option value="upcoming">Upcoming</option>
                                <option value="ongoing">Ongoing</option>
                                <option value="completed">Completed</option>
                              </select>
                            </div>
                            <div className="flex items-end">
                              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={editForm.requires_payment}
                                  onChange={(ev) =>
                                    setEditForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            requires_payment: ev.target.checked,
                                          }
                                        : prev,
                                    )
                                  }
                                  className="rounded border-slate-300 dark:border-slate-700"
                                />
                                Requires payment
                              </label>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <label className={labelCls}>
                                Image URL (optional)
                              </label>
                              <input
                                type="url"
                                className={inputCls}
                                placeholder="https://..."
                                value={editForm.image_url}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? { ...prev, image_url: ev.target.value }
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <label className={labelCls}>
                                Description (optional)
                              </label>
                              <textarea
                                rows={3}
                                className={inputCls}
                                placeholder="Short description of the event..."
                                value={editForm.description}
                                onChange={(ev) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          description: ev.target.value,
                                        }
                                      : prev,
                                  )
                                }
                              />
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit(e.event_id)}
                              disabled={updatingEventId === e.event_id}
                              className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {updatingEventId === e.event_id
                                ? "Saving…"
                                : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {expandedSignupsEventId === e.event_id ? (
                      <div className="px-4 pb-4">
                        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/60 space-y-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Signups
                          </div>

                          {loadingSignupsEventId === e.event_id ? (
                            <div className="text-slate-500 animate-pulse">
                              Loading…
                            </div>
                          ) : eventSignups.length === 0 ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              No signups yet.
                            </div>
                          ) : (
                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md">
                              <table className="min-w-full text-xs">
                                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                                  <tr>
                                    <th className="text-left px-3 py-2">
                                      Player
                                    </th>
                                    <th className="text-left px-3 py-2">
                                      Email
                                    </th>
                                    <th className="text-left px-3 py-2">
                                      Status
                                    </th>
                                    <th className="text-left px-3 py-2">
                                      Action
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {eventSignups.map((signup) => (
                                    <tr
                                      key={signup.id}
                                      className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800"
                                    >
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                        {signup.player?.name ||
                                          signup.player?.nickname ||
                                          signup.applicant_name ||
                                          (signup.player_id != null
                                            ? `Player ${signup.player_id}`
                                            : "Guest signup")}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                        {signup.player?.email ||
                                          signup.applicant_email ||
                                          signup.applicant_contact ||
                                          "-"}
                                      </td>
                                      <td className="px-3 py-2">
                                        <select
                                          className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                                          value={
                                            signupStatusDrafts[signup.id] ??
                                            signup.status
                                          }
                                          onChange={(ev) =>
                                            setSignupStatusDrafts((prev) => ({
                                              ...prev,
                                              [signup.id]: ev.target
                                                .value as SignupStatus,
                                            }))
                                          }
                                        >
                                          {SIGNUP_STATUS_OPTIONS.map(
                                            (option) => (
                                              <option
                                                key={option}
                                                value={option}
                                              >
                                                {option}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleSaveSignupStatus(
                                              e.event_id,
                                              signup.id,
                                            )
                                          }
                                          disabled={
                                            savingSignupId === signup.id
                                          }
                                          className="inline-flex items-center rounded-md bg-slate-200 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                                        >
                                          {savingSignupId === signup.id
                                            ? "Saving…"
                                            : "Save"}
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                              Add Signup
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="sm:col-span-2">
                                <PlayerSearchBox
                                  value={addSignupSearch}
                                  suggestions={addSignupSuggestions}
                                  onValueChange={setAddSignupSearch}
                                  onClear={() => {
                                    setAddSignupSearch("");
                                    setAddSignupSelectedPlayer(null);
                                  }}
                                  onSelectPlayer={(player) => {
                                    setAddSignupSelectedPlayer(player);
                                    const selectedName = String(
                                      player.name || "",
                                    ).trim();
                                    setAddSignupSearch(selectedName);
                                  }}
                                  selectedPlayerName={
                                    addSignupSelectedPlayer?.name ?? null
                                  }
                                  maxSuggestions={6}
                                  placeholder="Search players by name or nickname..."
                                  showSuggestions
                                />
                              </div>
                              <div>
                                <label className={labelCls}>Status</label>
                                <select
                                  className={inputCls}
                                  value={addSignupStatus}
                                  onChange={(ev) =>
                                    setAddSignupStatus(
                                      ev.target.value as SignupStatus,
                                    )
                                  }
                                >
                                  {SIGNUP_STATUS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleAddSignup(e.event_id)}
                                disabled={creatingSignup}
                                className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {creatingSignup ? "Adding…" : "Add Signup"}
                              </button>
                              {addSignupSelectedPlayer ? (
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  Selected: {addSignupSelectedPlayer.name}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {signupPanelError && (
                            <div className="rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300 text-xs">
                              {signupPanelError}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Create Event
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Name (optional)</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Summer Open"
              value={newEventName}
              onChange={(ev) => setNewEventName(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <input
              type="text"
              className={inputCls}
              placeholder="league_season"
              value={newEventType}
              onChange={(ev) => setNewEventType(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              className={inputCls}
              value={newEventStart}
              onChange={(ev) => setNewEventStart(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>End Date</label>
            <input
              type="date"
              className={inputCls}
              value={newEventEnd}
              onChange={(ev) => setNewEventEnd(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Registration Fee (₱)</label>
            <input
              type="number"
              className={inputCls}
              value={newEventFee}
              onChange={(ev) => setNewEventFee(ev.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Registration</label>
            <select
              className={inputCls}
              value={newEventRegStatus}
              onChange={(ev) =>
                setNewEventRegStatus(ev.target.value as "open" | "closed")
              }
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              className={inputCls}
              value={newEventStatus}
              onChange={(ev) =>
                setNewEventStatus(
                  ev.target.value as "upcoming" | "ongoing" | "completed",
                )
              }
            >
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Image URL (optional)</label>
            <input
              type="url"
              className={inputCls}
              placeholder="https://..."
              value={newEventImageUrl}
              onChange={(ev) => setNewEventImageUrl(ev.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Description (optional)</label>
            <textarea
              rows={3}
              className={inputCls}
              placeholder="Short description of the event..."
              value={newEventDescription}
              onChange={(ev) => setNewEventDescription(ev.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 rounded bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-emerald-700 dark:text-emerald-300 text-xs">
            ✓ {success}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || !newEventStart || !newEventEnd}
          className="mt-4 inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating…" : "Create Event"}
        </button>
      </div>
    </div>
  );
}
