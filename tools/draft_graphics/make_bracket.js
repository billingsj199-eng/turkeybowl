// Turkey Bowl bracket graphic (Instagram 1080x1350 PNG): the full double-elimination bracket, filled in with the live results.
// Uses the site's own bracket drawing (bracket.js brSvg + bracket.css), so it always matches the Bracket page.
//
//   node tools/draft_graphics/make_bracket.js        (run from E:\TurkeyBowl; run again after any game for an update)
//
// Output: tools/graphics/bracket/bracket-start.png, bracket-after-g<N>.png (last game with a score), or bracket-final.png
const fs = require("fs"), path = require("path"), vm = require("vm"), { load, render, get, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "bracket");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

(async () => {
  const D = await load(), { L, team, SEASON } = D;
  const bdoc = await get(`bracket/${SEASON}`);
  const c = v => v.stringValue ?? (v.integerValue != null ? +v.integerValue : undefined) ?? v.booleanValue ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, c(x)])) : v.arrayValue ? (v.arrayValue.values || []).map(c) : v.nullValue === null ? null : v.timestampValue);
  const B = bdoc.fields ? Object.fromEntries(Object.entries(bdoc.fields).map(([k, v]) => [k, c(v)])) : null;

  // run the site's bracket.js with the site's team names + colors
  const tbc = { live: { order: L.order } };
  const ctx = { window: { TBC: tbc }, TBC: tbc, CURRENT_SEASON: SEASON, captains: L.order, esc2: esc, console, location: { hash: "" },
    document: { addEventListener(){}, getElementById(){ return null; } }, draftTeamName: cap => team(cap).name, teamColor: cap => team(cap).color };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(TB, "bracket.js"), "utf8") + "\nthis.X = {brState, brTime, brSvg, BR_GAMES};", ctx);
  const { brState, brTime, brSvg, BR_GAMES } = ctx.X;
  // --demo [N]: preview only. Fill in made-up results for the first N games (all of them if no N) and save as demo-*.png.
  const di = process.argv.indexOf("--demo"), demo = di > 0;
  if (demo) { const upto = +process.argv[di + 1] || 99; B.results = {}; for (let k = 0; k < upto; k++) { const s0 = brState(B); if (s0.champion || !s0.next) break; const x = s0.next, aw = Math.random() < .5; B.results[x.g.id] = { a: x.A, b: x.B, sa: aw ? 21 : 14, sb: aw ? 14 : 21 }; } }
  const S = brState(B);
  const done = BR_GAMES.filter(g => S.out[g.id].r).map(g => g.n);
  const svgCss = fs.readFileSync(path.join(TB, "bracket.css"), "utf8").split("\n").filter(l => l.startsWith(".br-svg")).join("\n");

  const W = c => Object.values(S.out).filter(x => x.winner === c).length, Lc = c => S.losses[c] || 0;
  const DATA = {
    season: SEASON, svg: brSvg(S, B), css: svgCss, start: brTime(B, 1), minutes: (B && B.minutes) || 30, drawn: S.drawn.length === 6,
    played: done.length, last: done.length ? Math.max(...done) : 0,
    next: S.next ? { n: S.next.g.n, round: S.next.g.round, time: brTime(B, S.next.g.n), a: S.next.A ? team(S.next.A) : null, b: S.next.B ? team(S.next.B) : null } : null,
    champion: S.champion ? { ...team(S.champion), losses: Lc(S.champion) } : null,
    times: BR_GAMES.map(g => ({ n: g.n, time: brTime(B, g.n), done: !!S.out[g.id].r, skip: !S.out[g.id].needed, round: g.round })),
    teams: (S.slots.length ? S.slots : L.order).map(cap => ({ ...team(cap), w: W(cap), l: Lc(cap), out: Lc(cap) >= 2, champ: S.champion === cap }))
      .sort((a, b) => (b.champ - a.champ) || (a.out - b.out) || (a.l - b.l) || (b.w - a.w)),
  };
  const name = (demo ? "demo-" : "") + (S.champion ? "bracket-final" : done.length ? `bracket-after-g${DATA.last}` : "bracket-start");
  render("bracket_template.html", DATA, [name], PNG, { clear: false });   // keep earlier versions (after G3, after G5, ...)
  console.log(`bracket graphic: ${path.relative(TB, path.join(PNG, name + ".png"))}  (${done.length} game${done.length === 1 ? "" : "s"} played${S.champion ? ", champion: " + team(S.champion).name : ""})`);
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
