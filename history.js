// ===================== HISTORY =====================
// Records, standings and team records are calculated from the Film Room data (FD).
// Champions / MVPs are entered by hand and stored in FD.history, so "Export data"
// in the Film Room saves them too. Nothing here is ever deleted between seasons.

const HS = {sec: "champs", tab: "career", season: "all", side: "all"};

// Stat categories shown as leaderboards (every counting stat; no percentages)
const GROUPS = [["all","All stats"],["wl","Win / loss"],["fan","Fantasy"],["pass","Passing"],["rec","Receiving"],["rush","Rushing"],["def","Defense"]];
const CATS = [
  {k: "w",     label: "Wins (player W-L)",       side: "wl", noGame: true},
  {k: "fpts",  label: "Total FPTS",              side: "fan", fmt: 1},
  {k: "ofpts", label: "Offensive FPTS",          side: "fan", fmt: 1},
  {k: "dfpts", label: "Defensive FPTS",          side: "fan", fmt: 1},
  {k: "pyds",  label: "Passing yards",           side: "pass"},
  {k: "ptd",   label: "Passing TDs",             side: "pass"},
  {k: "cmp",   label: "Completions",             side: "pass"},
  {k: "att",   label: "Pass attempts",           side: "pass"},
  {k: "ints",  label: "Interceptions thrown",    side: "pass"},
  {k: "rec",   label: "Receptions",              side: "rec"},
  {k: "recyds",label: "Receiving yards",         side: "rec"},
  {k: "rectd", label: "Receiving TDs",           side: "rec"},
  {k: "tgt",   label: "Targets",                 side: "rec"},
  {k: "ryds",  label: "Rushing yards",           side: "rush"},
  {k: "rtd",   label: "Rushing TDs",             side: "rush"},
  {k: "rush",  label: "Carries",                 side: "rush"},
  {k: "td",    label: "Total TDs (rec + rush)",  side: "rec"},
  {k: "int",   label: "Interceptions",           side: "def"},
  {k: "pd",    label: "Pass deflections",        side: "def"},
  {k: "tkl",   label: "Flag pulls",              side: "def"},
  {k: "tgta",  label: "Targets allowed",         side: "def"},
  {k: "reca",  label: "Receptions allowed",      side: "def"},
  {k: "tda",   label: "TDs allowed",             side: "def"},
];

// Awards are listed in order of importance; any other award goes after these.
const AWARD_ORDER = [/^mvp|most valuable/i, /def.*player|dpoy/i, /rookie|roty/i, /improved|mip/i];
const awardRank = name => { const i = AWARD_ORDER.findIndex(re => re.test(name || "")); return i < 0 ? 99 : i; };
function histHistory(){ FD.history = FD.history || {champions: []}; FD.history.champions = FD.history.champions || []; FD.history.awards = FD.history.awards || []; return FD.history; }

