// Render the Season 11 group standings as a branded PNG (+ SVG).
//   node scripts/season11/season11-image.mjs [outPathWithoutExt]
// PNG rasterization needs @resvg/resvg-js. If it isn't installed in this
// project, set RESVG_DIR to a folder that has it (npm i @resvg/resvg-js there).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { computeStandings } from "./season11-standings.mjs";

const C = {
  bg: "#0E1523",
  card: "#162032",
  border: "#1E3050",
  teal: "#00C8DC",
  slate: "#687FA3",
  white: "#FFFFFF",
  soft: "rgba(255,255,255,0.88)",
  leaderBg: "rgba(0,200,220,0.10)",
  rowLine: "rgba(30,48,80,0.6)",
};
const SANS = "DejaVu Sans, Liberation Sans, sans-serif";
const MONO = "DejaVu Sans Mono, Liberation Mono, monospace";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function text(x, y, s, { size = 14, fill = C.white, weight = 400, anchor = "start", family = SANS, spacing = 0, italic = false } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ""}${italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`;
}
function rect(x, y, w, h, { fill = "none", rx = 0, stroke = "none", sw = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;
}

function card(x, y, w, h, g) {
  const pad = 22;
  let s = "";
  s += rect(x, y, w, h, { fill: C.card, rx: 14, stroke: C.border, sw: 1 });

  // Title + accent + match badge
  const titleY = y + 40;
  s += text(x + pad, titleY, g.group.toUpperCase(), { size: 23, weight: 700, family: SANS, spacing: 0.5 });
  s += rect(x + pad, titleY + 10, 46, 3, { fill: C.teal, rx: 2 });
  const played = g.matches.length;
  s += text(x + w - pad, titleY - 2, `${played} ${played === 1 ? "MATCH" : "MATCHES"}`, { size: 11, fill: C.slate, anchor: "end", family: MONO, spacing: 1 });

  // Column headers
  const ptsCx = x + w - 34;
  const setsCx = x + w - 92;
  const wCx = x + w - 142;
  const pCx = x + w - 184;
  const hY = titleY + 44;
  const hOpt = { size: 11, fill: C.slate, anchor: "middle", family: MONO, spacing: 1 };
  s += text(x + pad + 28, hY, "TEAM", { size: 11, fill: C.slate, family: MONO, spacing: 1 });
  s += text(pCx, hY, "P", hOpt);
  s += text(wCx, hY, "W", hOpt);
  s += text(setsCx, hY, "SETS", hOpt);
  s += text(ptsCx, hY, "PTS", { ...hOpt, fill: C.teal });
  s += rect(x + pad, hY + 12, w - pad * 2, 1, { fill: C.border });

  // Rows
  const rowH = 70;
  let ry = hY + 12;
  g.rows.forEach((r, i) => {
    const top = ry;
    const isLeader = i === 0 && r.points > 0;
    if (isLeader) {
      s += rect(x + 6, top, w - 12, rowH, { fill: C.leaderBg, rx: 8 });
      s += rect(x + 6, top + 8, 3, rowH - 16, { fill: C.teal, rx: 2 });
    }
    const midName = top + 30;
    const midSub = top + 50;
    const midNum = top + 36;
    // rank
    s += text(x + pad, midName, String(i + 1), { size: 16, fill: isLeader ? C.teal : C.slate, weight: 700, family: MONO });
    // team + players
    s += text(x + pad + 28, midName, r.team, { size: 18, weight: 700, fill: isLeader ? C.white : C.soft });
    s += text(x + pad + 28, midSub, r.players, { size: 12.5, fill: C.slate });
    // numbers
    const numOpt = { size: 16, anchor: "middle", family: MONO, fill: C.soft };
    s += text(pCx, midNum, r.played, numOpt);
    s += text(wCx, midNum, r.won, numOpt);
    s += text(setsCx, midNum, r.setsWon, numOpt);
    s += text(ptsCx, midNum, r.points, { size: 22, anchor: "middle", family: MONO, weight: 700, fill: isLeader ? C.teal : C.soft });
    if (i < g.rows.length - 1) s += rect(x + pad, top + rowH, w - pad * 2, 1, { fill: C.rowLine });
    ry += rowH;
  });
  return s;
}

function logo(x, y) {
  // teal rounded square with a simple padel racket (from 11.html)
  const sz = 48;
  let s = rect(x, y, sz, sz, { fill: C.teal, rx: 10 });
  const cx = x + sz / 2, cy = y + 17;
  s += `<g stroke="${C.bg}" fill="none" stroke-linecap="round">`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="10.5" stroke-width="3"/>`;
  s += `<line x1="${cx}" y1="${cy + 9}" x2="${cx}" y2="${y + sz - 5}" stroke-width="4"/>`;
  s += `<line x1="${cx - 5}" y1="${y + sz - 8}" x2="${cx + 5}" y2="${y + sz - 8}" stroke-width="3.4"/>`;
  s += `</g>`;
  return s;
}

