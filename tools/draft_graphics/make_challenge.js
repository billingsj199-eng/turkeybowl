// Turkey Bowl Bracket Challenge graphic (Instagram 1080x1350 PNG).
//   Before Game 1 kickoff (picks hidden): a promo slide (how to play, scoring, lock time, Round 1).
//   After kickoff: the leaderboard (top brackets, points, max possible, champion pick, 🔥 still perfect).
// Uses the site's own bracket + challenge code (bracket.js, challenge.js) so the scores match the site exactly.
// Names show as first name + last initial (it's going on Instagram).
//
//   node tools/draft_graphics/make_challenge.js            (run from E:\TurkeyBowl; picks the slide from the live data)
//   node tools/draft_graphics/make_challenge.js --promo    (force the promo slide)
//   node tools/draft_graphics/make_challenge.js --demo     (preview the leaderboard with made-up brackets + results)
//
// Output: tools/graphics/challenge/challenge-promo.png, challenge-leaderboard[-after-g<N>|-final].png (demo-* for --demo)
const fs = require("fs"), path = require("path"), vm = require("vm"), { load, render, get, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "challenge");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const short = n => { const p = String(n || "Someone").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };

(async () => {
  const D = await load(), { L, team, SEASON } = D;
  const c = v => v.stringValue ?? (v.integerValue != null ? +v.integerValue : undefined) ?? v.booleanValue ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, c(x)])) : v.arrayValue ? (v.arrayValue.values || []).map(c) : v.nullValue === null ? null : v.timestampValue);
  const fields = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, c(v)]));
  const bdoc = await get(`bracket/${SEASON}`), B = bdoc.fields ? fields(bdoc) : null;
  // the database refuses to list brackets before kickoff (403): that means promo time
  let ent; try { ent = await get(`challenge/${SEASON}/entries?pageSize=300`); } catch(e){ ent = { error: e.message }; }
  let entries = ent.error ? null : (ent.documents || []).map(d => ({ uid: d.name.split("/").pop(), ...fields(d) }));   // null = still hidden (before kickoff)

  const tbc = { live: { order: L.order } };
  const ctx = { window: { TBC: tbc }, TBC: tbc, CURRENT_SEASON: SEASON, captains: L.order, esc2: esc, console, location: { hash: "" },
    document: { addEventListener(){}, getElementById(){ return null; } }, draftTeamName: cap => team(cap).name, teamColor: cap => team(cap).color };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(TB, "bracket.js"), "utf8") + "\n" + fs.readFileSync(path.join(TB, "challenge.js"), "utf8")
    + "\nthis.X = {brState, brTime, brKickoff, BR_GAMES, chPickState, chScore, CH_POINTS, CH_CHAMP, CH_MAX};", ctx);
  const X = ctx.X;

  // --demo: made-up results for the first few games + a dozen random brackets (preview only)
  const demo = process.argv.includes("--demo"), promo = process.argv.includes("--promo");
  let Bx = B;
  if (demo) {
    Bx = { ...B, results: {} };
    for (let k = 0; k < 5; k++) { const s0 = X.brState(Bx), x = s0.next; if (!x) break; const w = Math.random() < .5 ? x.A : x.B; Bx.results[x.g.id] = { a: x.A, b: x.B, sa: w === x.A ? 21 : 14, sb: w === x.B ? 21 : 14 }; }
    const slots = X.brState(Bx).slots, names = ["Amy Surtz", "Bob Iorio", "Chris Lake", "Dana Rossi", "Eddie Monaco", "Frank Greco", "Gina Fotiou", "Hank Marks", "Ivy Scholl", "Joe Toscano", "Kim Lester", "Lou Manna"];
    const rnd = () => { const p = {}; for (const g of X.BR_GAMES) { const x = X.chPickState(p, slots).st.out[g.id]; if (x.needed && x.A && x.B) p[g.id] = Math.random() < .5 ? x.A : x.B; } return p; };
    entries = names.map((n, i) => ({ uid: "d" + i, name: n, tiebreak: 30 + i * 3, picks: rnd() }));
    const real = {}; Object.entries(Bx.results).forEach(([g, r]) => real[g] = r.sa > r.sb ? r.a : r.b);   // one perfect-so-far bracket
    entries[0].picks = { ...entries[0].picks, ...real }; entries[0].picks = X.chPickState(entries[0].picks, slots).clean;
    for (const g of X.BR_GAMES) { const x = X.chPickState(entries[0].picks, slots).st.out[g.id]; if (x.needed && x.A && x.B && !entries[0].picks[g.id]) entries[0].picks[g.id] = x.A; }
  }
  const S = X.brState(Bx);
  const ko = X.brKickoff(Bx), koTxt = ko ? new Date(ko).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" }) + " · " + new Date(ko).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET" : "Game 1 kickoff";
  const mode = !promo && entries ? "board" : "promo";
  const done = X.BR_GAMES.filter(g => S.out[g.id].r).map(g => g.n);
  const tbTotal = S.out.g10.r ? S.out.g10.r.sa + S.out.g10.r.sb : null;
  const rows = mode === "board" ? entries.map(e => ({ e, s: X.chScore(e, S) }))
    .sort((a, b) => b.s.pts - a.s.pts || (tbTotal == null ? 0 : Math.abs(a.e.tiebreak - tbTotal) - Math.abs(b.e.tiebreak - tbTotal)) || b.s.max - a.s.max || a.e.name.localeCompare(b.e.name)) : [];
  let rank = 0, prev = null;
  const board = rows.map((r, k) => { const key = r.s.pts + "|" + (tbTotal == null ? "" : Math.abs(r.e.tiebreak - tbTotal)); if (key !== prev) { rank = k + 1; prev = key; }
    return { rank, name: short(r.e.name), pts: r.s.pts, max: r.s.max, correct: r.s.correct, perfect: r.s.perfect && r.s.decided > 0, champ: r.s.champ ? team(r.s.champ) : null }; });
  const pick = (gid, side) => { const x = S.out[gid]; const cap = side ? x.B : x.A; return cap ? team(cap) : null; };
  const g1 = X.BR_GAMES.find(g => g.n === 1), g2 = X.BR_GAMES.find(g => g.n === 2);
  const DATA = {
    mode, season: SEASON, max: X.CH_MAX, ko: koTxt, start: X.brTime(Bx, 1),
    byes: [S.out.g3.A, S.out.g4.A].filter(Boolean).map(cap => team(cap)),
    r1: [g1, g2].map(g => ({ n: g.n, time: X.brTime(Bx, g.n), a: pick(g.id, 0), b: pick(g.id, 1) })),
    total: rows.length, played: done.length, last: done.length ? Math.max(...done) : 0, champion: S.champion ? team(S.champion) : null,
    perfect: board.filter(r => r.perfect).length, board: board.slice(0, 10), more: Math.max(0, board.length - 10), tbTotal,
  };
  const status = mode === "promo" ? "promo" : S.champion ? "leaderboard-final" : done.length ? `leaderboard-after-g${DATA.last}` : "leaderboard";
  const name = (demo ? "demo-" : "") + "challenge-" + status;
  render("challenge_template.html", DATA, [name], PNG, { clear: false });
  console.log(`challenge graphic: ${path.relative(TB, path.join(PNG, name + ".png"))}  (${mode === "promo" ? "promo: picks still hidden until " + koTxt : rows.length + " brackets, " + done.length + " games played"})`);
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
