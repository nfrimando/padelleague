// Season 11 bracket / team / fixture data.
// Lives outside the DB on purpose — Padel League schema doesn't model brackets
// or fixed season teams. Joined to live `matches` rows at request time by
// matching the 4-player set per match.

export type SeasonPlayer = { name: string; player_id: number };
export type SeasonTeam = { code: string; players: SeasonPlayer[] };
export type SeasonBracket = {
  num: 1 | 2 | 3 | 4;
  key: "A" | "B" | "C" | "D";
  title: string;
  sub: string;
  format: "4×3" | "4×4";
  color: string;
  teams: SeasonTeam[];
};
export type SeasonFixture = {
  key: string; // e.g. "D-1"
  bracket: "A" | "B" | "C" | "D";
  num: number;
  teamLeft: string;
  teamRight: string;
  pairLeft: string;
  pairRight: string;
  playerIdsLeft: number[];
  playerIdsRight: number[];
};

export const SEASON_11 = {
  event_id: 11,
  name: "Season 11",
  start_date: "2026-05-04",
  end_date: "2026-06-14",
  brackets: [
    {
      num: 1, key: "A", title: "Bracket 1", sub: "Top Flight", format: "4×3", color: "#E8A472",
      teams: [
        { code: "1", players: [{ name: "Pancho", player_id: 146 }, { name: "Josh K", player_id: 94 }, { name: "Amaury", player_id: 13 }] },
        { code: "8", players: [{ name: "Henrik", player_id: 69 }, { name: "Nigel", player_id: 138 }, { name: "Norifumi", player_id: 143 }] },
        { code: "3", players: [{ name: "Angel", player_id: 16 }, { name: "Luca", player_id: 111 }, { name: "Pedro", player_id: 149 }] },
        { code: "9", players: [{ name: "Armand", player_id: 20 }, { name: "Hein", player_id: 68 }, { name: "Jerry", player_id: 80 }] },
      ],
    },
    {
      num: 2, key: "B", title: "Bracket 2", sub: "Second Flight", format: "4×3", color: "#F0D078",
      teams: [
        { code: "2", players: [{ name: "Tiger", player_id: 171 }, { name: "JM", player_id: 84 }, { name: "Guilherme", player_id: 193 }] },
        { code: "5", players: [{ name: "Vic B", player_id: 178 }, { name: "Kino", player_id: 104 }, { name: "Andy", player_id: 15 }] },
        { code: "4", players: [{ name: "Gil", player_id: 62 }, { name: "Alexis", player_id: 8 }, { name: "Shogo", player_id: 165 }] },
        { code: "6", players: [{ name: "Kevin", player_id: 100 }, { name: "Misagh", player_id: 133 }, { name: "Leandro", player_id: 109 }] },
      ],
    },
    {
      num: 3, key: "C", title: "Bracket 3", sub: "Third Flight", format: "4×3", color: "#8FCFC0",
      teams: [
        { code: "1", players: [{ name: "Alan", player_id: 1 }, { name: "John", player_id: 87 }, { name: "JF", player_id: 82 }] },
        { code: "2", players: [{ name: "Robin", player_id: 161 }, { name: "Nicholai", player_id: 135 }, { name: "George", player_id: 59 }] },
        { code: "3", players: [{ name: "Kres", player_id: 106 }, { name: "Rave", player_id: 158 }, { name: "Ted", player_id: 169 }] },
        { code: "4", players: [{ name: "Erwin", player_id: 50 }, { name: "MiggySan", player_id: 127 }, { name: "BJ", player_id: 25 }] },
      ],
    },
    {
      num: 4, key: "D", title: "Bracket 4", sub: "Fourth Flight", format: "4×4", color: "#7FA2D8",
      teams: [
        { code: "1", players: [{ name: "Jopet", player_id: 189 }, { name: "Ian", player_id: 72 }, { name: "Joel", player_id: 86 }, { name: "Jolo", player_id: 90 }] },
        { code: "2", players: [{ name: "MiggySil", player_id: 128 }, { name: "Chut", player_id: 33 }, { name: "Ron", player_id: 162 }, { name: "Austin", player_id: 21 }] },
        { code: "3", players: [{ name: "Alfonso", player_id: 9 }, { name: "Fred", player_id: 55 }, { name: "PJ", player_id: 154 }, { name: "Phee", player_id: 152 }] },
        { code: "4", players: [{ name: "Joe", player_id: 188 }, { name: "Karlo", player_id: 187 }, { name: "Jon", player_id: 91 }, { name: "Nikko", player_id: 140 }] },
      ],
    },
  ] as const satisfies readonly SeasonBracket[],
};

