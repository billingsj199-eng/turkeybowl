// Turkey Bowl draft graphics: one Instagram carousel per round (1080x1350 PNGs).
//   slide 1 = round recap (every pick), slides 2+ = one "The pick is in" breakdown card per pick.
// Reads the LIVE draft + board (see lib.js, which also explains the grades).
//
//   node tools/draft_graphics/make_round.js <round>        (run from E:\TurkeyBowl, needs Node 18+ and Chrome or Edge)
//   node tools/draft_graphics/make_round.js 6-7            several rounds in one set (one recap with every pick, then each pick)
//
// Output: tools/graphics/round-<n>/01-round-<n>-recap.png, 02-pick-<n>.01.png ...  (rounds-6-7/ for a range; + out/preview.html)
// Picks not made yet are filled with the best available and tagged SAMPLE (file names end in -sample).
// After the draft: make_final.js (full draft board + a recap for every team).
const path = require("path"), { load, render, TB } = require("./lib");
const [ROUND, ROUND_END] = (m => m ? [+m[1], +(m[2] || m[1])] : [0, 0])(String(process.argv[2] || "").match(/^(\d+)(?:-(\d+))?$/));
if (!ROUND || ROUND_END < ROUND) { console.error("usage: node tools/draft_graphics/make_round.js <round>   or   <first>-<last>  (e.g. 6-7)"); process.exit(1); }
const TAG = ROUND_END > ROUND ? `rounds-${ROUND}-${ROUND_END}` : `round-${ROUND}`;
const PNG = path.join(TB, "tools", "graphics", TAG);

(async () => {
  const peek = await load();   // to learn the size of the draft
  const n = peek.n, rounds = peek.rounds;
  if (ROUND_END > rounds) throw new Error(`There are only ${rounds} rounds.`);
  const first = (ROUND - 1) * n, last = Math.min(ROUND_END * n, peek.L.pool.length) - 1;
  const D = last >= peek.L.picks.length ? await load(last) : peek;
  const { pickData, label, owner, teamName, teamColor, L, SEASON } = D;

  const round = []; for (let i = first; i <= last; i++) round.push(pickData(i));
  const steal = round.reduce((a, b) => b.score > a.score ? b : a), reach = round.reduce((a, b) => b.score < a.score ? b : a);
  const nextRound = last + 1 < L.pool.length ? { label: label(last + 1), team: teamName(owner(last + 1)), color: teamColor(owner(last + 1)) } : null;
  const DATA = { season: SEASON, round: ROUND, roundEnd: ROUND_END, rounds, picks: round, steal: steal.name, reach: reach.score < -0.5 ? reach.name : null, nextRound };

  const names = [`01-${TAG}-recap`, ...round.map((p, k) => `${String(k + 2).padStart(2, "0")}-pick-${p.label}${p.sample ? "-sample" : ""}`)];
  render("template.html", DATA, names, PNG);
  console.log(`${TAG}: ${names.length} images in ${path.relative(TB, PNG)}`);
  round.forEach(p => console.log(`  ${p.label} ${p.team.name}: ${p.name}  ${p.grade}${p.sample ? "  (SAMPLE: not picked yet)" : ""}`));
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
