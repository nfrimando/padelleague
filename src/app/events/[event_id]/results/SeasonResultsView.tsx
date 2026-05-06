"use client";

import Link from "next/link";
import { useState } from "react";
import type { SEASON_11 } from "@/lib/data/season-11";
import type { SeasonResults, FixtureResult, BracketStanding } from "@/lib/seasonResultsData";

type Bracket = (typeof SEASON_11.brackets)[number];
type BracketKey = "A" | "B" | "C" | "D";

type Props = {
  season: typeof SEASON_11;
  results: SeasonResults;
};

const COLORS = {
  bg: "#0E1523",
  card: "#151D30",
  elev: "#1B2438",
  border: "#243049",
  borderSoft: "#1F2840",
  text: "#E8ECF4",
  muted: "#8A95AB",
  accent: "#00C8DC",
  accentDim: "rgba(0,200,220,0.15)",
  accentSoft: "rgba(0,200,220,0.06)",
  warn: "#F5A623",
  gold: "#F5C26B",
  silver: "#C9D2E0",
  bronze: "#C58A5A",
  win: "#5BD49A",
  loss: "#6F7A92",
};

export default function SeasonResultsView({ season, results }: Props) {
  const [activeKey, setActiveKey] = useState<BracketKey>("A");
  const activeBracket = season.brackets.find((b) => b.key === activeKey)!;
  const dateRange = `${fmtMonthDay(season.start_date)} – ${fmtMonthDay(season.end_date)}, ${new Date(season.end_date).getFullYear()}`;
  const venues = Array.from(new Set(results.fixtures.map((f) => f.venue).filter(Boolean))).join(" · ") || "Play Padel · Padel 300";

  return (
    <div className="max-w-[1180px] mx-auto px-6">
      <Link href="/events" className="inline-block my-6 text-sm" style={{ color: COLORS.muted }}>
        ← Back to Events
      </Link>

      {/* HERO */}
      <div
        className="rounded-2xl border p-7 mb-7 relative overflow-hidden"
        style={{
          borderColor: COLORS.border,
          background:
            "radial-gradient(circle at 90% 20%, rgba(0,200,220,0.08), transparent 50%), linear-gradient(160deg, #18223A 0%, #0E1523 70%)",
        }}
      >
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 items-center relative">
          <div>
            <Pill live>Ongoing · League Season</Pill>
            <h1 className="text-3xl md:text-4xl font-bold italic tracking-wider mt-3" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {season.name.toUpperCase()} <span style={{ color: COLORS.muted, fontWeight: 600 }}>RESULTS</span>
            </h1>
            <div className="text-sm mt-1" style={{ color: COLORS.muted }}>
              {dateRange} · 6 weeks · {venues}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat value={String(season.brackets.length)} label="Brackets" />
            <Stat value="52" label="Players" />
            <Stat value={String(results.totals.completed)} of={`/${results.totals.total}`} label="Matches Played" progress={results.totals.completed / results.totals.total} />
            <Stat value={String(results.totals.scheduled)} label="Scheduled" plain />
          </div>
        </div>
      </div>

      {/* BRACKET TABS */}
      <SectionHead title="Brackets" annotate="click a bracket to view" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
        {season.brackets.map((b) => {
          const fixtures = results.fixtures.filter((f) => f.fixture.bracket === b.key);
          const played = fixtures.filter((f) => f.status === "completed").length;
          const isActive = activeKey === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setActiveKey(b.key)}
              className="text-left rounded-xl border p-3.5 transition-colors"
              style={{
                background: isActive ? COLORS.accentSoft : COLORS.card,
                borderColor: isActive ? COLORS.accent : COLORS.border,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color }} />
                <span className="text-[10px] tracking-widest uppercase" style={{ color: COLORS.muted }}>
                  {b.title} · {b.sub}
                </span>
              </div>
              <div className="font-bold italic text-lg tracking-wider mt-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {b.title.toUpperCase()}
              </div>
              <div className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                {b.format} · {b.teams.length} teams · {b.teams[0].players.length * b.teams.length} players
              </div>
              <div className="text-[11px] font-semibold mt-1" style={{ color: COLORS.accent }}>
                {played}/{fixtures.length} played
              </div>
            </button>
          );
        })}
      </div>

      <BracketPanel
        bracket={activeBracket}
        standings={results.standingsByBracket[activeKey]}
        fixtures={results.fixtures.filter((f) => f.fixture.bracket === activeKey)}
      />

      <footer className="border-t mt-16 py-6 text-center text-sm" style={{ borderColor: COLORS.border, color: COLORS.muted }}>
        PADELPH.COM · SEASON 11
      </footer>
    </div>
  );
}