// One row per player per game, with every stat we rank
function playerGameRows(){
  const rows = [];
  players.forEach(p => {
    (typeof filmGamesFor === "function" ? filmGamesFor(p.name) : []).forEach(g => {
      const o = g.off || {}, d = g.def || {};
      const game = gameById(g.gameId) || {};
      const ofpts = SCORING.off(o), dfpts = SCORING.def(d);
      // player's W-L: their team's result in this game (FINAL games only)
      let w = 0, l = 0;
      const win = winnerOf(game);
      if (win && win !== "TIE" && g.opp && g.opp !== "—") { const mine = otherTeam(game, g.opp); if (win === mine) w = 1; else l = 1; }
      rows.push({name: p.name, season: g.season, gameId: g.gameId, opp: g.opp, sample: !!game.sample, w, l,
        fpts: ofpts + dfpts, ofpts, dfpts,
        att: o.att||0, cmp: o.cmp||0, pyds: o.pyds||0, ptd: o.ptd||0, ints: o.ints||0,
        tgt: o.tgt||0, rec: o.rec||0, recyds: (o.yds||0) - (o.ryds||0), rectd: (o.td||0) - (o.rtd||0), td: o.td||0,
        rush: o.rush||0, ryds: o.ryds||0, rtd: o.rtd||0,
        tkl: d.tkl||0, pd: d.pd||0, int: d.int||0, tgta: d.tgta||0, reca: d.reca||0, tda: d.tda||0});
    });
  });
  // Games with a saved roster but no logged plays for a player (e.g. 2025): count W-L only.
  const have = new Set(rows.map(r => r.name + "|" + r.gameId));
  FD.games.forEach(game => {
    const win = winnerOf(game); if (!win || win === "TIE") return;
    const R = (FD.rosters || {})[game.season] || {};
    [game.home, game.away].forEach(ab => (R[ab] || []).forEach(name => {
      if (have.has(name + "|" + game.id)) return;
      const z = {name, season: game.season, gameId: game.id, opp: otherTeam(game, ab), sample: !!game.sample, w: win === ab ? 1 : 0, l: win === ab ? 0 : 1, noStats: true};
      CATS.forEach(c => { if (!(c.k in z)) z[c.k] = 0; });
      rows.push(z);
    }));
  });
  return rows;
}
function aggregate(rows, keyFn){
  const m = new Map();
  rows.forEach(r => {
    const key = keyFn(r);
    if (!m.has(key)) { const z = {name: r.name, season: r.season, games: 0, sample: false, l: 0}; CATS.forEach(c => z[c.k] = 0); m.set(key, z); }
    const a = m.get(key); a.games++; a.sample = a.sample || r.sample;
    CATS.forEach(c => a[c.k] += r[c.k]); a.l += r.l;
  });
  return [...m.values()];
}
function teamName(season, ab){ return team(season, ab).name; }

function standings(season){
  const t = {};
  FD.games.filter(g => g.season === season).forEach(g => {
    const win = winnerOf(g); if (!win) return;
    const sc = hasScore(g), hs = sc ? +g.score[g.home] : 0, as = sc ? +g.score[g.away] : 0;
    [[g.home, hs, as], [g.away, as, hs]].forEach(([ab, pf, pa]) => {
      t[ab] = t[ab] || {ab, w:0, l:0, tie:0, pf:0, pa:0, scored:false, sample:false};
      const x = t[ab]; x.pf += pf; x.pa += pa; x.scored = x.scored || sc; x.sample = x.sample || !!g.sample;
      if (win === "TIE") x.tie++; else if (win === ab) x.w++; else x.l++;
    });
  });
  return Object.values(t).sort((a,b) => (b.w - b.l) - (a.w - a.l) || (b.pf - b.pa) - (a.pf - a.pa));
}

