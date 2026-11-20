// Turkey Bowl Tournament MVP odds graphic (Instagram 1080x1350 PNG). Sportsbook odds only (no implied %).
// Team names, colors, logos and headshots come from the live site data (same as the draft graphics).
// Edit ODDS below when the line moves, then:
//
//   node tools/draft_graphics/make_mvp_odds.js        (run from E:\TurkeyBowl)
//
// Output: tools/graphics/mvp-odds/mvp-odds.png
const path = require("path"), { load, render, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "mvp-odds");

// [player, team name, role / draft info, odds]
const ODDS = [
  ["Matt Giordano", "Team Consig", "S Tier · 1.01", 400],
  ["Danny Surtz", "Team Danny", "QB · Captain", 425],
  ["Jake Veres", "Team Jake", "QB · Captain", 450],
  ["Matt Vingara", "Team Danny", "S Tier · 1.04", 450],
  ["Luke Billings", "Team Luke", "QB · Captain", 550],
  ["Mikey Vitella", "Team Baj", "A Tier · 1.06", 650],
  ["Louis Ragusa", "Team Jake", "S Tier · 1.03", 750],
  ["Vin Iorio", "Team Shay", "S Tier · 1.02", 850],
  ["Sammy Mazzella", "Team Consig", "A Tier · 2.06", 950],
  ["Dylan Scholl", "Team Baj", "A Tier · 2.01", 1050],
  ["Devon Jacobsen", "Team Jake", "A Tier · 2.04", 1150],
  ["Shay McGowan", "Team Shay", "QB · Captain", 1250],
  ["Mike Surtz", "Team Luke", "A Tier · 2.02", 1350],
  ["Joe Consiglio", "Team Consig", "QB · Captain", 1450],
  ["Matt Lake", "Team Danny", "A Tier · 2.03", 1550],
  ["Matt Hegel", "Team Baj", "QB · Captain", 1650],
  ["Joe Toscano", "Team Shay", "B Tier · 2.05", 1800],
  ["Jack Billings", "Team Luke", "A Tier · 1.05", 1900],
  ["Brent Grocott", "Team Consig", "A Tier · 3.01", 2000],
];
const FIELD = 10000;

(async () => {
  const D = await load(), { L, team, img, SEASON } = D;
  const teams = L.order.map(cap => team(cap));
  const byTeam = nm => teams.find(t => t.name.toLowerCase() === nm.toLowerCase()) || { name: nm, color: "#6c7689", logo: "", img: "", cap: nm };
  const missing = new Set();
  const rows = ODDS.map(([name, tm, role, odds], k) => {
    const t = byTeam(tm); if (!teams.includes(t)) missing.add(tm);
    const parts = name.split(" ");
    return { rank: k + 1, name, first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1], role, odds: "+" + odds, img: img(name), team: t };
  });
  if (missing.size) console.warn("Not found in the live teams (shown grey):", [...missing].join(", "));
  // the 3 callouts from the odds sheet: Tournament Favorite, Top QB Contender, Field Selection
  const fav = rows[0], qb = rows.find(r => /^QB/.test(r.role));
  const cats = [{ cat: "Tournament Favorite", ...fav, fav: true }, { cat: "Top QB Contender", ...qb },
    { cat: "Field Selection", field: true, name: "The Field", first: "Any other player", last: "The Field", odds: "+" + FIELD, team: { name: "Remaining flex / depth", color: "#6c7689" }, role: "" }];
  const other = { rank: rows.length + 1, other: true, name: "Other", odds: "+" + FIELD, img: "", team: { name: "The Field", color: "#6c7689" }, role: "Any other player" };
  const DATA = { season: SEASON, cats, rest: [...rows.filter(r => r !== fav && r !== qb), other], total: rows.length };
  render("mvp_odds_template.html", DATA, ["mvp-odds"], PNG, { clear: false });
  console.log("MVP odds graphic: " + path.relative(TB, path.join(PNG, "mvp-odds.png")));
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