function BracketPanel({ bracket, standings, fixtures }: { bracket: Bracket; standings: BracketStanding[]; fixtures: FixtureResult[] }) {
  const played = fixtures.filter((f) => f.status === "completed").length;
  const total = fixtures.length;
  const seasonComplete = played === total;

  return (
    <div>
      <div className="rounded-xl border p-4 mb-4 flex items-center justify-between" style={{ background: COLORS.card, borderColor: COLORS.border }}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold italic text-xl"
            style={{ background: bracket.color, color: COLORS.bg, fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {bracket.num}
          </div>
          <div>
            <h3 className="font-bold italic text-xl tracking-wider m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {bracket.title.toUpperCase()}{" "}
              <span className="text-[13px] font-semibold" style={{ color: COLORS.muted }}>
                · {bracket.sub} · {bracket.format}
              </span>
            </h3>
            <div className="text-xs" style={{ color: COLORS.muted }}>
              {bracket.teams.length} teams · {bracket.teams[0].players.length * bracket.teams.length} players · {total} matches · 3 pts win / 0 pts loss
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold italic" style={{ color: COLORS.accent, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {played}
            <span className="text-base font-semibold" style={{ color: COLORS.muted }}>
              /{total}
            </span>
          </div>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: COLORS.muted }}>
            Matches Played
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border-dashed border p-5 text-center text-sm mb-4"
        style={{ background: COLORS.card, borderColor: COLORS.border, color: COLORS.muted }}
      >
        🏆{" "}
        {seasonComplete ? (
          <>Season complete — final podium locked.</>
        ) : (
          <>
            Final podium will appear here once all {total} matches are played. Currently <strong style={{ color: COLORS.text }}>{played} of {total}</strong>.
          </>
        )}
      </div>

      <SectionHead title="Live Standings" annotate="3 pts × wins · sets diff tiebreak" />
      <StandingsTable bracket={bracket} standings={standings} />

      <div className="mt-8">
        <SectionHead title="Matches" annotate={`${played} played · ${total - played} remaining`} />
        <MatchesList fixtures={fixtures} />
      </div>

      <div className="mt-8">
        <SectionHead title="Teams & Rosters" />
        <RostersGrid bracket={bracket} standings={standings} />
      </div>
    </div>
  );
}

