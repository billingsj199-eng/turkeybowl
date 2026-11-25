// 📜 Rules page (nav #rules). RULES is the one copy of the rulebook: the page AND the rules graphic
// (tools/draft_graphics/make_rules.js) both read it, so edit the rules here only.
const RULES_SEASON = 2026;
const RULES = [
  { group: "Format", icon: "🏆", items: [
    { t: "6 teams, double elimination", d: "Lose twice and you're out." },
    { t: "Two halves, 3 possessions each", d: "Each team gets 3 possessions per half. Tied at the end = OT, college style." },
    { t: "Two-zone field", d: "Get a first down at midfield, then you have to score." },
  ]},
  { group: "Players", icon: "👥", items: [
    { t: "5 on 5", d: "5 players on the field at once for both teams." },
    { t: "Flag football", d: "Flags are provided, no need to bring your own." },
    { t: "QBs can play receiver", d: "Captains/QBs can switch to receiver at any point if they want." },
  ]},
  { group: "Defense", icon: "🛡️", items: [
    { t: "1 blitz per drive", d: "If you blitz, the QB can run." },
    { t: "Press coverage allowed", d: "At the line of scrimmage." },
  ]},
  { group: "Offense", icon: "🏈", items: [
    { t: "Snap to the QB", d: "Doesn't need to go through the legs, just tossed or handed to them." },
    { t: "7-second play clock", d: "7 Mississippi for the QB, then the play is dead." },
    { t: "Laterals are legal", d: "If the ball is dropped, the play is dead there." },
    { t: "One man in motion", d: "Motion before the snap is allowed, but only one player can be moving when the ball is snapped. More than one = penalty." },
  ]},
  { group: "Penalties & more", icon: "🚩", items: [
    { t: "No safeties", d: "Flag pulled in your own end zone = ball at the 1‑yard line." },
    { t: "No flag guarding", d: "First time it's called = team warning. Keep doing it = penalty." },
  ]},
];

function renderRules(){
  const root = document.getElementById("pg-rules"); if (!root || root.hidden) return;
  const e = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let n = 0;
  root.innerHTML = `<header><h1>Turkey Bowl <span>${RULES_SEASON}</span> Rulebook</h1></header>
    <div class="rl-grid">${RULES.map(g => `<section class="rl-g"><h2><span>${g.icon}</span>${e(g.group)}</h2>
      <ol>${g.items.map(r => `<li><b class="rl-n">${++n}</b><div><b>${e(r.t)}</b><p>${e(r.d)}</p></div></li>`).join("")}</ol></section>`).join("")}</div>`;
}
renderRules();   // page opened straight on #rules (route() ran before this file loaded)