function renderHistory(){
  const root = document.getElementById("pg-history");
  const H = histHistory();
  const yrs = [...new Set([...seasons(), ...H.champions.map(c => +c.season)])].filter(Boolean).sort((a,b) => b - a);
  const rows = playerGameRows();
  const champs = H.champions.slice().sort((a,b) => b.season - a.season);

  // pick data set for the leaderboard tab
  const inSeason = r => HS.season === "all" || r.season === +HS.season;
  let data, unit;
  if (HS.tab === "game") { data = rows.filter(inSeason); unit = "game"; }
  else if (HS.tab === "season") { data = aggregate(rows.filter(inSeason), r => r.name + "|" + r.season); unit = "season"; }
  else { data = aggregate(rows, r => r.name).map(a => ({...a, season: null})); unit = "career"; }

  const cats = CATS.filter(c => (HS.side === "all" || c.side === HS.side) && !(c.noGame && unit === "game"));
  const anySample = rows.some(r => r.sample);

  root.innerHTML = `<div class="fr-wrap">
    <div class="fr-top">
      <h1><span class="gold">Turkey Bowl</span> History</h1>
    </div>
    <div class="htabs" id="hSec">${[["champs","🏆 Past champions"],["awards","🎖️ Awards"],["players","📈 Player records"],["teams","🏈 Team records"]].map(([v,l]) => `<button data-v="${v}" class="${HS.sec===v?"on":""}">${l}</button>`).join("")}</div>
    ${anySample && (HS.sec === "players" || HS.sec === "teams") ? `<div class="banner">🧪 <span>Some records here come from <b>SAMPLE</b> games (Jack's made-up demo). They disappear once the sample games are deleted in the Film Room.</span></div>` : ""}

    <section ${HS.sec !== "champs" ? "hidden" : ""}>
    <div class="sec-h"><h2 class="round-h">Past champions</h2><button class="obtn sm" id="addChamp">+ Add champion</button></div>
    <div class="champs" id="champs"></div>
    </section>

    <section ${HS.sec !== "awards" ? "hidden" : ""}>
    <div class="sec-h"><h2 class="round-h">Awards</h2><button class="obtn sm" id="addAward">+ Add award</button></div>
    <div id="awards"></div>
    </section>

    <section ${HS.sec !== "players" ? "hidden" : ""}>
    <h2 class="round-h">Player records</h2>
    <div class="fr-filters" style="margin-top:0">
      <div class="fld"><label>View</label><div class="seg" id="hTab"><button data-v="career">All-time (cumulative)</button><button data-v="season">Single season</button><button data-v="game">Individual games</button></div></div>
      ${HS.tab !== "career" ? `<div class="fld"><label>Year</label><select id="hSeason"><option value="all">All years</option>${yrs.map(y => `<option value="${y}" ${String(y) === String(HS.season) ? "selected" : ""}>${y}</option>`).join("")}</select></div>` : ""}
      <div class="fld"><label>Category</label><select id="hSide">${GROUPS.map(([v,l]) => `<option value="${v}" ${v===HS.side?"selected":""}>${l}</option>`).join("")}</select></div>
    </div>
    <div class="lb-grid" id="lb"></div>
    </section>

    <section ${HS.sec !== "teams" ? "hidden" : ""}>
    <h2 class="round-h">Win/loss records by year</h2>
    <div class="lb-grid" id="stand"></div>
    <h2 class="round-h">Team records</h2>
    <div class="lb-grid" id="trec"></div>
    </section>
  </div>`;
  root.querySelectorAll("#hSec button").forEach(b => b.onclick = () => { HS.sec = b.dataset.v; renderHistory(); });

  // --- champions ---
  const ch = root.querySelector("#champs");
  if (!champs.length) ch.innerHTML = `<div class="empty-film" style="margin-top:0">No champions added yet. After each Turkey Bowl, click <b>+ Add champion</b> (add past years too — 2025, 2024…).</div>`;
  champs.forEach((c, i) => {
    const d = document.createElement("div"); d.className = "champ";
    d.innerHTML = `<div class="cy">${esc(c.season)}</div>
      <div class="cbody"><div class="ct">🏆 ${esc(c.team || "Champion")}</div>
        ${c.captain ? `<div class="cl"><span>Captain</span> <b class="plk" data-n="${esc(c.captain)}">${esc(c.captain)}</b></div>` : ""}
        ${c.mvp ? `<div class="cl"><span>MVP</span> <b class="plk" data-n="${esc(c.mvp)}">${esc(c.mvp)}</b></div>` : ""}
        ${c.score ? `<div class="cl"><span>Final</span> ${esc(c.score)}</div>` : ""}
        ${(c.roster||[]).length ? `<div class="cl"><span>Roster</span> ${(c.roster).map(n => `<b class="plk" data-n="${esc(n)}">${esc(n)}</b>`).join(", ")}</div>` : ""}
        ${c.note ? `<div class="cl" style="color:var(--muted)">${esc(c.note)}</div>` : ""}
      </div><button class="obtn sm cedit">Edit</button>`;
    d.querySelector(".cedit").onclick = () => champForm(c);
    ch.appendChild(d);
  });

  // --- awards: one year at a time (year toggle), most important award first ---
  const aw = root.querySelector("#awards");
  const awYears = [...new Set(H.awards.map(a => +a.season))].sort((a,b) => b - a);
  if (!awYears.includes(+HS.awYear)) HS.awYear = awYears[0];
  if (!awYears.length) aw.innerHTML = `<div class="empty-film" style="margin-top:0">No awards added yet. Click <b>+ Add award</b> for each one (MVP, DPOY, ROTY, MIP…).</div>`;
  else {
    aw.innerHTML = `<div class="yr-tog">${awYears.map(y => `<button data-y="${y}" class="${y === +HS.awYear ? "on" : ""}">${y}</button>`).join("")}</div><div class="aw-grid"></div>`;
    aw.querySelectorAll(".yr-tog button").forEach(b => b.onclick = () => { HS.awYear = +b.dataset.y; renderHistory(); });
    const grid = aw.querySelector(".aw-grid"), y = +HS.awYear;
    const ppgSeason = name => { const gs = allGamesFor(name).filter(g => g.season === y); return gs.length ? (gs.reduce((s, g) => s + SCORING.off(g.off || {}) + SCORING.def(g.def || {}), 0) / gs.length).toFixed(1) : ""; };
    const personRow = (name, isWinner) => {
      const r = document.createElement("div"); r.className = isWinner ? "aw-win" : "lrow";
      const p = byName[name];
      if (!isWinner) r.innerHTML = `<span class="lr"></span>`;
      if (p) r.appendChild(headshot(p)); else r.insertAdjacentHTML("beforeend", `<span class="hs" style="--tc:var(--t-NA)">${esc(name.split(" ").map(s => s[0]).join(""))}</span>`);
      r.insertAdjacentHTML("beforeend", `<div class="ln2"><span class="nm">${esc(name)}</span>${isWinner ? `<span class="cx">Winner</span>` : ""}</div><b class="lv" title="Fantasy PPG in ${y}">${ppgSeason(name)}</b>`);
      if (p) linkName(r.querySelector(".nm"), name);
      return r;
    };
    H.awards.filter(a => +a.season === y).sort((a,b) => awardRank(a.award) - awardRank(b.award)).forEach(a => {
      const card = document.createElement("div"); card.className = "rbox aw-card";
      card.innerHTML = `<h3>${esc(a.award)} <span style="float:right;color:#5f6a80">PPG</span></h3><button class="aw-edit" title="Edit">✎</button>`;
      card.appendChild(personRow(a.winner || "—", true));
      if (a.note) card.insertAdjacentHTML("beforeend", `<div class="aw-note">${esc(a.note)}</div>`);
      if ((a.finalists || []).length) {
        card.insertAdjacentHTML("beforeend", `<div class="aw-fh">Finalists</div>`);
        a.finalists.forEach(n => card.appendChild(personRow(n, false)));
      }
      card.querySelector(".aw-edit").onclick = () => awardForm(a);
      grid.appendChild(card);
    });
  }

  // --- leaderboards ---
  const lb = root.querySelector("#lb");
  if (!data.length) lb.innerHTML = `<div class="empty-film" style="grid-column:1/-1;margin-top:0">No stats logged yet — records fill in automatically from plays logged in the Film Room.</div>`;
  else cats.forEach(c => {
    const top = data.filter(r => r[c.k] > 0).sort((a,b) => b[c.k] - a[c.k] || (c.k === "w" ? a.l - b.l : 0)).slice(0, 5);   // top 5 per category
    const box = document.createElement("div"); box.className = "rbox lbox";
    box.innerHTML = `<h3>${c.label} <span style="float:right;color:#5f6a80">${unit === "game" ? "one game" : unit === "season" ? "one season" : "all-time"}</span></h3>`;
    if (!top.length) box.insertAdjacentHTML("beforeend", `<div style="color:var(--muted);font-size:13px">—</div>`);
    top.forEach((r, i) => {
      const p = byName[r.name];
      const row = document.createElement("div"); row.className = "lrow" + (i === 0 ? " first" : "");
      row.innerHTML = `<span class="lr">${i + 1}</span>`;
      if (p) row.appendChild(headshot(p));
      const g = r.gameId ? gameById(r.gameId) : null;
      const ctx = unit === "game" ? `${r.season} · vs ${esc(r.opp)}` : unit === "season" ? `${r.season} · ${r.games} gm` : `${r.games} gm`;
      row.insertAdjacentHTML("beforeend", `<div class="ln2"><span class="nm">${esc(r.name)}</span><span class="cx">${ctx}${r.sample ? ' <span class="sample-tag">SAMPLE</span>' : ""}</span></div><b class="lv">${c.k === "w" ? `${r.w}-${r.l}` : c.fmt ? (+r[c.k]).toFixed(c.fmt) : r[c.k]}</b>`);
      linkName(row.querySelector(".nm"), r.name);
      if (g && unit === "game") { const a = document.createElement("a"); a.href = `#film/${g.id}/${slug(r.name)}`; a.className = "lfilm"; a.title = "Watch this game"; a.textContent = "▶"; row.appendChild(a); }
      box.appendChild(row);
    });
    lb.appendChild(box);
  });

  // --- standings ---
  const st = root.querySelector("#stand");
  const gameYrs = seasons();
  if (!gameYrs.length) st.innerHTML = `<div class="empty-film" style="grid-column:1/-1;margin-top:0">No games yet.</div>`;
  gameYrs.forEach(y => {
    const s = standings(y);
    const champ = H.champions.find(c => +c.season === y);
    const box = document.createElement("div"); box.className = "rbox";
    box.innerHTML = `<h3>${y} standings ${s.some(x => x.sample) ? '<span class="sample-tag">SAMPLE</span>' : ""}</h3>
      <table class="ptable stbl"><thead><tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th><th>+/-</th></tr></thead><tbody>
      ${s.map(x => { const T = team(y, x.ab); return `<tr><td><span class="dot2" style="background:${T.c1}"></span>${esc(T.name)}${champ && champ.team === T.name ? " 🏆" : ""}</td><td>${x.w}-${x.l}${x.tie ? "-" + x.tie : ""}</td>${x.scored ? `<td>${x.pf}</td><td>${x.pa}</td><td style="color:${x.pf - x.pa >= 0 ? "#5fd68f" : "#ef6b5f"}">${x.pf - x.pa > 0 ? "+" : ""}${x.pf - x.pa}</td>` : `<td class="minor">—</td><td class="minor">—</td><td class="minor">—</td>`}</tr>`; }).join("")}
      </tbody></table>`;
    st.appendChild(box);
  });

  // --- team records ---
  const tr = root.querySelector("#trec");
  const fin = FD.games.filter(g => g.status === "FINAL" && g.score && g.score[g.home] != null && g.score[g.away] != null);
  const sides = fin.flatMap(g => [[g, g.home, +g.score[g.home], +g.score[g.away]], [g, g.away, +g.score[g.away], +g.score[g.home]]]);
  const recBox = (title, list, valFn, fmtFn) => {
    const box = document.createElement("div"); box.className = "rbox lbox";
    box.innerHTML = `<h3>${title}</h3>` + (list.length ? list.slice(0, 5).map((x, i) => `<div class="lrow${i===0?" first":""}"><span class="lr">${i+1}</span><div class="ln2"><span class="nm">${fmtFn(x)}</span><span class="cx">${x[0].season} · ${esc(x[0].round || "")}${x[0].sample ? ' <span class="sample-tag">SAMPLE</span>' : ""}</span></div><b class="lv">${valFn(x)}</b><a class="lfilm" href="#film/${x[0].id}" title="Watch">▶</a></div>`).join("") : `<div style="color:var(--muted);font-size:13px">—</div>`);
    tr.appendChild(box);
  };
  recBox("Most points in a game", sides.slice().sort((a,b) => b[2] - a[2]), x => x[2], x => esc(teamName(x[0].season, x[1])) + ` vs ${esc(otherTeam(x[0], x[1]))}`);
  recBox("Biggest win margin", sides.filter(x => x[2] > x[3]).sort((a,b) => (b[2]-b[3]) - (a[2]-a[3])), x => "+" + (x[2]-x[3]), x => esc(teamName(x[0].season, x[1])) + ` ${x[2]}-${x[3]} vs ${esc(otherTeam(x[0], x[1]))}`);
  recBox("Highest-scoring games", fin.map(g => [g, g.home, +g.score[g.home] + +g.score[g.away], 0]).sort((a,b) => b[2] - a[2]), x => x[2], x => `${esc(x[0].away)} ${x[0].score[x[0].away]} at ${esc(x[0].home)} ${x[0].score[x[0].home]}`);
  const best = [];
  gameYrs.forEach(y => standings(y).forEach(s => best.push({...s, season: y})));
  const bb = document.createElement("div"); bb.className = "rbox lbox";
  bb.innerHTML = `<h3>Best season records</h3>` + (best.length ? best.sort((a,b) => (b.w - b.l) - (a.w - a.l) || (b.pf - b.pa) - (a.pf - a.pa)).slice(0, 5).map((x, i) => `<div class="lrow${i===0?" first":""}"><span class="lr">${i+1}</span><div class="ln2"><span class="nm">${esc(teamName(x.season, x.ab))}</span><span class="cx">${x.season} · ${x.pf - x.pa > 0 ? "+" : ""}${x.pf - x.pa} pt diff${x.sample ? ' <span class="sample-tag">SAMPLE</span>' : ""}</span></div><b class="lv">${x.w}-${x.l}</b></div>`).join("") : `<div style="color:var(--muted);font-size:13px">—</div>`);
  tr.appendChild(bb);

  // --- wire ---
  root.querySelectorAll("#hTab button").forEach(b => { b.classList.toggle("on", b.dataset.v === HS.tab); b.onclick = () => { HS.tab = b.dataset.v; renderHistory(); }; });
  const hs = root.querySelector("#hSeason"); if (hs) hs.onchange = e => { HS.season = e.target.value; renderHistory(); };
  root.querySelector("#hSide").onchange = e => { HS.side = e.target.value; renderHistory(); };
  root.querySelector("#addChamp").onclick = () => champForm(null);
  root.querySelector("#addAward").onclick = () => awardForm(null);
  root.querySelectorAll(".plk").forEach(el => { if (byName[el.dataset.n]) linkName(el, el.dataset.n); });
}

