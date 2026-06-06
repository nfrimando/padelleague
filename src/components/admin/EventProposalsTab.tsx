"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { EventProposal, EventRestrictions } from "@/lib/types";

type ProposalWithProposer = EventProposal & {
  proposer_name: string | null;
  proposer_nickname: string | null;
};

type EnrichmentForm = {
  end_date: string;
  event_type: string;
  registration_fee: string;
  registration_status: "open" | "closed";
  status: "upcoming" | "ongoing" | "completed";
  image_url: string;
  payment_instructions: string;
  url_link: string;
  event_url: string;
  requires_payment: boolean;
  min_rating: string;
  max_rating: string;
  max_games_per_player: string;
};

const inputCls =
  "block w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#00C8DC]/40";
const labelCls =
  "block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5";

function defaultEnrichment(proposal: ProposalWithProposer): EnrichmentForm {
  return {
    end_date: proposal.end_date ?? "",
    event_type: "league_season",
    registration_fee: "1000",
    registration_status: "closed",
    status: "upcoming",
    image_url: "",
    payment_instructions: "",
    url_link: "",
    event_url: proposal.event_url ?? "",
    requires_payment: true,
    min_rating: "",
    max_rating: "",
    max_games_per_player: "",
  };
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ProposalCard({
  proposal,
  token,
  onUpdated,
}: {
  proposal: ProposalWithProposer;
  token: string;
  onUpdated: (updated: ProposalWithProposer) => void;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [enrichment, setEnrichment] = useState<EnrichmentForm>(() =>
    defaultEnrichment(proposal),
  );
  const [rejectNotes, setRejectNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proposerLabel =
    proposal.proposer_nickname || proposal.proposer_name || `Player #${proposal.proposed_by_player_id}`;

  const handleApprove = async () => {
    setSubmitting(true);
    setError(null);

    const restrictions: EventRestrictions = {};
    const minR = parseFloat(enrichment.min_rating);
    const maxR = parseFloat(enrichment.max_rating);
    const maxG = parseInt(enrichment.max_games_per_player, 10);
    if (!isNaN(minR)) restrictions.min_rating = minR;
    if (!isNaN(maxR)) restrictions.max_rating = maxR;
    if (!isNaN(maxG) && maxG > 0) restrictions.max_games_per_player = maxG;

    const body: Record<string, unknown> = {
      end_date: enrichment.end_date || undefined,
      event_type: enrichment.event_type,
      registration_fee: parseFloat(enrichment.registration_fee) || 1000,
      registration_status: enrichment.registration_status,
      status: enrichment.status,
      image_url: enrichment.image_url || undefined,
      payment_instructions: enrichment.payment_instructions || undefined,
      url_link: enrichment.url_link || undefined,
      event_url: enrichment.event_url || undefined,
      requires_payment: enrichment.requires_payment,
    };
    if (Object.keys(restrictions).length > 0) body.restrictions = restrictions;

    const res = await fetch(
      `/api/admin/event-proposals/${proposal.proposal_id}/approve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    );

    const json = (await res.json()) as {
      error?: string;
      proposal?: ProposalWithProposer;
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to approve.");
      setSubmitting(false);
      return;
    }

    onUpdated({
      ...proposal,
      status: "approved",
      ...(json.proposal ?? {}),
    });
    setSubmitting(false);
    setMode("idle");
  };

  const handleReject = async () => {
    setSubmitting(true);
    setError(null);

    const res = await fetch(
      `/api/admin/event-proposals/${proposal.proposal_id}/reject`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ admin_notes: rejectNotes || undefined }),
      },
    );

    const json = (await res.json()) as {
      error?: string;
      proposal?: ProposalWithProposer;
    };

    if (!res.ok) {
      setError(json.error ?? "Failed to reject.");
      setSubmitting(false);
      return;
    }

    onUpdated({ ...proposal, status: "rejected", admin_notes: rejectNotes || null });
    setSubmitting(false);
    setMode("idle");
  };

  const isPending = proposal.status === "pending";

  return (
    <div
      className={`rounded-lg border bg-slate-900 overflow-hidden ${
        isPending
          ? "border-slate-600"
          : proposal.status === "approved"
            ? "border-emerald-800/40 opacity-70"
            : "border-rose-900/40 opacity-60"
      }`}
    >
      {/* Card header */}
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-100 truncate">
              {proposal.name}
            </span>
            {proposal.status === "approved" && (
              <span className="inline-flex items-center rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                Approved
              </span>
            )}
            {proposal.status === "rejected" && (
              <span className="inline-flex items-center rounded-full bg-rose-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-400">
                Rejected
              </span>
            )}
            {proposal.status === "pending" && (
              <span className="inline-flex items-center rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                Pending
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400 space-y-0.5">
            <div>
              {formatDate(proposal.start_date)}
              {proposal.end_date ? ` – ${formatDate(proposal.end_date)}` : ""}
            </div>
            <div className="flex flex-wrap gap-x-3">
              <span>Proposed by {proposerLabel}</span>
              {proposal.format && <span>Format: {proposal.format}</span>}
              {proposal.player_limit && <span>Limit: {proposal.player_limit} players</span>}
            </div>
            {proposal.description && (
              <p className="text-slate-500 line-clamp-2">{proposal.description}</p>
            )}
            {proposal.proposer_notes && (
              <p className="text-slate-500 italic">
                &ldquo;{proposal.proposer_notes}&rdquo;
              </p>
            )}
            {proposal.status === "rejected" && proposal.admin_notes && (
              <p className="text-rose-400/80">Note: {proposal.admin_notes}</p>
            )}
            {proposal.status === "approved" && proposal.event_id && (
              <p className="text-emerald-400/80">
                Event #{proposal.event_id} created
              </p>
            )}
          </div>
        </div>

        {isPending && mode === "idle" && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMode("approve")}
              className="inline-flex items-center rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors cursor-pointer"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setMode("reject")}
              className="inline-flex items-center rounded-md border border-rose-800/60 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-900/20 transition-colors cursor-pointer"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Approve enrichment panel */}
      {mode === "approve" && (
        <div className="border-t border-slate-700 px-4 py-4 space-y-4 bg-slate-800/40">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Enrich & Approve
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>End Date</label>
              <input
                type="date"
                className={inputCls}
                value={enrichment.end_date}
                onChange={(e) =>
                  setEnrichment((p) => ({ ...p, end_date: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={labelCls}>Event Type</label>
              <input
                type="text"
                className={inputCls}
                value={enrichment.event_type}
                onChange={(e) =>
                  setEnrichment((p) => ({ ...p, event_type: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={labelCls}>Registration Fee (Php)</label>
              <input
                type="number"
                className={inputCls}
                value={enrichment.registration_fee}
                onChange={(e) =>
                  setEnrichment((p) => ({ ...p, registration_fee: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={labelCls}>Registration</label>
              <select
                className={inputCls}
                value={enrichment.registration_status}
                onChange={(e) =>
                  setEnrichment((p) => ({
                    ...p,
                    registration_status: e.target.value as "open" | "closed",
                  }))
                }
              >
                <option value="closed">Closed</option>
                <option value="open">Open</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Event Status</label>
              <select
                className={inputCls}
                value={enrichment.status}
                onChange={(e) =>
                  setEnrichment((p) => ({
                    ...p,
                    status: e.target.value as "upcoming" | "ongoing" | "completed",
                  }))
                }
              >
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Event URL Slug</label>
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. summer-2026"
                value={enrichment.event_url}
                onChange={(e) =>
                  setEnrichment((p) => ({ ...p, event_url: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Image URL</label>
              <input
                type="url"
                className={inputCls}
                placeholder="https://..."
                value={enrichment.image_url}
                onChange={(e) =>
                  setEnrichment((p) => ({ ...p, image_url: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Payment Instructions</label>
              <textarea
                rows={3}
                className={inputCls}
                value={enrichment.payment_instructions}
                onChange={(e) =>
                  setEnrichment((p) => ({
                    ...p,
                    payment_instructions: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className={labelCls}>External Link</label>
              <input
                type="url"
                className={inputCls}
                placeholder="https://..."
                value={enrichment.url_link}
                onChange={(e) =>
                  setEnrichment((p) => ({ ...p, url_link: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                id="requires_payment"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-[#00C8DC]"
                checked={enrichment.requires_payment}
                onChange={(e) =>
                  setEnrichment((p) => ({
                    ...p,
                    requires_payment: e.target.checked,
                  }))
                }
              />
              <label
                htmlFor="requires_payment"
                className="text-xs text-slate-400 cursor-pointer"
              >
                Requires payment
              </label>
            </div>
          </div>

          {/* Restrictions */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              Restrictions (optional)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Min Rating</label>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="e.g. 1000"
                  value={enrichment.min_rating}
                  onChange={(e) =>
                    setEnrichment((p) => ({ ...p, min_rating: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Max Rating</label>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="e.g. 2000"
                  value={enrichment.max_rating}
                  onChange={(e) =>
                    setEnrichment((p) => ({ ...p, max_rating: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Max Games / Player</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  placeholder="e.g. 3"
                  value={enrichment.max_games_per_player}
                  onChange={(e) =>
                    setEnrichment((p) => ({
                      ...p,
                      max_games_per_player: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={submitting}
              className="inline-flex items-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {submitting ? "Approving…" : "Confirm Approval"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject panel */}
      {mode === "reject" && (
        <div className="border-t border-slate-700 px-4 py-4 space-y-3 bg-slate-800/40">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Reject Proposal
          </p>
          <div>
            <label className={labelCls}>Reason (optional)</label>
            <textarea
              rows={2}
              className={inputCls}
              placeholder="Brief note for internal reference..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleReject()}
              disabled={submitting}
              className="inline-flex items-center rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {submitting ? "Rejecting…" : "Confirm Rejection"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EventProposalsTab({ enabled }: { enabled: boolean }) {
  const [proposals, setProposals] = useState<ProposalWithProposer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      setToken(accessToken);

      if (!accessToken) {
        setError("No active session.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin/event-proposals", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const json = (await res.json()) as {
        error?: string;
        proposals?: ProposalWithProposer[];
      };

      if (!res.ok) {
        setError(json.error ?? "Failed to load proposals.");
      } else {
        setProposals(json.proposals ?? []);
      }
      setLoading(false);
    }

    void load();
  }, [enabled]);

  const handleUpdated = useCallback((updated: ProposalWithProposer) => {
    setProposals((prev) =>
      prev.map((p) => (p.proposal_id === updated.proposal_id ? updated : p)),
    );
  }, []);

  const pending = proposals.filter((p) => p.status === "pending");
  const reviewed = proposals.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Event Proposals
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Review and approve or reject member-submitted event proposals.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading proposals…</div>
      ) : error ? (
        <div className="rounded-md border border-rose-800/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      ) : (
        <>
          {/* Pending */}
          <section className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Pending ({pending.length})
            </h3>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-500">No pending proposals.</p>
            ) : (
              <div className="space-y-3">
                {pending.map((p) => (
                  <ProposalCard
                    key={p.proposal_id}
                    proposal={p}
                    token={token ?? ""}
                    onUpdated={handleUpdated}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Reviewed */}
          {reviewed.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Reviewed ({reviewed.length})
              </h3>
              <div className="space-y-3">
                {reviewed.map((p) => (
                  <ProposalCard
                    key={p.proposal_id}
                    proposal={p}
                    token={token ?? ""}
                    onUpdated={handleUpdated}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
