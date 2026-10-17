"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LockKeyhole, CheckCircle2 } from "lucide-react";
import PlayerCard from "@/components/PlayerCard";
import PendingPaymentPanel from "@/components/PendingPaymentPanel";
import { supabase } from "@/lib/supabase";
import { useCurrentPlayer } from "@/lib/useCurrentPlayer";
import type { Event } from "@/lib/types";
import type { EventInsideResponse } from "@/lib/eventAccess";

const fieldClass = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500";

export default function EventInsidePanel({ event, refreshKey, viewer, onPaymentConfirmed }: {
  event: Event;
  refreshKey: unknown;
  viewer: ReturnType<typeof useCurrentPlayer>;
  onPaymentConfirmed: () => void;
}) {
  const { user, player, isLoading: authLoading } = viewer;
  const notifiedFor = useRef<string | null>(null);
  const [responseState, setResult] = useState<EventInsideResponse | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const result = !authLoading && loadedFor === (user?.id ?? null) ? responseState : null;
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [information, setInformation] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`/api/events/${event.event_id}/inside`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Event information could not be loaded. Try again.");
        const next = await response.json() as EventInsideResponse;
        if (cancelled) return;
        setLoadedFor(user?.id ?? null);
        setResult(next);
        setError(null);
        if (next.access.paid && user?.id && notifiedFor.current !== user.id) {
          notifiedFor.current = user.id;
          onPaymentConfirmed();
        }
        // Wait for the confirmed payment webhook; a return URL never unlocks access.
        if (next.access.registered && next.access.paymentRequired && polls++ < 15) {
          timer = setTimeout(() => void load(), 8000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load event information.");
      }
    }
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [event.event_id, user?.id, authLoading, reload, refreshKey, onPaymentConfirmed]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(`/api/events/${event.event_id}/inside`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ information, event_url: eventUrl }),
      });
      const json = await response.json() as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Unable to save event information.");
      setEditing(false);
      setReload(v => v + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save event information."); }
    finally { setSaving(false); }
  }

  const access = result?.access;
  const divisions = [...new Set((result?.teams ?? []).map(t => t.division))].sort((a, b) => a - b);
  const myDivision = result?.teams?.find(t => [t.player_1.player_id, t.player_2.player_id].includes(Number(player?.player_id)))?.division;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4" aria-label="Matchups and event information">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-200">Matchups & event information</h2>
        {access && <span className="flex items-center gap-1.5 text-xs text-slate-400">
          {access.canViewInside ? <CheckCircle2 size={14} className="text-emerald-400" /> : <LockKeyhole size={14} />}
          {access.canManage ? "Organizer access" : access.paid ? "Paid · Unlocked" : access.canViewInside ? "Unlocked" : access.registered ? "Registered · Locked" : "Registration required"}
        </span>}
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {!result && !error && <p role="status" className="text-sm text-slate-500">Checking your event access…</p>}
      {access && !access.canViewInside && <>
        <p className="text-sm text-slate-400">
          {!access.registered ? "Register for this event to access participant information."
            : access.signupStatus === "waitlisted" ? "You're on the waitlist. Your matchups will be available once your place is confirmed and any required payment is received."
            : "You're registered. You can read the rules and see participants below. Complete your payment to unlock division matchups and inside event information. Each partner pays separately."}
        </p>
        {access.registered && access.paymentRequired && access.signupStatus !== "waitlisted" && access.signupStatus !== "pending_payment" && access.signupId && <PendingPaymentPanel signupId={access.signupId} eventLabel={event.name ?? "Event"} registrationFee={event.registration_fee} paymentInstructions={event.payment_instructions} />}
        <button type="button" onClick={() => setReload(v => v + 1)} className="text-sm text-cyan-400 hover:text-cyan-200 focus-visible:outline focus-visible:outline-cyan-400">Check access again</button>
      </>}
      {!result && error && <button type="button" onClick={() => setReload(v => v + 1)} className="text-sm text-cyan-400 hover:text-cyan-200">Try again</button>}
      {access?.canViewInside && <>
        {result?.details?.information && <p className="text-sm text-slate-300 whitespace-pre-wrap">{result.details.information}</p>}
        {result?.details?.event_url && /^https?:\/\//i.test(result.details.event_url) && <a href={result.details.event_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-cyan-400 hover:text-cyan-200">Open event information ↗</a>}
        {myDivision && <p className="text-sm text-cyan-300">You&apos;re in Division {myDivision}. The other teams in your division are your round-robin opponents.</p>}
        {divisions.map(division => <div key={division} className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Division {division}{division === myDivision ? " · Your division" : ""}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result?.teams?.filter(t => t.division === division).map(team => <div key={team.id} className="min-w-0 rounded-lg border border-slate-700 p-3 space-y-2">
              <p className="text-xs text-slate-500">Team {team.team_number}</p>
              {[team.player_1, team.player_2].map(p => <PlayerCard key={p.player_id} player={{ ...p, name: p.name ?? "Player", nickname: p.nickname ?? "" }} size="sm" showLatestRating={false} />)}
            </div>)}
          </div>
        </div>)}
        {!divisions.length && <p className="text-sm text-slate-500">Matchups haven&apos;t been published yet.</p>}
        {!!result?.matches?.length && <Link href="/matches" className="inline-block text-sm text-cyan-400 hover:text-cyan-200">View match calendar →</Link>}
        {access.canManage && !editing && <button type="button" className="block text-sm text-cyan-400 hover:text-cyan-200" onClick={() => { setInformation(result?.details?.information ?? ""); setEventUrl(result?.details?.event_url ?? ""); setEditing(true); }}>Edit inside information</button>}
        {editing && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
          <label className="block text-xs text-slate-400">Inside event information<textarea rows={5} value={information} onChange={e => setInformation(e.target.value)} className={`${fieldClass} mt-1`} /></label>
          <label className="block text-xs text-slate-400">Event information link<input type="url" value={eventUrl} onChange={e => setEventUrl(e.target.value)} className={`${fieldClass} mt-1`} /></label>
          <p className="text-xs text-slate-500">Visible to paid participants and organizers. Put general rules in the event description.</p>
          <div className="flex gap-4"><button disabled={saving} className="text-sm text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? "Saving…" : "Save"}</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className="text-sm text-slate-400 disabled:cursor-not-allowed">Cancel</button></div>
        </form>}
      </>}
    </section>
  );
}