function champForm(c){
  const isNew = !c;
  const H = histHistory();
  c = c ? {...c, roster: [...(c.roster || [])]} : {id: "c" + Date.now().toString(36), season: (seasons()[0] || CURRENT_SEASON), team: "", captain: "", mvp: "", score: "", roster: [], note: ""};
  openForm(`
    <h2>${isNew ? "Add champion" : "Edit champion"}</h2>
    <div class="sub">Add every year — including ones before this site existed.</div>
    <div class="fgrid">
      <div class="fld"><label>Year</label><input id="cSeason" type="number" value="${esc(c.season)}"></div>
      <div class="fld"><label>Team name</label><input id="cTeam" value="${esc(c.team)}" placeholder="Team Surtz"></div>
      <div class="fld"><label>Captain</label><select id="cCap">${playerOptions(c.captain)}</select></div>
      <div class="fld"><label>MVP</label><select id="cMvp">${playerOptions(c.mvp)}</select></div>
      <div class="fld full"><label>Championship score (optional)</label><input id="cScore" value="${esc(c.score)}" placeholder="28-21 over Team Veres"></div>
      <div class="fld full"><label>Roster (hold Ctrl / Cmd to pick several)</label><select id="cRoster" multiple size="8">${[...players].sort((a,b)=>a.last.localeCompare(b.last)).map(p => `<option ${c.roster.includes(p.name) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
      <div class="fld full"><label>Note (optional)</label><input id="cNote" value="${esc(c.note)}" placeholder="Walk-off TD in the snow"></div>
    </div>
    <div class="fm-foot">
      <div>${isNew ? "" : `<button class="obtn" id="cDel" style="border-color:#ef5a4c;color:#ef5a4c">Delete</button>`}</div>
      <div style="display:flex;gap:8px"><button class="obtn" id="cCancel">Cancel</button><button class="obtn solid" id="cSave">Save</button></div>
    </div>`, f => {
    f.querySelector("#cCancel").onclick = closeForm;
    const del = f.querySelector("#cDel");
    if (del) del.onclick = () => { if (confirm("Delete this champion entry?")) { H.champions = H.champions.filter(x => x.id !== c.id); saveFD(); closeForm(); renderHistory(); } };
    f.querySelector("#cSave").onclick = () => {
      Object.assign(c, {season: +val(f, "cSeason"), team: val(f, "cTeam"), captain: val(f, "cCap"), mvp: val(f, "cMvp"), score: val(f, "cScore"), note: val(f, "cNote"),
        roster: [...f.querySelector("#cRoster").selectedOptions].map(o => o.value)});
      if (!c.season) { alert("Enter a year."); return; }
      const i = H.champions.findIndex(x => x.id === c.id);
      if (i >= 0) H.champions[i] = c; else H.champions.push(c);
      saveFD(); closeForm(); renderHistory();
    };
  });
}

function awardForm(a){
  const isNew = !a;
  const H = histHistory();
  const known = [...new Set(H.awards.map(x => x.award))];
  a = a ? {...a} : {id: "a" + Date.now().toString(36), season: CURRENT_SEASON, award: "", winner: "", note: ""};
  openForm(`
    <h2>${isNew ? "Add award" : "Edit award"}</h2>
    <div class="sub">Pick an existing award name or type a new one.</div>
    <div class="fgrid">
      <div class="fld"><label>Year</label><input id="aSeason" type="number" value="${esc(a.season)}"></div>
      <div class="fld"><label>Award</label><input id="aAward" list="awList" value="${esc(a.award)}" placeholder="MVP"><datalist id="awList">${known.map(k => `<option value="${esc(k)}">`).join("")}</datalist></div>
      <div class="fld full"><label>Winner</label><select id="aWin">${playerOptions(a.winner)}</select></div>
      <div class="fld full"><label>Finalists (hold Ctrl / Cmd to pick several)</label><select id="aFin" multiple size="7">${[...players].sort((x,y)=>x.last.localeCompare(y.last)).map(p => `<option ${(a.finalists||[]).includes(p.name) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
      <div class="fld full"><label>Note (optional)</label><input id="aNote" value="${esc(a.note)}" placeholder="3 INTs in the final"></div>
    </div>
    <div class="fm-foot">
      <div>${isNew ? "" : `<button class="obtn" id="aDel" style="border-color:#ef5a4c;color:#ef5a4c">Delete</button>`}</div>
      <div style="display:flex;gap:8px"><button class="obtn" id="aCancel">Cancel</button><button class="obtn solid" id="aSave">Save</button></div>
    </div>`, f => {
    f.querySelector("#aCancel").onclick = closeForm;
    const del = f.querySelector("#aDel");
    if (del) del.onclick = () => { if (confirm("Delete this award?")) { H.awards = H.awards.filter(x => x.id !== a.id); saveFD(); closeForm(); renderHistory(); } };
    f.querySelector("#aSave").onclick = () => {
      Object.assign(a, {season: +val(f, "aSeason"), award: val(f, "aAward"), winner: val(f, "aWin"), note: val(f, "aNote"),
        finalists: [...f.querySelector("#aFin").selectedOptions].map(o => o.value).filter(n => n !== val(f, "aWin"))});
      HS.awYear = a.season;
      if (!a.season || !a.award) { alert("Enter a year and award name."); return; }
      const i = H.awards.findIndex(x => x.id === a.id);
      if (i >= 0) H.awards[i] = a; else H.awards.push(a);
      saveFD(); closeForm(); renderHistory();
    };
  });
}

if (location.hash.startsWith("#history")) renderHistory();
// A player card opened from a link was drawn before this file loaded — redraw so record/rings show.
if (typeof drawCard === "function" && PC.name && !document.getElementById("ov").hidden) drawCard();
