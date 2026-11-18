// Turkey Bowl schedule lottery graphic (Instagram 1080x1350 PNG): byes, the two first-round games, and the full schedule.
// Reads the live bracket (bracket/<season>) and uses the site's own bracket code (bracket.js) for games, times and byes.
//
//   node tools/draft_graphics/make_lottery.js        (run from E:\TurkeyBowl)
//
// Output: tools/graphics/lottery/schedule-lottery.png  (…-preview.png until all picks are drawn: undrawn spots show "?")
const fs = require("fs"), path = require("path"), vm = require("vm"), { load, render, get, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "lottery");

(async () => {
  const D = await load(), { L, team, SEASON } = D;
  const bdoc = await get(`bracket/${SEASON}`);
  const c = v => v.stringValue ?? (v.integerValue != null ? +v.integerValue : undefined) ?? v.booleanValue ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, c(x)])) : v.arrayValue ? (v.arrayValue.values || []).map(c) : v.nullValue === null ? null : v.timestampValue);
  const B = bdoc.fields ? Object.fromEntries(Object.entries(bdoc.fields).map(([k, v]) => [k, c(v)])) : null;

  // run the site's bracket.js so the graphic always matches the Bracket page
  const tbc = { live: { order: L.order } };
  const ctx = { window: { TBC: tbc }, TBC: tbc, CURRENT_SEASON: SEASON, captains: L.order, esc2: s => s, document: { addEventListener(){} }, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(TB, "bracket.js"), "utf8") + "\nthis.X = {brState, brTime, BR_GAMES, brSrc, brFixed};", ctx);
  const { brState, brTime, BR_GAMES, brSrc } = ctx.X;
  const S = brState(B);
  const side = (cap, src) => cap ? { ...team(cap) } : { tbd: brSrc(src) };
  const DATA = {
    season: SEASON, start: brTime(B, 1), minutes: (B && B.minutes) || 30, complete: S.drawn.length === 6, fixedN: S.fixedN,
    // each bye team's first game comes from bracket.js (bye 2 = Danny plays G3 on top, bye 1 = Luke plays G4); listed in game order
    byes: [0, 1].map(i => { const g = BR_GAMES.find(x => x.a.slot === i || x.b.slot === i); return S.drawn[i] ? { ...team(S.drawn[i]), game: g.n, time: brTime(B, g.n) } : { game: g.n }; })
      .sort((p, q) => p.game - q.game).map(b => b.cap ? b : null),
    r1: [[2, 3, 1], [4, 5, 2]].map(([a, b, n]) => ({ n, time: brTime(B, n), a: S.drawn[a] ? team(S.drawn[a]) : null, b: S.drawn[b] ? team(S.drawn[b]) : null, next: n === 1 ? 3 : 4 })),   // G1 winner plays G3 (Danny), G2 winner G4 (Luke)
    games: BR_GAMES.map(g => { const x = S.out[g.id]; return { n: g.n, round: g.round, side: g.side, ifNeeded: !!g.ifNeeded, time: brTime(B, g.n), a: side(x.A, g.a), b: side(x.B, g.b) }; }),
  };
  const name = DATA.complete ? "schedule-lottery" : "schedule-lottery-preview";
  render("lottery_template.html", DATA, [name], PNG);
  console.log(`lottery graphic: ${path.relative(TB, path.join(PNG, name + ".png"))}${DATA.complete ? "" : `  (draw not finished: ${S.drawn.length}/6 spots known, the rest show "?")`}`);
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