function buildSvg(groups) {
  const W = 1080;
  const margin = 48;
  const gap = 28;
  const cardW = (W - margin * 2 - gap) / 2;
  const cardH = 398;
  const headerTop = 56;
  const gridTop = 188;
  const H = gridTop + cardH * 2 + gap + 78;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += rect(0, 0, W, H, { fill: C.bg });

  // Header
  s += logo(margin, headerTop);
  s += `<text x="${margin + 64}" y="${headerTop + 22}" font-family="${SANS}" font-size="28" font-weight="700" fill="${C.white}" letter-spacing="1">PADEL LEAGUE <tspan fill="${C.slate}">PH</tspan></text>`;
  s += text(margin + 64, headerTop + 46, "SEASON 11 · GROUP STANDINGS", { size: 13, fill: C.slate, spacing: 2, family: MONO });

  const today = new Date();
  const dstr = today
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  s += text(W - margin, headerTop + 18, "AS OF", { size: 11, fill: C.slate, anchor: "end", family: MONO, spacing: 2 });
  s += text(W - margin, headerTop + 42, dstr, { size: 18, fill: C.teal, anchor: "end", weight: 700, family: SANS, spacing: 1 });

  s += rect(margin, gridTop - 26, W - margin * 2, 1, { fill: C.border });

  // 2x2 grid
  const order = ["Group A", "Group B", "Group C", "Group D"];
  const byName = new Map(groups.map((g) => [g.group, g]));
  order.forEach((name, idx) => {
    const g = byName.get(name);
    if (!g) return;
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = margin + col * (cardW + gap);
    const y = gridTop + row * (cardH + gap);
    s += card(x, y, cardW, cardH, g);
  });

  // Footer
  const fy = gridTop + cardH * 2 + gap + 44;
  s += text(W / 2, fy, "PADELPH.COM", { size: 12, fill: C.slate, anchor: "middle", spacing: 3, family: MONO });
  s += text(W / 2, fy + 22, "Win = 3 pts · ties: sets won, then head-to-head", { size: 11, fill: "rgba(104,127,163,0.7)", anchor: "middle", family: SANS });

  s += `</svg>`;
  return s;
}

