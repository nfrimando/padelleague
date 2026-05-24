// One-off: build Season 11 Group A standings from live Supabase.
const URL = "https://hmztjweohbfnbpuidrtl.supabase.co";
const KEY = "sb_publishable_HvMwZ4XO6nZrYwCKs1Kffw_zVyjowBI";
const EVENT_ID = 11;

const SQUADS = {
  "Team 1": ["Pancho", "Josh", "Amaury"],
  "Team 3": ["Angel", "Luca", "Pedro"],
  "Team 8": ["Henrik", "Nigel", "Norifumi"],
  "Team 9": ["Armand", "Hein", "Jerry"],
};

async function rest(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const norm = (s) => (s ?? "").toString().trim().toLowerCase();

function matchToken(player, token) {
  const t = norm(token);
  const name = norm(player?.name);
  const nick = norm(player?.nickname);
  if (!t) return false;
  if (nick === t || name === t) return true;
  // token matches a whole word within full name (e.g. "Josh" in "Josh Smith")
  const words = name.split(/\s+/).filter(Boolean);
  if (words.includes(t)) return true;
  const nickWords = nick.split(/\s+/).filter(Boolean);
  if (nickWords.includes(t)) return true;
  return false;
}

(async () => {
  const players = await rest("players?select=player_id,name,nickname");

  // Player ids that actually appear in this event's completed matches — used to
  // disambiguate name collisions (e.g. two "Josh"/"Jerry" players).
  const evMatches = await rest(
    `matches?select=match_id&event_id=eq.${EVENT_ID}&status=eq.completed`
  );
  const evIds = evMatches.map((m) => m.match_id);
  const evTeams = evIds.length
    ? await rest(
        `match_teams?select=player_1_id,player_2_id&match_id=in.(${evIds.join(
          ","
        )})`
      )
    : [];
  const playedInEvent = new Set();
  for (const t of evTeams) {
    if (t.player_1_id != null) playedInEvent.add(t.player_1_id);
    if (t.player_2_id != null) playedInEvent.add(t.player_2_id);
  }

  // Resolve each squad name -> player_id, flag ambiguities/misses.
  const playerToSquad = new Map(); // player_id -> squad label
  const resolution = []; // for reporting
  const problems = [];
  for (const [squad, names] of Object.entries(SQUADS)) {
    for (const token of names) {
      let hits = players.filter((p) => matchToken(p, token));
      if (hits.length > 1) {
        // Disambiguate by who actually played in this event.
        const active = hits.filter((h) => playedInEvent.has(h.player_id));
        if (active.length === 1) {
          problems.push(
            `RESOLVED ambiguous "${token}" (${squad}) -> #${active[0].player_id} ${active[0].name} (only one who played Season 11); other candidates: ${hits
              .filter((h) => h.player_id !== active[0].player_id)
              .map((h) => `#${h.player_id} ${h.name}`)
              .join(", ")}`
          );
          hits = active;
        } else if (active.length === 0) {
          problems.push(
            `AMBIGUOUS "${token}" (${squad}) — none played Season 11, mapping all candidates (harmless, no matches): ${hits
              .map((h) => `#${h.player_id} ${h.name}/${h.nickname}`)
              .join(", ")}`
          );
          // Map all candidates to the squad; since none played, cannot affect counts.
          for (const h of hits) {
            playerToSquad.set(h.player_id, squad);
            resolution.push({
              squad,
              token,
              player_id: h.player_id,
              resolved: `${h.name} / ${h.nickname}`,
            });
          }
          continue;
        } else {
          problems.push(
            `AMBIGUOUS "${token}" (${squad}) — multiple played Season 11: ${active
              .map((h) => `#${h.player_id} ${h.name}`)
              .join(", ")} (NEEDS MANUAL REVIEW)`
          );
          for (const h of active) {
            playerToSquad.set(h.player_id, squad);
            resolution.push({
              squad,
              token,
              player_id: h.player_id,
              resolved: `${h.name} / ${h.nickname}`,
            });
          }
          continue;
        }
      }

      if (hits.length === 0) {
        problems.push(`NO MATCH for "${token}" (${squad})`);
        resolution.push({ squad, token, player_id: null, resolved: "(none)" });
      } else {
        const h = hits[0];
        playerToSquad.set(h.player_id, squad);
        resolution.push({
          squad,
          token,
          player_id: h.player_id,
          resolved: `${h.name} / ${h.nickname}`,
        });
      }
    }
  }

  console.log("=== Player resolution (Group A) ===");
  for (const r of resolution) {
    console.log(
      `  ${r.squad.padEnd(8)} | ${String(r.token).padEnd(10)} | #${
        r.player_id ?? "?"
      } ${r.resolved}`
    );
  }
  if (problems.length) {
    console.log("\n!!! RESOLUTION PROBLEMS:");
    for (const p of problems) console.log("  - " + p);
  }
  const groupAIds = new Set(playerToSquad.keys());
  console.log(`\nResolved ${groupAIds.size}/12 Group A player ids.\n`);

  // Pull completed matches for the event.
  const matches = await rest(
    `matches?select=match_id,event_id,type,winner_team,status&event_id=eq.${EVENT_ID}&status=eq.completed`
  );
  const matchIds = matches.map((m) => m.match_id);
  if (matchIds.length === 0) {
    console.log("No completed matches for event.");
    return;
  }

  // Pull match_teams + match_sets for those matches.
  const inList = `(${matchIds.join(",")})`;
  const teams = await rest(
    `match_teams?select=match_id,player_1_id,player_2_id,team_number,sets_won&match_id=in.${inList}`
  );
  const sets = await rest(
    `match_sets?select=match_id,set_number,team_1_games,team_2_games&match_id=in.${inList}`
  );

  // Group teams/sets by match.
  const teamsByMatch = new Map();
  for (const t of teams) {
    if (!teamsByMatch.has(t.match_id)) teamsByMatch.set(t.match_id, []);
    teamsByMatch.get(t.match_id).push(t);
  }
  const setsByMatch = new Map();
  for (const s of sets) {
    if (!setsByMatch.has(s.match_id)) setsByMatch.set(s.match_id, []);
    setsByMatch.get(s.match_id).push(s);
  }

  const pname = new Map(players.map((p) => [p.player_id, p]));
  const label = (id) => {
    const p = pname.get(id);
    if (!p) return `#${id}`;
    return p.nickname ?? p.name ?? `#${id}`;
  };

  // Aggregate.
  const stats = {};
  for (const sq of Object.keys(SQUADS))
    stats[sq] = { played: 0, won: 0, setsWon: 0 };

  const perMatch = [];
  for (const m of matches) {
    const ts = teamsByMatch.get(m.match_id) ?? [];
    if (ts.length < 2) continue;
    const allIds = ts.flatMap((t) => [t.player_1_id, t.player_2_id]);
    // Group A only if all 4 players are Group A players.
    if (allIds.length !== 4 || !allIds.every((id) => groupAIds.has(id)))
      continue;

    const t1 = ts.find((t) => t.team_number === 1);
    const t2 = ts.find((t) => t.team_number === 2);
    if (!t1 || !t2) continue;

    const squadOf = (t) => {
      const a = playerToSquad.get(t.player_1_id);
      const b = playerToSquad.get(t.player_2_id);
      return a && a === b ? a : `${a ?? "?"}+${b ?? "?"}`;
    };
    const sq1 = squadOf(t1);
    const sq2 = squadOf(t2);

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

    const setStr = (setsByMatch.get(m.match_id) ?? [])
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
      .map((s) => `${s.team_1_games ?? 0}-${s.team_2_games ?? 0}`)
      .join(", ");

    perMatch.push({
      match_id: m.match_id,
      sq1,
      sq2,
      t1: `${label(t1.player_1_id)}/${label(t1.player_2_id)}`,
      t2: `${label(t2.player_1_id)}/${label(t2.player_2_id)}`,
      winner: m.winner_team,
      sw1,
      sw2,
      setStr,
    });
  }

  console.log("=== Per-match results used (Group A) ===");
  console.log(
    "match | team1 squad (pair) | team2 squad (pair) | winner | sets | set scores"
  );
  for (const pm of perMatch.sort((a, b) => a.match_id - b.match_id)) {
    const winLabel =
      pm.winner === 1 ? pm.sq1 : pm.winner === 2 ? pm.sq2 : "(none)";
    console.log(
      `  #${String(pm.match_id).padEnd(4)} | ${pm.sq1.padEnd(7)} ${pm.t1.padEnd(
        22
      )} | ${pm.sq2.padEnd(7)} ${pm.t2.padEnd(22)} | W:${winLabel.padEnd(
        8
      )} | ${pm.sw1}-${pm.sw2} | ${pm.setStr}`
    );
  }
  console.log(`\nTotal Group A matches counted: ${perMatch.length}\n`);

  // Standings.
  const rows = Object.entries(stats).map(([sq, s]) => ({
    team: sq,
    players: SQUADS[sq].join(", "),
    played: s.played,
    won: s.won,
    setsWon: s.setsWon,
    points: 3 * s.won,
  }));
  rows.sort((a, b) => b.points - a.points || b.setsWon - a.setsWon);

  console.log("=== Season 11 — Group A Standings ===");
  console.log(
    "Team    | Players                  | Played | Won | Sets Won | Points"
  );
  console.log(
    "--------|--------------------------|--------|-----|----------|-------"
  );
  for (const r of rows) {
    console.log(
      `${r.team.padEnd(7)} | ${r.players.padEnd(24)} | ${String(
        r.played
      ).padEnd(6)} | ${String(r.won).padEnd(3)} | ${String(r.setsWon).padEnd(
        8
      )} | ${r.points}`
    );
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
