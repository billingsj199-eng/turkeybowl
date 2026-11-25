// Turkey Bowl LATE ADDS graphic (Instagram 1080x1350 PNG): every player an editor put on a team after the draft
// (draft/<season>.late {player: captain}, set in the Late adds box on Live Draft), with the team he joins and its roster.
//
//   node tools/draft_graphics/make_late.js        (run from E:\TurkeyBowl)
//
// Output: tools/graphics/late/late-adds.png  (1 to 3 players fit; re-run after more late adds)
const path = require("path"), { load, render, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "late");

(async () => {
  const D = await load(), { L, SEASON, byName, prof, slug, img, team, holder, picks, honors, moveTxt, ht } = D;
  const late = Object.entries(L.late || {}).filter(([n, c]) => c && !picks.includes(n) && L.order.includes(c));
  if (!late.length) throw new Error("No late adds yet. Add them in the Late adds box on the Live Draft page.");
  const rosterOf = cap => [...picks.filter((_, i) => holder(i) === cap), ...late.filter(([, c]) => c === cap).map(([n]) => n)];
  const players = late.map(([name, cap]) => {
    const p = byName[name] || { name, first: name.split(" ")[0], last: name.split(" ").slice(1).join(" "), tier: "NA", prev: "NA" }, cp = prof[slug(name)] || {};
    return {
      name, first: p.first, last: p.last, nick: cp.nickname || "", tier: p.tier, rank: p.rank || null, move: moveTxt(p),
      img: img(name), college: cp.college || null, comp: cp.comp || null, honors: honors(name),
      bio: [cp.num ? "#" + cp.num : null, cp.age ? "Age " + cp.age : null, ht(cp.ht), cp.wt ? cp.wt + " lbs" : null].filter(Boolean),
      team: team(cap), roster: rosterOf(cap).length + 1,   // + the captain
    };
  });
  render("late_template.html", { season: SEASON, players }, ["late-adds"], PNG, { clear: false });
  console.log(`late adds graphic: ${path.relative(TB, path.join(PNG, "late-adds.png"))}  (${players.map(p => p.name + " -> " + p.team.name).join(", ")})`);
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
