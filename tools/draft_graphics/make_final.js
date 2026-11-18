// Turkey Bowl draft graphics, after the draft: one Instagram carousel (1080x1350 PNGs).
//   slide 1   = the full draft board (every pick, tier color + grade)
//   slides 2+ = one recap per team, ranked by team draft grade (average of its picks' scores, same scale as pick grades)
//
//   node tools/draft_graphics/make_final.js          (run from E:\TurkeyBowl; works mid-draft too, unpicked slots stay empty)
//
// Output: tools/graphics/final/01-draft-board.png, 02-team-1-<team>.png ...  (+ out/preview.html)
const path = require("path"), { load, render, grade, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "final");
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  const D = await load();
  const { L, n, rounds, picks, pickData, snake, team, SEASON, TI } = D;
  const all = picks.map((_, i) => pickData(i));
  const lite = p => ({ i: p.i, label: p.label, overall: p.overall, round: p.round, name: p.name, first: p.first, last: p.last, tier: p.tier, rank: p.rank,
    grade: p.grade, score: p.score, value: p.value, img: p.img, college: p.college, verdict: p.verdict, holder: p.holder, drafter: p.team.cap });

  // board: column = the draft slot (snake), so each team's column reads top to bottom like the site
  const cells = all.map(p => ({ ...lite(p), col: L.order.indexOf(snake(p.i)), row: Math.floor(p.i / n) }));

  const teams = L.order.map((cap, slot) => {
    const mine = all.filter(p => p.holder === cap);
    const avg = mine.length ? mine.reduce((a, p) => a + p.score, 0) / mine.length : 0;
    const tiers = {}; mine.forEach(p => tiers[p.tier] = (tiers[p.tier] || 0) + 1);
    const ranked = mine.filter(p => p.rank);
    const best = mine.reduce((a, b) => !a || b.score > a.score ? b : a, null), worst = mine.reduce((a, b) => !a || b.score < a.score ? b : a, null);
    return { ...team(cap), slot: slot + 1, picks: mine.map(lite), score: avg, grade: mine.length ? grade(avg) : "—",
      tiers: ["S", "A", "B", "C", "D"].filter(t => tiers[t]).map(t => [t, tiers[t]]),
      avgRank: ranked.length ? ranked.reduce((a, p) => a + p.rank, 0) / ranked.length : null,
      valueSum: mine.reduce((a, p) => a + p.value, 0),
      best: best && lite(best), worst: worst && worst.score < -0.5 && worst !== best ? lite(worst) : null };
  });
  const byGrade = [...teams].sort((a, b) => b.score - a.score);
  byGrade.forEach((t, k) => t.gradeRank = k + 1);

  const made = all.filter(p => !p.sample);
  const steal = made.reduce((a, b) => !a || b.score > a.score ? b : a, null), reach = made.reduce((a, b) => !a || b.score < a.score ? b : a, null);
  const DATA = { season: SEASON, rounds, n, total: L.pool.length, made: L.picks.length, done: L.status === "done",
    order: teams.map(t => ({ cap: t.cap, name: t.name, color: t.color, logo: t.logo, img: t.img })), cells,
    teams: byGrade, steal: steal && { ...lite(steal), team: team(steal.team.cap).name }, reach: reach && reach.score < -0.5 ? { ...lite(reach), team: team(reach.team.cap).name } : null,
    bestTeam: byGrade[0] && { name: byGrade[0].name, grade: byGrade[0].grade } };

  const names = ["01-draft-board", ...byGrade.map((t, k) => `${String(k + 2).padStart(2, "0")}-team-${k + 1}-${slugify(t.name).replace(/^team-/, "")}`)];
  render("final_template.html", DATA, names, PNG);
  console.log(`final: ${names.length} images in ${path.relative(TB, PNG)}${DATA.done ? "" : `  (draft not finished: ${DATA.made}/${DATA.total} picks)`}`);
  byGrade.forEach(t => console.log(`  #${t.gradeRank} ${t.name}: ${t.grade} (avg ${t.score.toFixed(2)}, ${t.picks.length} picks, value ${t.valueSum >= 0 ? "+" : ""}${t.valueSum})`));
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