// Compact fixture rows: [bracket, num, teamLeft, teamRight, pairLeftNames, pairRightNames]
// Player names here MUST match the `name` field in SEASON_11.brackets so we can resolve to player_ids.
const FIXTURES_RAW: ReadonlyArray<[string, number, string, string, string[], string[]]> = [
  ["A",1,"1","8",["Pancho","Josh K"],["Nigel","Norifumi"]],
  ["A",2,"1","8",["Josh K","Amaury"],["Henrik","Norifumi"]],
  ["A",3,"1","8",["Pancho","Amaury"],["Henrik","Nigel"]],
  ["A",4,"1","3",["Pancho","Josh K"],["Luca","Pedro"]],
  ["A",5,"1","3",["Josh K","Amaury"],["Angel","Pedro"]],
  ["A",6,"1","3",["Pancho","Amaury"],["Angel","Luca"]],
  ["A",7,"1","9",["Pancho","Josh K"],["Hein","Jerry"]],
  ["A",8,"1","9",["Josh K","Amaury"],["Armand","Jerry"]],
  ["A",9,"1","9",["Pancho","Amaury"],["Armand","Hein"]],
  ["A",10,"8","3",["Henrik","Nigel"],["Luca","Pedro"]],
  ["A",11,"8","3",["Nigel","Norifumi"],["Angel","Pedro"]],
  ["A",12,"8","3",["Henrik","Norifumi"],["Angel","Luca"]],
  ["A",13,"8","9",["Henrik","Nigel"],["Hein","Jerry"]],
  ["A",14,"8","9",["Nigel","Norifumi"],["Armand","Jerry"]],
  ["A",15,"8","9",["Henrik","Norifumi"],["Armand","Hein"]],
  ["A",16,"3","9",["Angel","Luca"],["Hein","Jerry"]],
  ["A",17,"3","9",["Luca","Pedro"],["Armand","Jerry"]],
  ["A",18,"3","9",["Angel","Pedro"],["Armand","Hein"]],
  ["B",1,"2","5",["Tiger","JM"],["Kino","Andy"]],
  ["B",2,"2","5",["JM","Guilherme"],["Vic B","Andy"]],
  ["B",3,"2","5",["Tiger","Guilherme"],["Vic B","Kino"]],
  ["B",4,"2","4",["Tiger","JM"],["Alexis","Shogo"]],
  ["B",5,"2","4",["JM","Guilherme"],["Gil","Shogo"]],
  ["B",6,"2","4",["Tiger","Guilherme"],["Gil","Alexis"]],
  ["B",7,"2","6",["Tiger","JM"],["Misagh","Leandro"]],
  ["B",8,"2","6",["JM","Guilherme"],["Kevin","Leandro"]],
  ["B",9,"2","6",["Tiger","Guilherme"],["Kevin","Misagh"]],
  ["B",10,"5","4",["Vic B","Kino"],["Alexis","Shogo"]],
  ["B",11,"5","4",["Kino","Andy"],["Gil","Shogo"]],
  ["B",12,"5","4",["Vic B","Andy"],["Gil","Alexis"]],
  ["B",13,"5","6",["Vic B","Kino"],["Misagh","Leandro"]],
  ["B",14,"5","6",["Kino","Andy"],["Kevin","Leandro"]],
  ["B",15,"5","6",["Vic B","Andy"],["Kevin","Misagh"]],
  ["B",16,"4","6",["Gil","Alexis"],["Misagh","Leandro"]],
  ["B",17,"4","6",["Alexis","Shogo"],["Kevin","Leandro"]],
  ["B",18,"4","6",["Gil","Shogo"],["Kevin","Misagh"]],
  ["C",1,"1","2",["Alan","John"],["Nicholai","George"]],
  ["C",2,"1","2",["John","JF"],["Robin","George"]],
  ["C",3,"1","2",["Alan","JF"],["Robin","Nicholai"]],
  ["C",4,"1","3",["Alan","John"],["Rave","Ted"]],
  ["C",5,"1","3",["John","JF"],["Kres","Ted"]],
  ["C",6,"1","3",["Alan","JF"],["Kres","Rave"]],
  ["C",7,"1","4",["Alan","John"],["MiggySan","BJ"]],
  ["C",8,"1","4",["John","JF"],["Erwin","BJ"]],
  ["C",9,"1","4",["Alan","JF"],["Erwin","MiggySan"]],
  ["C",10,"2","3",["Robin","Nicholai"],["Rave","Ted"]],
  ["C",11,"2","3",["Nicholai","George"],["Kres","Ted"]],
  ["C",12,"2","3",["Robin","George"],["Kres","Rave"]],
  ["C",13,"2","4",["Robin","Nicholai"],["MiggySan","BJ"]],
  ["C",14,"2","4",["Nicholai","George"],["Erwin","BJ"]],
  ["C",15,"2","4",["Robin","George"],["Erwin","MiggySan"]],
  ["C",16,"3","4",["Kres","Rave"],["MiggySan","BJ"]],
  ["C",17,"3","4",["Rave","Ted"],["Erwin","BJ"]],
  ["C",18,"3","4",["Kres","Ted"],["Erwin","MiggySan"]],
  ["D",1,"1","2",["Jopet","Ian"],["MiggySil","Chut"]],
  ["D",2,"1","2",["Jopet","Ian"],["Ron","Austin"]],
  ["D",3,"1","2",["Joel","Jolo"],["MiggySil","Chut"]],
  ["D",4,"1","2",["Joel","Jolo"],["Ron","Austin"]],
  ["D",5,"1","3",["Jopet","Joel"],["Alfonso","PJ"]],
  ["D",6,"1","3",["Jopet","Joel"],["Fred","Phee"]],
  ["D",7,"1","3",["Ian","Jolo"],["Alfonso","PJ"]],
  ["D",8,"1","3",["Ian","Jolo"],["Fred","Phee"]],
  ["D",9,"1","4",["Jopet","Jolo"],["Joe","Nikko"]],
  ["D",10,"1","4",["Jopet","Jolo"],["Karlo","Jon"]],
  ["D",11,"1","4",["Ian","Joel"],["Joe","Nikko"]],
  ["D",12,"1","4",["Ian","Joel"],["Karlo","Jon"]],
  ["D",13,"2","3",["MiggySil","Austin"],["Alfonso","Phee"]],
  ["D",14,"2","3",["MiggySil","Austin"],["Fred","PJ"]],
  ["D",15,"2","3",["Chut","Ron"],["Alfonso","Phee"]],
  ["D",16,"2","3",["Chut","Ron"],["Fred","PJ"]],
  ["D",17,"2","4",["MiggySil","Ron"],["Joe","Jon"]],
  ["D",18,"2","4",["MiggySil","Ron"],["Karlo","Nikko"]],
  ["D",19,"2","4",["Chut","Austin"],["Joe","Jon"]],
  ["D",20,"2","4",["Chut","Austin"],["Karlo","Nikko"]],
  ["D",21,"3","4",["Alfonso","Fred"],["Joe","Karlo"]],
  ["D",22,"3","4",["Alfonso","Fred"],["Jon","Nikko"]],
  ["D",23,"3","4",["PJ","Phee"],["Joe","Karlo"]],
  ["D",24,"3","4",["PJ","Phee"],["Jon","Nikko"]],
];