// One large, mobile-friendly card per group.
function buildGroupSvg(g) {
  const W = 1080;
  const margin = 60;
  const headerTop = 64;
  const cardRight = W - margin;
  const rowH = 176;
  const rowsTop = 372;
  const H = rowsTop + rowH * g.rows.length + 116;

  const ptsCx = cardRight - 72;
  const setsCx = cardRight - 206;
  const wCx = cardRight - 330;
  const pCx = cardRight - 432;
  const nameX = margin + 96;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += rect(0, 0, W, H, { fill: C.bg });

  // Header
  s += logo(margin, headerTop);
  s += `<text x="${margin + 70}" y="${headerTop + 24}" font-family="${SANS}" font-size="30" font-weight="700" fill="${C.white}" letter-spacing="1">PADEL LEAGUE <tspan fill="${C.slate}">PH</tspan></text>`;
  s += text(margin + 70, headerTop + 50, "SEASON 11 · GROUP STANDINGS", { size: 14, fill: C.slate, spacing: 2, family: MONO });
  const dstr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  s += text(cardRight, headerTop + 46, dstr, { size: 17, fill: C.teal, anchor: "end", weight: 700, family: SANS, spacing: 1 });
  s += rect(margin, headerTop + 88, W - margin * 2, 1, { fill: C.border });

  // Big group title + accent + match count
  const titleY = headerTop + 168;
  s += text(margin, titleY, g.group.toUpperCase(), { size: 52, weight: 700, family: SANS, spacing: 0.5 });
  s += rect(margin, titleY + 18, 78, 5, { fill: C.teal, rx: 2.5 });
  const played = g.matches.length;
  s += text(cardRight, titleY - 6, `${played} ${played === 1 ? "MATCH" : "MATCHES"} PLAYED`, { size: 15, fill: C.slate, anchor: "end", family: MONO, spacing: 1 });

  // Column headers
  const hY = rowsTop - 22;
  const hOpt = { size: 16, fill: C.slate, anchor: "middle", family: MONO, spacing: 1 };
  s += text(nameX, hY, "TEAM", { size: 16, fill: C.slate, family: MONO, spacing: 1 });
  s += text(pCx, hY, "P", hOpt);
  s += text(wCx, hY, "W", hOpt);
  s += text(setsCx, hY, "SETS", hOpt);
  s += text(ptsCx, hY, "PTS", { ...hOpt, fill: C.teal });
  s += rect(margin, hY + 16, W - margin * 2, 1, { fill: C.border });

  // Rows
  g.rows.forEach((r, i) => {
    const top = rowsTop + i * rowH;
    const isLeader = i === 0 && r.points > 0;
    if (isLeader) {
      s += rect(margin, top, W - margin * 2, rowH, { fill: C.leaderBg, rx: 12 });
      s += rect(margin, top + 16, 5, rowH - 32, { fill: C.teal, rx: 2.5 });
    }
    const nameY = top + 78;
    const subY = top + 116;
    const numY = top + 92;
    s += text(margin + 30, nameY, String(i + 1), { size: 40, fill: isLeader ? C.teal : C.slate, weight: 700, family: MONO });
    s += text(nameX, nameY, r.team, { size: 36, weight: 700, fill: isLeader ? C.white : C.soft });
    s += text(nameX, subY, r.players, { size: 21, fill: C.slate });
    const numOpt = { size: 32, anchor: "middle", family: MONO, fill: C.soft };
    s += text(pCx, numY, r.played, numOpt);
    s += text(wCx, numY, r.won, numOpt);
    s += text(setsCx, numY, r.setsWon, numOpt);
    s += text(ptsCx, numY, r.points, { size: 50, anchor: "middle", family: MONO, weight: 700, fill: isLeader ? C.teal : C.soft });
    if (i < g.rows.length - 1) s += rect(margin, top + rowH, W - margin * 2, 1, { fill: C.rowLine });
  });

  // Footer
  const fy = H - 56;
  s += text(margin, fy, "PADELPH.COM", { size: 14, fill: C.slate, spacing: 3, family: MONO });
  s += text(cardRight, fy, "Win = 3 pts · ties: sets won, then head-to-head", { size: 14, fill: "rgba(104,127,163,0.75)", anchor: "end", family: SANS });

  s += `</svg>`;
  return s;
}

let _Resvg = null;
function getResvg() {
  if (_Resvg) return _Resvg;
  // Try, in order: standard resolution (project node_modules), then RESVG_DIR.
  const bases = [import.meta.url, `${(process.env.RESVG_DIR || "/tmp/imggen").replace(/\/$/, "")}/x.js`];
  for (const base of bases) {
    try {
      _Resvg = createRequire(base)("@resvg/resvg-js").Resvg;
      return _Resvg;
    } catch {}
  }
  console.log("PNG disabled — install the rasterizer:  npm i @resvg/resvg-js   (or set RESVG_DIR). Writing .svg only.");
  _Resvg = false;
  return _Resvg;
}
function writeImage(svg, base) {
  writeFileSync(`${base}.svg`, svg);
  const Resvg = getResvg();
  if (Resvg) {
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1080 }, background: C.bg }).render().asPng();
    writeFileSync(`${base}.png`, png);
    console.log(`Wrote ${base}.png`);
  } else {
    console.log(`Wrote ${base}.svg`);
  }
}

const outDir = (process.argv[2] || new URL("../..", import.meta.url).pathname).replace(/\/$/, "");
const { groups, warnings } = await computeStandings();

// One image per group (mobile-friendly), plus a combined overview.
for (const g of groups) {
  const letter = g.group.replace(/[^A-Za-z0-9]/g, "").toLowerCase(); // "groupa"
  writeImage(buildGroupSvg(g), `${outDir}/season11-${letter}`);
}
writeImage(buildSvg(groups), `${outDir}/season11-standings`);
if (warnings.length) console.log("notes:", warnings.join(" | "));