function StandingsTable({ bracket, standings }: { bracket: Bracket; standings: BracketStanding[] }) {
  const playersByCode = Object.fromEntries(bracket.teams.map((t) => [t.code, t.players]));
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: COLORS.card, borderColor: COLORS.border }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ background: COLORS.elev }}>
            {["#", "Team", "Players", "P", "W", "L", "Sets +/–", "Pts"].map((h, i) => (
              <th
                key={h}
                className={`p-3 text-[10px] tracking-widest uppercase font-bold ${i >= 3 ? "text-right" : "text-left"}`}
                style={{ color: COLORS.muted }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const rank = i + 1;
            const rankColor = rank === 1 ? COLORS.gold : rank === 2 ? COLORS.silver : rank === 3 ? COLORS.bronze : COLORS.muted;
            const diff = s.setsFor - s.setsAgainst;
            return (
              <tr key={s.teamCode} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td className="p-3 w-10 font-bold" style={{ color: rankColor }}>{rank}</td>
                <td className="p-3 font-semibold">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded mr-2.5 text-[11px] font-bold"
                    style={{ background: COLORS.elev, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
                  >
                    {s.teamCode}
                  </span>
                  Team {s.teamCode}
                </td>
                <td className="p-3 text-[13px]" style={{ color: COLORS.muted }}>
                  {playersByCode[s.teamCode].map((p) => p.name).join(" · ")}
                </td>
                <td className="p-3 text-right tabular-nums">{s.played}</td>
                <td className="p-3 text-right tabular-nums">{s.wins}</td>
                <td className="p-3 text-right tabular-nums">{s.losses}</td>
                <td className="p-3 text-right tabular-nums">{diff > 0 ? `+${diff}` : diff}</td>
                <td className="p-3 text-right">
                  <span className="text-lg font-bold italic" style={{ color: COLORS.accent, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {s.points}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchesList({ fixtures }: { fixtures: FixtureResult[] }) {
  const scheduled = fixtures.filter((f) => f.status === "completed" || f.status === "scheduled");
  scheduled.sort((a, b) => `${a.date ?? ""}${a.time ?? ""}`.localeCompare(`${b.date ?? ""}${b.time ?? ""}`));
  const tbd = fixtures.filter((f) => f.status === "tbd");

  return (
    <>
      {scheduled.length > 0 && (
        <>
          <WeekStrip label="Scheduled" count={scheduled.length} />
          {scheduled.map((f) => <MatchCard key={f.fixture.key} fr={f} />)}
        </>
      )}
      {tbd.length > 0 && (
        <>
          <WeekStrip label="To Be Scheduled" count={tbd.length} />
          {tbd.map((f) => <MatchCard key={f.fixture.key} fr={f} />)}
        </>
      )}
    </>
  );
}

function MatchCard({ fr }: { fr: FixtureResult }) {
  const { fixture: f } = fr;
  const completed = fr.status === "completed";
  const leftWon = completed && fr.winner === "left";
  const rightWon = completed && fr.winner === "right";

  return (
    <div
      className="rounded-lg border p-3 mb-2"
      style={{
        background: COLORS.card,
        borderColor: fr.status === "tbd" ? COLORS.borderSoft : COLORS.border,
        borderStyle: fr.status === "tbd" ? "dashed" : "solid",
        opacity: fr.status === "tbd" ? 0.85 : 1,
      }}
    >
      <div className="flex flex-wrap gap-3 text-[11px] items-center mb-2" style={{ color: COLORS.muted }}>
        <span className="font-mono" style={{ color: COLORS.accent }}>
          {f.bracket}-{String(f.num).padStart(2, "0")}
        </span>
        <StatusPill status={fr.status} />
        {fr.date && <span>{fmtFullDate(fr.date)}</span>}
        {fr.time && <span>{fmtTime(fr.time)}</span>}
        {fr.venue && <span>{fr.venue}</span>}
        <span className="ml-auto">
          Team {f.teamLeft} <span style={{ color: COLORS.accent }}>vs</span> Team {f.teamRight}
        </span>
      </div>
      <TeamRow won={leftWon} lost={completed && !leftWon} pair={f.pairLeft} teamCode={f.teamLeft} sets={fr.sets} side="left" />
      <TeamRow won={rightWon} lost={completed && !rightWon} pair={f.pairRight} teamCode={f.teamRight} sets={fr.sets} side="right" />
    </div>
  );
}

function TeamRow({ won, lost, pair, teamCode, sets, side }: { won: boolean; lost: boolean; pair: string; teamCode: string; sets?: Array<[number, number]>; side: "left" | "right" }) {
  return (
    <div
      className="grid grid-cols-[1fr_auto] items-center py-1.5"
      style={{ borderTop: lost || won ? "none" : undefined, color: lost ? COLORS.loss : COLORS.text }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold flex-shrink-0"
          style={won ? { background: COLORS.win, color: COLORS.bg } : { background: "transparent", border: `1px solid ${COLORS.border}` }}
        >
          {won ? "✓" : ""}
        </span>
        <span
          className="inline-flex items-center justify-center min-w-5 px-1.5 h-[18px] rounded text-[10px] font-bold"
          style={{ background: COLORS.elev, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}
        >
          T{teamCode}
        </span>
        <strong>{pair}</strong>
      </div>
      <div className="flex gap-1 font-mono font-bold tabular-nums">
        {sets
          ? sets.map(([l, r], i) => {
              const me = side === "left" ? l : r;
              const them = side === "left" ? r : l;
              return (
                <span
                  key={i}
                  className="min-w-6 text-center px-1.5 py-0.5 rounded text-[13px]"
                  style={me < them ? { color: COLORS.muted, background: "transparent" } : { background: COLORS.elev }}
                >
                  {me}
                </span>
              );
            })
          : Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className="min-w-6 text-center px-1.5 py-0.5 text-[13px]" style={{ color: COLORS.muted }}>–</span>
            ))}
      </div>
    </div>
  );
}

function RostersGrid({ bracket, standings }: { bracket: Bracket; standings: BracketStanding[] }) {
  const playersByCode = Object.fromEntries(bracket.teams.map((t) => [t.code, t.players]));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
      {standings.map((s, i) => {
        const rank = i + 1;
        const rankLabel = ["🥇 1st", "🥈 2nd", "🥉 3rd", "4th"][rank - 1];
        const rankBorderColor = rank === 1 ? "rgba(245,194,107,0.45)" : rank === 2 ? "rgba(201,210,224,0.30)" : rank === 3 ? "rgba(197,138,90,0.40)" : COLORS.border;
        return (
          <div key={s.teamCode} className="rounded-xl border p-4" style={{ background: COLORS.card, borderColor: rankBorderColor }}>
            <div className="flex items-center gap-2.5 mb-3 pb-2.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center font-bold italic"
                style={{ background: COLORS.elev, border: `1px solid ${COLORS.border}`, color: COLORS.muted, fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                {s.teamCode}
              </div>
              <div>
                <div className="font-bold italic text-base tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  TEAM {s.teamCode}
                </div>
                <div className="text-[10px] tracking-widest uppercase" style={{ color: COLORS.muted }}>
                  {rankLabel} · {s.points} pts
                </div>
              </div>
            </div>
            <ul className="text-sm">
              {playersByCode[s.teamCode].map((p, idx) => (
                <li
                  key={p.player_id}
                  className="py-1.5 flex items-center justify-between"
                  style={{ borderTop: idx === 0 ? "none" : `1px dashed ${COLORS.border}` }}
                >
                  <span>{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ───── primitives ─────

function SectionHead({ title, annotate }: { title: string; annotate?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-[3px] h-[18px] rounded" style={{ background: COLORS.accent }} />
      <h2 className="text-xs tracking-widest uppercase font-bold m-0">{title}</h2>
      {annotate && (
        <span
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded border-dashed border tracking-wide"
          style={{ color: COLORS.accent, background: "rgba(0,200,220,0.06)", borderColor: "rgba(0,200,220,0.4)" }}
        >
          {annotate}
        </span>
      )}
    </div>
  );
}

function Pill({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase border"
      style={{ background: COLORS.accentDim, color: COLORS.accent, borderColor: "rgba(0,200,220,0.3)" }}
    >
      {live && <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLORS.win, boxShadow: "0 0 0 4px rgba(91,212,154,0.15)" }} />}
      {children}
    </span>
  );
}

function Stat({ value, of, label, plain, progress }: { value: string; of?: string; label: string; plain?: boolean; progress?: number }) {
  return (
    <div className="rounded-xl p-4 text-center border" style={{ background: "rgba(0,0,0,0.18)", borderColor: COLORS.borderSoft }}>
      <div
        className="font-bold italic leading-none text-3xl"
        style={{ color: plain ? COLORS.text : COLORS.accent, fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {value}
        {of && <span className="text-lg font-semibold" style={{ color: COLORS.muted }}>{of}</span>}
      </div>
      <div className="text-[10px] tracking-widest uppercase mt-1.5" style={{ color: COLORS.muted }}>
        {label}
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1 rounded overflow-hidden" style={{ background: COLORS.elev }}>
          <div className="h-full" style={{ background: COLORS.accent, width: `${Math.max(progress * 100, 1)}%` }} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: FixtureResult["status"] }) {
  const map = {
    completed: { bg: "rgba(91,212,154,0.10)", color: COLORS.win, label: "● Completed" },
    scheduled: { bg: "rgba(245,166,35,0.10)", color: COLORS.warn, label: "○ Scheduled" },
    tbd: { bg: COLORS.elev, color: COLORS.muted, label: "TBD" },
  } as const;
  const s = map[status];
  return (
    <span className="px-2 py-px rounded text-[10px] tracking-wide uppercase font-bold" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function WeekStrip({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5 my-5 text-[11px] tracking-widest uppercase" style={{ color: COLORS.muted }}>
      <span>{label}</span>
      <span style={{ color: COLORS.accent }}>{count}</span>
      <div className="flex-1 h-px" style={{ background: COLORS.border }} />
    </div>
  );
}

function fmtMonthDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtFullDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
