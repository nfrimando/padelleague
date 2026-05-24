// Build Season 11 standings for every group (A/B/C/D) from live Supabase.
// Rosters (group -> team -> players) are parsed from public/11.html, the
// official schedule. Results come from the DB. Group-type matches only;
// duels excluded. A match counts toward a group only if all 4 of its players
// belong to that group's roster.
import { readFileSync } from "node:fs";

const BASE = "https://hmztjweohbfnbpuidrtl.supabase.co";
const KEY = "sb_publishable_HvMwZ4XO6nZrYwCKs1Kffw_zVyjowBI";
const EVENT_ID = 11;
const EXCLUDED_TYPES = new Set(["duel"]);

// Explicit short-name -> player_id overrides for names that can't be resolved
// from players.name/nickname (or are ambiguous with no match participation).
// Keyed by "Group|Team|ShortName".
const OVERRIDES = {
  "Group A|Team 9|Jerry": 80, // Jerry Companjen, not Jerry Echter
};

async function rest(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const norm = (s) => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
const key = (s) => (s ?? "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (s) => norm(s).split(" ").filter(Boolean);

// --- 1. Parse rosters from public/11.html -------------------------------
function parseRosters(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  const m = html.match(/const MATCHES\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error("Could not find MATCHES array in 11.html");
  const matches = JSON.parse(m[1]);
  // group -> team -> Set(shortName)
  const rosters = {};
  for (const mt of matches) {
    const g = mt.bracket;
    rosters[g] ??= {};
    const sides = [
      [mt.teamLeft, mt.playersLeft],
      [mt.teamRight, mt.playersRight],
    ];
    for (const [team, ps] of sides) {
      rosters[g][team] ??= new Set();
      for (const p of ps ?? []) rosters[g][team].add(p);
    }
  }
  return rosters;
}

// --- 2. Resolve a short name to candidate DB players --------------------
function candidates(players, token) {
  const tWord = norm(token);
  const tKey = key(token);
  // Tier 1: exact key match or whole-word match on name/nickname.
  let hits = players.filter((p) => {
    if (key(p.nickname) === tKey || key(p.name) === tKey) return true;
    if (words(p.nickname).includes(tWord)) return true;
    if (words(p.name).includes(tWord)) return true;
    return false;
  });
  if (hits.length) return hits;
  // Tier 2: nickname key starts with token key (e.g. "Fred" -> "Fred Mc").
  if (tKey.length >= 3) {
    hits = players.filter((p) => key(p.nickname).startsWith(tKey));
    if (hits.length) return hits;
  }
  return [];
}

(async () => {
  const rosters = parseRosters(
    new URL("../public/11.html", import.meta.url).pathname
  );
  const players = await rest("players?select=player_id,name,nickname");
  const byId = new Map(players.map((p) => [p.player_id, p]));
  const lbl = (id) => {
    const p = byId.get(id);
    return p ? p.nickname ?? p.name ?? `#${id}` : `#${id}`;
  };

  // Players who actually played a completed match in this event (for disambig).
  const evMatches = await rest(
    `matches?select=match_id,type,winner_team,status&event_id=eq.${EVENT_ID}&status=eq.completed`
  );
  const evGroup = evMatches.filter((m) => !EXCLUDED_TYPES.has(m.type));
  const evIds = evGroup.map((m) => m.match_id);
  const teams = evIds.length
    ? await rest(
        `match_teams?select=match_id,player_1_id,player_2_id,team_number,sets_won&match_id=in.(${evIds.join(
          ","
        )})`
      )
    : [];
  const sets = evIds.length
    ? await rest(
        `match_sets?select=match_id,set_number,team_1_games,team_2_games&match_id=in.(${evIds.join(
          ","
        )})`
      )
    : [];
  const playedInEvent = new Set();
  for (const t of teams) {
    if (t.player_1_id != null) playedInEvent.add(t.player_1_id);
    if (t.player_2_id != null) playedInEvent.add(t.player_2_id);
  }
  const tByM = new Map();
  for (const t of teams) {
    if (!tByM.has(t.match_id)) tByM.set(t.match_id, []);
    tByM.get(t.match_id).push(t);
  }
  const sByM = new Map();
  for (const s of sets) {
    if (!sByM.has(s.match_id)) sByM.set(s.match_id, []);
    sByM.get(s.match_id).push(s);
  }
  const mByM = new Map(evGroup.map((m) => [m.match_id, m]));

  // --- 3. Resolve every group's roster to DB ids --------------------------
  const allWarnings = [];
  const groupResolved = {}; // group -> { idToTeam:Map, ids:Set, teamPlayers:{team:[ids]} }
  for (const [group, teamMap] of Object.entries(rosters)) {
    const idToTeam = new Map();
    const teamPlayers = {};
    const unresolved = [];
    for (const [team, set] of Object.entries(teamMap)) {
      teamPlayers[team] = [];
      for (const short of set) {
        const ov = OVERRIDES[`${group}|${team}|${short}`];
        let chosen = null;
        if (ov != null) {
          chosen = ov;
        } else {
          let cands = candidates(players, short);
          if (cands.length > 1) {
            const active = cands.filter((c) => playedInEvent.has(c.player_id));
            if (active.length === 1) cands = active;
            else if (active.length > 1) {
              allWarnings.push(
                `${group}/${team}: "${short}" ambiguous, multiple played: ${active
                  .map((c) => `#${c.player_id} ${c.name}`)
                  .join(", ")} — using first; ADD OVERRIDE`
              );
              cands = active;
            }
            // if none active, keep all cands (none affect standings)
          }
          if (cands.length === 0) {
            unresolved.push(short);
          } else {
            chosen = cands[0].player_id;
            // map every candidate id to this team when none played (harmless)
            if (cands.length > 1 && !cands.some((c) => playedInEvent.has(c.player_id))) {
              for (const c of cands) {
                idToTeam.set(c.player_id, team);
              }
            }
          }
        }
        if (chosen != null) {
          idToTeam.set(chosen, team);
          teamPlayers[team].push(chosen);
        }
      }
      if (unresolved.length) {
        // report per group below
      }
    }
    if (unresolved.length)
      allWarnings.push(`${group}: UNRESOLVED short names: ${unresolved.join(", ")}`);
    groupResolved[group] = { idToTeam, ids: new Set(idToTeam.keys()), teamPlayers };
  }

  // --- 4. Compute standings per group ------------------------------------
  for (const group of Object.keys(rosters).sort()) {
    const { idToTeam, ids, teamPlayers } = groupResolved[group];
    const stats = {};
    for (const team of Object.keys(rosters[group]))
      stats[team] = { played: 0, won: 0, setsWon: 0 };
    const perMatch = [];

    for (const m of evGroup) {
      const ts = tByM.get(m.match_id) ?? [];
      if (ts.length < 2) continue;
      const all = ts.flatMap((t) => [t.player_1_id, t.player_2_id]);
      if (all.length !== 4 || !all.every((id) => id != null && ids.has(id)))
        continue;
      const t1 = ts.find((t) => t.team_number === 1);
      const t2 = ts.find((t) => t.team_number === 2);
      if (!t1 || !t2) continue;
      const teamOf = (t) => {
        const a = idToTeam.get(t.player_1_id);
        const b = idToTeam.get(t.player_2_id);
        return a && a === b ? a : `MIXED(${a ?? "?"}+${b ?? "?"})`;
      };
      const sq1 = teamOf(t1);
      const sq2 = teamOf(t2);
      if (sq1.startsWith("MIXED") || sq2.startsWith("MIXED")) {
        allWarnings.push(
          `${group} m${m.match_id}: cross-team pair, skipped — ${sq1} vs ${sq2}`
        );
        continue;
      }
      const sw1 = t1.sets_won ?? 0;
      const sw2 = t2.sets_won ?? 0;
      if (stats[sq1]) {
        stats[sq1].played++;
        stats[sq1].setsWon += sw1;
        if (m.winner_team === 1) stats[sq1].won++;
      }
      if (stats[sq2]) {
        stats[sq2].played++;
        stats[sq2].setsWon += sw2;
        if (m.winner_team === 2) stats[sq2].won++;
      }
      const setStr = (sByM.get(m.match_id) ?? [])
        .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
        .map((s) => `${s.team_1_games ?? 0}-${s.team_2_games ?? 0}`)
        .join(", ");
      perMatch.push({
        match_id: m.match_id,
        sq1,
        sq2,
        t1: `${lbl(t1.player_1_id)}/${lbl(t1.player_2_id)}`,
        t2: `${lbl(t2.player_1_id)}/${lbl(t2.player_2_id)}`,
        winner: m.winner_team,
        sw1,
        sw2,
        setStr,
      });
    }

    const rows = Object.keys(rosters[group]).map((team) => ({
      team,
      players: teamPlayers[team].map(lbl).join(", "),
      ...stats[team],
      points: 3 * stats[team].won,
    }));
    rows.sort((a, b) => b.points - a.points || b.setsWon - a.setsWon);

    console.log(`\n================  SEASON 11 — ${group.toUpperCase()}  ================`);
    console.log("Team    | Players                              | P | W | SetsW | Pts");
    console.log("--------|-------------------------------------|---|---|-------|----");
    for (const r of rows) {
      console.log(
        `${r.team.padEnd(7)} | ${r.players.padEnd(35)} | ${String(r.played).padStart(1)} | ${String(
          r.won
        ).padStart(1)} | ${String(r.setsWon).padStart(5)} | ${r.points}`
      );
    }
    console.log(`  matches used (${perMatch.length}):`);
    for (const pm of perMatch.sort((a, b) => a.match_id - b.match_id)) {
      const w = pm.winner === 1 ? pm.sq1 : pm.winner === 2 ? pm.sq2 : "(none)";
      console.log(
        `   #${String(pm.match_id).padEnd(4)} ${pm.sq1} ${pm.t1} vs ${pm.sq2} ${pm.t2} | ${pm.sw1}-${pm.sw2} | sets ${pm.setStr} | W:${w}`
      );
    }
  }

  if (allWarnings.length) {
    console.log("\n!!! NOTES / WARNINGS:");
    for (const w of allWarnings) console.log("  - " + w);
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