// Build a name → player_id lookup once
const NAME_TO_ID = new Map<string, number>();
for (const b of SEASON_11.brackets) for (const t of b.teams) for (const p of t.players) NAME_TO_ID.set(p.name, p.player_id);

function namesToIds(names: string[]): number[] {
  return names.map((n) => {
    const id = NAME_TO_ID.get(n);
    if (id === undefined) throw new Error(`Season 11 fixture references unknown player name: ${n}`);
    return id;
  });
}

export const FIXTURES: SeasonFixture[] = FIXTURES_RAW.map(([bracket, num, tl, tr, pl, pr]) => ({
  key: `${bracket}-${num}`,
  bracket: bracket as "A" | "B" | "C" | "D",
  num,
  teamLeft: tl,
  teamRight: tr,
  pairLeft: pl.join(" & "),
  pairRight: pr.join(" & "),
  playerIdsLeft: namesToIds(pl),
  playerIdsRight: namesToIds(pr),
}));

// Stable canonical key for a 4-player set, used to match a DB match to its fixture.
export function playerSetKey(playerIds: number[]): string {
  return [...playerIds].sort((a, b) => a - b).join(",");
}

// fixtureKey lookup by 4-player set
export const FIXTURE_BY_PLAYER_SET = new Map<string, SeasonFixture>();
for (const f of FIXTURES) {
  const key = playerSetKey([...f.playerIdsLeft, ...f.playerIdsRight]);
  FIXTURE_BY_PLAYER_SET.set(key, f);
}
