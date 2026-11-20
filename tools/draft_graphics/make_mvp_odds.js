// Turkey Bowl award odds graphics (Instagram 1080x1350 PNG): Tournament MVP and DPOY. Sportsbook odds only (no implied %).
// Every award uses the same odds ladder by rank (LADDER) + the field. Team names, colors, logos, headshots and each
// player's tier / draft pick come from the live site data (same as the draft graphics).
// Edit an award's list (best first) or the LADDER below, then:
//
//   node tools/draft_graphics/make_mvp_odds.js            (run from E:\TurkeyBowl; makes every award)
//   node tools/draft_graphics/make_mvp_odds.js dpoy       (just one)
//
// Output: tools/graphics/mvp-odds/<award>-odds.png
const path = require("path"), { load, render, TB } = require("./lib");
const PNG = path.join(TB, "tools", "graphics", "mvp-odds");

const LADDER = [400, 425, 450, 450, 550, 650, 750, 850, 950, 1050, 1150, 1250, 1350, 1450, 1550, 1650, 1800, 1900, 2000];
const FIELD = 10000;
// name as shown -> name on the site, when they differ
const ALIAS = { "Anthony Rossi": "Ant Rossi" };
// [player, team name], best odds first. cards: false = no Favorite / Top QB / Field cards, just the full list.
// odds: an award's own ladder (default LADDER). sub: the small line under the title. field: who "Other" means,
// or false = nobody else is eligible (no Field card, no Other row).
const AWARDS = {
  mvp: { short: "MVP", long: "Tournament MVP", sub: "QBs eligible", players: [
    ["Matt Giordano", "Team Consig"], ["Danny Surtz", "Team Danny"], ["Jake Veres", "Team Jake"], ["Matt Vingara", "Team Danny"],
    ["Luke Billings", "Team Luke"], ["Mikey Vitella", "Team Baj"], ["Louis Ragusa", "Team Jake"], ["Vin Iorio", "Team Shay"],
    ["Sammy Mazzella", "Team Consig"], ["Dylan Scholl", "Team Baj"], ["Devon Jacobsen", "Team Jake"], ["Shay McGowan", "Team Shay"],
    ["Mike Surtz", "Team Luke"], ["Joe Consiglio", "Team Consig"], ["Matt Lake", "Team Danny"], ["Matt Hegel", "Team Baj"],
    ["Joe Toscano", "Team Shay"], ["Jack Billings", "Team Luke"], ["Brent Grocott", "Team Consig"]] },
  dpoy: { short: "DPOY", long: "Tournament DPOY", sub: "QBs eligible", cards: false, players: [
    ["Devon Jacobsen", "Team Jake"], ["Matt Giordano", "Team Consig"], ["Danny Surtz", "Team Danny"], ["Jake Veres", "Team Jake"],
    ["Vin Iorio", "Team Shay"], ["Luke Billings", "Team Luke"], ["Sammy Mazzella", "Team Consig"], ["Mikey Vitella", "Team Baj"],
    ["Matt Vingara", "Team Danny"], ["Louis Ragusa", "Team Jake"], ["Matt Lake", "Team Danny"], ["Brent Grocott", "Team Consig"],
    ["Mike Surtz", "Team Luke"], ["George Fotiou", "Team Danny"], ["Shay McGowan", "Team Shay"], ["Jeremy Christiansen", "Team Baj"],
    ["Anthony Rossi", "Team Jake"], ["Joe Toscano", "Team Shay"], ["Billy Seymour", "Team Jake"]] },
  // rookies: a smaller field, so shorter odds than MVP/DPOY. Order follows draft position.
  roty: { short: "ROTY", long: "Rookie of the Year", sub: "First-year players", field: false,   // these 13 are every rookie
    odds: [150, 300, 500, 700, 800, 1000, 1200, 1500, 1800, 2000, 2500, 3000, 4000], players: [
    ["Matt Giordano", "Team Consig"], ["Matt Vingara", "Team Danny"], ["Luke Billings", "Team Luke"], ["Shay McGowan", "Team Shay"],
    ["Mike Surtz", "Team Luke"], ["Brenden Bechamps", "Team Danny"], ["Darren Henderson", "Team Luke"], ["Matt Heverin", "Team Luke"],
    ["Roman Tentilucci", "Team Shay"], ["Mike Stamboulian", "Team Luke"], ["Austin Schwartz", "Team Consig"], ["Nick Strobino", "Team Shay"],
    ["Dylan Shah", "Team Shay"]] },
};

(async () => {
  const only = process.argv[2] ? process.argv[2].toLowerCase() : null;
  if (only && !AWARDS[only]) throw new Error(`Unknown award "${only}". Pick one of: ${Object.keys(AWARDS).join(", ")}`);
  const D = await load(), { L, team, img, SEASON, picks, label, byName } = D;
  const teams = L.order.map(cap => team(cap));
  const byTeam = nm => teams.find(t => t.name.toLowerCase() === nm.toLowerCase()) || { name: nm, color: "#6c7689", logo: "", img: "", cap: nm };
  const role = site => { if (L.order.includes(site)) return "QB · Captain"; const i = picks.indexOf(site), p = byName[site];
    return [p && p.tier !== "NA" ? p.tier + " Tier" : null, i >= 0 ? label(i) : null].filter(Boolean).join(" · "); };

  for (const [key, A] of Object.entries(AWARDS)) {
    if (only && key !== only) continue;
    const odds = A.odds || LADDER;
    if (A.players.length > odds.length) throw new Error(`${A.short}: ${A.players.length} players but only ${odds.length} odds`);
    const warn = [];
    const rows = A.players.map(([name, tm], k) => {
      const site = ALIAS[name] || name, t = byTeam(tm);
      if (!teams.includes(t)) warn.push("team " + tm);
      if (!byName[site] && !L.order.includes(site)) warn.push("player " + name);
      const parts = name.split(" ");
      return { rank: k + 1, name, first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1], role: role(site), odds: "+" + odds[k], img: img(site), team: t };
    });
    if (warn.length) console.warn(`${A.short}: not found on the site (shown grey / no photo): ${warn.join(", ")}`);
    // the 3 callouts from the odds sheet: Tournament Favorite, Top QB Contender, Field Selection
    const fav = A.cards === false ? null : rows[0], qb = A.cards === false ? null : rows.find(r => r.role.startsWith("QB"));
    const cats = !fav ? [] : [{ cat: "Tournament Favorite", ...fav, fav: true }, { cat: "Top QB Contender", ...qb },
      { cat: "Field Selection", field: true, name: "The Field", first: "Any other player", last: "The Field", odds: "+" + FIELD, team: { name: A.field ? "" : "Remaining flex / depth", color: "#6c7689" }, role: "" }];
    if (A.field) cats[2].first = A.field;
    if (A.field === false) cats.pop();
    const other = { rank: rows.length + 1, other: true, name: "Other", odds: "+" + FIELD, img: "", team: { name: "The Field", color: "#6c7689" }, role: A.field || "Any other player" };
    const DATA = { season: SEASON, short: A.short, long: A.long, sub: A.sub, cats, rest: [...rows.filter(r => r !== fav && r !== qb), ...(A.field === false ? [] : [other])], total: rows.length };
    render("mvp_odds_template.html", DATA, [key + "-odds"], PNG, { clear: false });
    console.log(`${A.short} odds graphic: ` + path.relative(TB, path.join(PNG, key + "-odds.png")));
  }
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
