// ===================== FILM ROOM =====================
// Data lives in film_data.js (window.FILM_DATA). Edits made on the site are kept in this
// browser until you "Export data" and replace film_data.js with the exported file.

const FILM_KEY = "tb-film-data-v1";
const EMPTY_FD = {teams:{}, games:[], plays:[], participation:{}};
function loadFD(){
  let local = null;
  try { local = JSON.parse(localStorage.getItem(FILM_KEY) || "null"); } catch(e){}
  const d = local || JSON.parse(JSON.stringify(window.FILM_DATA || EMPTY_FD));
  d.teams = d.teams || {}; d.games = d.games || []; d.plays = d.plays || []; d.participation = d.participation || {};
  return d;
}
let FD = loadFD();
const hasLocalEdits = () => { try { return !!localStorage.getItem(FILM_KEY); } catch(e){ return false; } };
function saveFD(){ try { localStorage.setItem(FILM_KEY, JSON.stringify(FD)); } catch(e){ alert("Couldn't save in this browser — use Export data to keep your changes."); } }

// ---------- helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const team = (season, ab) => (FD.teams[season] || {})[ab] || {name: ab || "TBD", c1:"#2a3449", c2:"#e8ecf4"};
const gameById = id => FD.games.find(g => g.id === id);
const otherTeam = (g, ab) => g.home === ab ? g.away : g.home;
const seasons = () => [...new Set([...FD.games.map(g => g.season), ...Object.keys(FD.teams).map(Number)])].filter(Boolean).sort((a,b)=>b-a);
const gameSort = (a,b) => (a.date||"").localeCompare(b.date||"") || (a.order||0)-(b.order||0) || a.id.localeCompare(b.id);
const initialName = n => { if (!n) return ""; const p = split(n); return (p.first[0]||"") + "." + p.last; };
const fmtT = s => { s = Math.max(0, Math.round(s||0)); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); };
const parseT = v => { v = String(v||"").trim(); if (!v) return 0; if (v.includes(":")) { const [m,s] = v.split(":"); return (+m||0)*60 + (+s||0); } return +v || 0; };
const fmtDate = d => { if (!d) return "TBD"; const x = new Date(d + "T12:00:00"); if (isNaN(x)) return d; return x.toLocaleDateString("en-US",{weekday:"short"}).toUpperCase() + " " + (x.getMonth()+1) + "/" + x.getDate(); };
const involved = p => [p.qb, p.target, p.cov, p.tkl, p.pd, p.int, ...(p.tags||[])].filter(Boolean);
const isPass = p => p.type !== "run" && p.type !== "other";
const isHL = p => !!(p.hl || p.td || p.result === "int" || (p.yds||0) >= 20);
const playsOf = gid => FD.plays.filter(p => p.game === gid).sort((a,b) => (a.start||0)-(b.start||0));
const playerOptions = sel => `<option value="">—</option>` + [...players].sort((a,b)=>a.last.localeCompare(b.last)||a.first.localeCompare(b.first)).map(p => `<option ${p.name===sel?"selected":""}>${esc(p.name)}</option>`).join("");
const bySlug = s => players.find(p => slug(p.name) === s);

function autoDesc(p){
  const qb = p.qb ? initialName(p.qb) : "QB", tg = initialName(p.target);
  let d = "";
  if (p.type === "run") d = `${tg || "Ball carrier"} run for ${p.yds||0} yds`;
  else if (p.result === "comp") d = `${qb} pass to ${tg || "receiver"} for ${p.yds||0} yds`;
  else if (p.result === "int") d = `${qb} pass${tg ? " intended for " + tg : ""} INTERCEPTED${p.int ? " by " + initialName(p.int) : ""}`;
  else if (p.result === "inc") d = `${qb} pass incomplete${tg ? " intended for " + tg : ""}`;
  else d = "Play";
  if (p.td) d += " — TOUCHDOWN";
  if (p.pd) d += ` (broken up by ${initialName(p.pd)})`;
  if (p.tkl) d += ` (flag pulled by ${initialName(p.tkl)})`;
  return d;
}
const descOf = p => p.desc || autoDesc(p);

// Winner of a game: explicit `winner` (games logged without scores, e.g. 2025) or from the score.
// Returns team abbr, "TIE", or null if not decided.
function winnerOf(g){
  if (g.status !== "FINAL") return null;
  if (g.winner) return g.winner;
  const a = g.score?.[g.home], b = g.score?.[g.away];
  if (a == null || b == null || a === "" || b === "") return null;
  return +a > +b ? g.home : +b > +a ? g.away : "TIE";
}
const hasScore = g => g.score && g.score[g.home] != null && g.score[g.away] != null && g.score[g.home] !== "" && g.score[g.away] !== "";
function records(season){
  const r = {};
  FD.games.filter(g => g.season === season).forEach(g => {
    const w = winnerOf(g); if (!w) return;
    [g.home, g.away].forEach(t => r[t] = r[t] || {w:0,l:0,t:0});
    if (w === "TIE") { r[g.home].t++; r[g.away].t++; } else { r[w].w++; r[otherTeam(g, w)].l++; }
  });
  return t => { const x = r[t]; return x ? `${x.w}-${x.l}${x.t ? "-" + x.t : ""}` : "0-0"; };
}

// ---------- stats for player cards ----------
function filmGamesFor(name){
  const gs = FD.games.filter(g => FD.plays.some(p => p.game === g.id && involved(p).includes(name))).sort(gameSort);
  return gs.map(g => {
    const off = {tgt:0, rec:0, yds:0, td:0, att:0, cmp:0, pyds:0, ptd:0, ints:0}, def = {tkl:0, pd:0, int:0, tgta:0, reca:0, tda:0};
    let mine = null;
    playsOf(g.id).forEach(p => {
      if (p.cov === name && isPass(p)) {
        def.tgta++; mine = mine || otherTeam(g, p.off);
        if (p.result === "comp") { def.reca++; if (p.td) def.tda++; }
      }
      if (p.target === name) {
        mine = p.off;
        if (p.type === "run") { off.yds += +p.yds||0; off.rush = (off.rush||0) + 1; off.ryds = (off.ryds||0) + (+p.yds||0); if (p.td) { off.td++; off.rtd = (off.rtd||0) + 1; } }
        else { off.tgt++; if (p.result === "comp") { off.rec++; off.yds += +p.yds||0; if (p.td) off.td++; } }
      }
      if (p.qb === name && p.type !== "run") {
        mine = p.off; off.att++;
        if (p.result === "comp") { off.cmp++; off.pyds += +p.yds||0; if (p.td) off.ptd++; }
        if (p.result === "int") off.ints++;
      }
      if (p.tkl === name) { def.tkl++; mine = mine || otherTeam(g, p.off); }
      if (p.pd === name)  { def.pd++;  mine = mine || otherTeam(g, p.off); }
      if (p.int === name) { def.int++; mine = mine || otherTeam(g, p.off); }
    });
    if (mine) {
      const gp = playsOf(g.id).filter(isPass);
      off.teamAtt = gp.filter(p => p.off === mine).length;
      def.oppAtt = gp.filter(p => p.off !== mine).length;
      off.tgtp = off.teamAtt ? off.tgt / off.teamAtt * 100 : null;
      def.tgtp = def.oppAtt ? def.tgta / def.oppAtt * 100 : null;
    }
    const part = (FD.participation[g.id] || {})[name] || {};
    off.snap = part.snap ?? null; off.route = part.route ?? null; def.snap = part.dsnap ?? part.snap ?? null;
    return {gameId: g.id, season: g.season, opp: mine ? otherTeam(g, mine) : "—", off, def};
  });
}

// ---------- page routing ----------
const FS = {season:null, team:"", player:"", type:"", hl:false, game:"", idx:0, autoplay:true};
function route(){
  const parts = location.hash.replace(/^#/, "").split("/");
  const page = ["film", "history"].includes(parts[0]) ? parts[0] : "board";
  document.getElementById("pg-film").hidden = page !== "film";
  document.getElementById("pg-history").hidden = page !== "history";
  document.getElementById("pg-board").hidden = page !== "board";
  document.querySelectorAll(".navlink").forEach(a => a.classList.toggle("on", a.dataset.page === page));
  stopVideo();
  if (page === "history") { if (typeof renderHistory === "function") renderHistory(); window.scrollTo(0, 0); return; }
  if (page !== "film") return;
  FS.season = FS.season || seasons()[0] || new Date().getFullYear();
  if (parts[1]) {
    FS.game = parts[1] === "all" ? "" : parts[1];
    const g = gameById(FS.game); if (g) FS.season = g.season;
    FS.player = parts[2] ? (bySlug(parts[2])||{}).name || "" : "";
    if (parts[3] === "hl") FS.hl = true;
    FS.idx = 0;
    renderViewer();
  } else renderLanding();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// ---------- landing (game grid) ----------
function renderLanding(){
  const root = document.getElementById("pg-film");
  const yrs = seasons(); if (!yrs.includes(FS.season)) yrs.unshift(FS.season);
  const teamsThis = Object.entries(FD.teams[FS.season] || {});
  const rec = records(FS.season);
  const games = FD.games.filter(g => g.season === FS.season && (!FS.team || g.home === FS.team || g.away === FS.team)).sort(gameSort);
  const rounds = [...new Set(games.map(g => g.round || "Games"))];

  root.innerHTML = `<div class="fr-wrap">
    <div class="fr-top">
      <h1><span class="gold">Film Room</span> ${FS.season} Season</h1>
      <div class="fr-actions">
        <button class="obtn" id="addGame">+ Add game</button>
        <button class="obtn" id="expBtn">Export data</button>
        <button class="obtn" id="impBtn">Import</button>
      </div>
    </div>
    ${hasLocalEdits() ? `<div class="banner">✏️ <span>You have edits saved <b>only in this browser</b>. Click <b>Export data</b> and replace <code>film_data.js</code> (or send me the file) so everyone sees them.</span> <button class="obtn sm" id="resetLocal">Discard local edits</button></div>` : ""}
    <div class="fr-filters">
      <div class="fld"><label>Season</label><select id="fSeason">${yrs.map(y => `<option ${y===FS.season?"selected":""}>${y}</option>`).join("")}</select></div>
      <div class="fld"><label>Team</label><select id="fTeam"><option value="">All teams</option>${teamsThis.map(([ab,t]) => `<option value="${ab}" ${ab===FS.team?"selected":""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="fld" style="min-width:220px"><label>Player highlights</label><select id="fPlayer">${playerOptions(FS.player)}</select></div>
      <button class="obtn solid" id="watchHL">▶ Watch highlights</button>
      <button class="obtn" id="watchAll">All plays</button>
    </div>
    <div id="gameGrid"></div>
  </div>`;

  const grid = root.querySelector("#gameGrid");
  if (!games.length) grid.innerHTML = `<div class="empty-film">No games for ${FS.season}${FS.team ? " with this team" : ""} yet. Click <b>+ Add game</b> after the Turkey Bowl.</div>`;
  rounds.forEach(r => {
    grid.insertAdjacentHTML("beforeend", `<h2 class="round-h">${esc(r)}</h2>`);
    const gg = document.createElement("div"); gg.className = "gg";
    games.filter(g => (g.round || "Games") === r).forEach(g => {
      const H = team(g.season, g.home), A = team(g.season, g.away);
      const sc = hasScore(g), hs = sc ? +g.score[g.home] : null, as = sc ? +g.score[g.away] : null;
      const win = winnerOf(g);
      const lines = [[g.home, H, sc ? hs : (win === g.home ? "W" : win ? "L" : "")], [g.away, A, sc ? as : (win === g.away ? "W" : win ? "L" : "")]];
      const n = FD.plays.filter(p => p.game === g.id).length;
      gg.insertAdjacentHTML("beforeend", `
        <a class="gcard" href="#film/${g.id}">
          <div class="gc-top" style="background:linear-gradient(112deg, ${H.c1} 0 54%, ${A.c1} 54% 100%)">
            <div class="logo" style="color:${H.c2};background:${H.c1}">${esc(g.home)}</div>
            <div class="playbtn"></div>
            <div class="logo" style="color:${A.c2};background:${A.c1}">${esc(g.away)}</div>
          </div>
          <div class="gc-bot">
            ${lines.map(([ab,t,s]) => `<div class="ln ${win === ab ? "win" : ""}"><span>${esc(t.name)}<small>${rec(ab)}</small></span><b>${s ?? ""}</b></div>`).join("")}
            <div class="gc-foot"><span>${fmtDate(g.date)}${g.sample ? '<span class="sample-tag">SAMPLE</span>' : ""}</span><span>${n} plays · <span class="final">${esc(g.status || "UPCOMING")}</span></span></div>
          </div>
        </a>`);
    });
    grid.appendChild(gg);
  });

  root.querySelector("#fSeason").onchange = e => { FS.season = +e.target.value; FS.team = ""; renderLanding(); };
  root.querySelector("#fTeam").onchange = e => { FS.team = e.target.value; renderLanding(); };
  root.querySelector("#fPlayer").onchange = e => { FS.player = e.target.value; };
  root.querySelector("#watchHL").onclick = () => { FS.hl = true; FS.type = ""; location.hash = "#film/all/" + (FS.player ? slug(FS.player) : "") + "/hl"; };
  root.querySelector("#watchAll").onclick = () => { FS.hl = false; FS.type = ""; location.hash = "#film/all/" + (FS.player ? slug(FS.player) : ""); };
  root.querySelector("#addGame").onclick = () => gameForm();
  root.querySelector("#expBtn").onclick = exportData;
  root.querySelector("#impBtn").onclick = importData;
  const rl = root.querySelector("#resetLocal");
  if (rl) rl.onclick = () => { if (confirm("Discard edits saved in this browser and go back to film_data.js?")) { try { localStorage.removeItem(FILM_KEY); } catch(e){} FD = loadFD(); renderLanding(); } };
}

// ---------- viewer ----------
function filteredPlays(){
  const seasonGames = new Set(FD.games.filter(g => g.season === FS.season && (!FS.team || g.home === FS.team || g.away === FS.team)).map(g => g.id));
  const order = FD.games.slice().sort(gameSort).map(g => g.id);
  return FD.plays.filter(p => {
    if (FS.game ? p.game !== FS.game : !seasonGames.has(p.game)) return false;
    if (FS.player && !involved(p).includes(FS.player)) return false;
    if (FS.hl && !isHL(p)) return false;
    if (FS.type === "pass" && p.type === "run") return false;
    if (FS.type === "run" && p.type !== "run") return false;
    if (FS.type === "td" && !p.td) return false;
    if (FS.type === "to" && p.result !== "int") return false;
    if (FS.type === "big" && (p.yds||0) < 20) return false;
    if (FS.type === "def" && !(p.tkl || p.pd || p.int)) return false;
    return true;
  }).sort((a,b) => order.indexOf(a.game) - order.indexOf(b.game) || (a.start||0)-(b.start||0));
}

function renderViewer(){
  document.body.classList.remove("fs-lock");
  const root = document.getElementById("pg-film");
  const list = filteredPlays();
  if (FS.idx >= list.length) FS.idx = Math.max(0, list.length - 1);
  const cur = list[FS.idx];
  const g = cur ? gameById(cur.game) : gameById(FS.game);
  const seasonGames = FD.games.filter(x => x.season === FS.season).sort(gameSort);
  const teamsThis = Object.entries(FD.teams[FS.season] || {});
  const TYPES = [["","All plays"],["pass","Passes"],["run","Runs"],["td","Touchdowns"],["to","Interceptions"],["big","Big plays (20+ yds)"],["def","Defensive plays"]];

  const chips = [];
  chips.push([`Season: ${FS.season}`, null]);
  if (FS.team) chips.push([`Team: ${team(FS.season, FS.team).name}`, () => FS.team = ""]);
  if (FS.game) { const gg = gameById(FS.game); chips.push([`Game: ${gg ? gg.away + " at " + gg.home : FS.game}`, () => FS.game = ""]); }
  if (FS.player) chips.push([`Player: ${FS.player}`, () => FS.player = ""]);
  if (FS.type) chips.push([TYPES.find(t => t[0] === FS.type)[1], () => FS.type = ""]);
  if (FS.hl) chips.push(["Highlights only", () => FS.hl = false]);

  root.innerHTML = `<div class="fv">
    <aside class="fv-side">
      <a href="#film" style="color:var(--gold);text-decoration:none;font-weight:700;font-size:13px">← ALL GAMES</a>
      <h2>☰ Filter</h2>
      <div class="fld"><label>Season</label><select id="vSeason">${(seasons().length ? seasons() : [FS.season]).map(y => `<option ${y===FS.season?"selected":""}>${y}</option>`).join("")}</select></div>
      <div class="fld"><label>Game</label><select id="vGame"><option value="">All games</option>${seasonGames.map(x => `<option value="${x.id}" ${x.id===FS.game?"selected":""}>${esc(x.round ? x.round + " · " : "")}${esc(x.away)} at ${esc(x.home)}</option>`).join("")}</select></div>
      <div class="fld"><label>Team</label><select id="vTeam"><option value="">All teams</option>${teamsThis.map(([ab,t]) => `<option value="${ab}" ${ab===FS.team?"selected":""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="fld"><label>Player</label><select id="vPlayer">${playerOptions(FS.player)}</select></div>
      <div class="fld"><label>Play type</label><select id="vType">${TYPES.map(([v,l]) => `<option value="${v}" ${v===FS.type?"selected":""}>${l}</option>`).join("")}</select></div>
      <label class="tog"><input type="checkbox" id="vHL" ${FS.hl?"checked":""}><span class="sw"></span>Highlights only</label>
      <button class="wbtn" id="vClear">Clear filters</button>
      <button class="wbtn" id="vLog" style="border-color:var(--gold);color:var(--gold)">+ Log a play</button>
      ${g ? `<button class="wbtn" id="vEditGame">Edit game / film link</button><button class="wbtn" id="vPart">Snap &amp; route %</button>` : ""}
    </aside>
    <main class="fv-main">
      <h1><span class="gold">${list.length} play${list.length===1?"":"s"}</span> matching your criteria</h1>
      <div class="chiprow">${chips.map(([t,fn],i) => `<span class="fchip">${esc(t)}${fn ? `<button data-i="${i}" aria-label="Remove">✕</button>` : ""}</span>`).join("")}</div>
      ${g ? scoreboard(g, cur) : ""}
      <div class="vstage" id="vstage">
        <div class="vbox" id="vbox"></div>
        <div class="fs-bar"><span class="fs-lbl" id="fsLbl"></span>
          <button class="cbtn" id="fsPrev" aria-label="Previous play">⏮</button><button class="cbtn" id="fsPP" aria-label="Play or pause">⏸</button><button class="cbtn" id="fsNext" aria-label="Next play">⏭</button><button class="cbtn" id="fsExit" aria-label="Exit full screen">✕</button></div>
      </div>
      <div class="vctl">
        <button class="cbtn" id="prev" ${FS.idx<=0?"disabled":""}>⏮ Prev</button>
        <button class="cbtn" id="ppBtn" ${cur?"":"disabled"}>⏸ Pause</button>
        <button class="cbtn" id="replay" ${cur?"":"disabled"}>↻ Replay</button>
        <button class="cbtn" id="next" ${FS.idx>=list.length-1?"disabled":""}>Next ⏭</button>
        <button class="cbtn" id="fsBtn" ${cur?"":"disabled"}>⛶ Full screen</button>
        <label class="tog" style="margin-left:8px"><input type="checkbox" id="vAuto" ${FS.autoplay?"checked":""}><span class="sw"></span>Autoplay next play</label>
        ${cur ? `<span style="flex:1"></span><button class="cbtn" id="editPlay">✎ Edit</button>` : ""}
      </div>
      ${cur ? `<div class="pdesc">${esc(descOf(cur))}</div>
        <div class="pmeta"><span>Play ${FS.idx+1} of ${list.length}</span><span>·</span><span>${esc(g.round||"")} ${esc(g.away)} at ${esc(g.home)}</span><span>·</span><span>${fmtT(cur.start)}–${fmtT(cur.end)}</span>${isHL(cur) ? '<span class="hlb">HIGHLIGHT</span>' : ""}</div>`
        : `<div class="pdesc" style="color:var(--muted)">No plays match. ${FD.plays.length ? "Try clearing a filter." : "Log the first play with “+ Log a play”."}</div>`}
    </main>
    <aside class="fv-right">
      <div class="rbox" id="onPlay"></div>
      <div class="rbox"><h3>Plays (${list.length})</h3><div class="plist" id="plist"></div></div>
    </aside>
  </div>`;

  // on this play
  const op = root.querySelector("#onPlay");
  if (cur) {
    const O = team(g.season, cur.off), D = team(g.season, otherTeam(g, cur.off));
    const offRows = [["QB", cur.qb], [cur.type === "run" ? "RUSH" : "TARGET", cur.target]].filter(x => x[1]);
    const defRows = [["COVER", cur.cov], ["FLAG", cur.tkl], ["PD", cur.pd], ["INT", cur.int]].filter(x => x[1]);
    op.innerHTML = `<h3>On this play</h3>
      <div class="teamhdr" style="background:${O.c1};color:${O.c2}">${esc(O.name)} Offense</div><div class="rows-o"></div>
      <div class="teamhdr" style="background:${D.c1};color:${D.c2}">${esc(D.name)} Defense</div><div class="rows-d"></div>`;
    const addRows = (el, rows) => { if (!rows.length) el.innerHTML = `<div class="rrow" style="color:var(--muted)">—</div>`; rows.forEach(([role, n]) => { const pl = byName[n]; const r = document.createElement("div"); r.className = "rrow"; r.innerHTML = `<span class="role">${role}</span>`; if (pl) r.appendChild(headshot(pl)); const s = document.createElement("span"); s.textContent = n; r.appendChild(s); if (pl) linkName(s, n); el.appendChild(r); }); };
    addRows(op.querySelector(".rows-o"), offRows); addRows(op.querySelector(".rows-d"), defRows);
  } else op.innerHTML = `<h3>On this play</h3><div style="color:var(--muted);font-size:13px">Pick a play.</div>`;

  // play list
  const pl = root.querySelector("#plist");
  list.forEach((p, i) => {
    const gg = gameById(p.game);
    const d = document.createElement("div"); d.className = "pitem" + (i === FS.idx ? " on" : "");
    d.innerHTML = `<span class="n">${i+1}</span><div><div>${esc(descOf(p))} ${isHL(p) ? '<span class="hlb">HL</span>' : ""}</div><div class="gm">${esc(gg ? gg.away + " at " + gg.home : "")} · ${fmtT(p.start)}</div></div>`;
    d.onclick = () => { FS.idx = i; renderViewer(); };
    pl.appendChild(d);
  });
  const onEl = pl.querySelector(".on"); if (onEl) onEl.scrollIntoView({block:"nearest"});

  // wire filters
  const re = () => { FS.idx = 0; renderViewer(); };
  root.querySelector("#vSeason").onchange = e => { FS.season = +e.target.value; FS.game = ""; FS.team = ""; re(); };
  root.querySelector("#vGame").onchange = e => { FS.game = e.target.value; re(); };
  root.querySelector("#vTeam").onchange = e => { FS.team = e.target.value; re(); };
  root.querySelector("#vPlayer").onchange = e => { FS.player = e.target.value; re(); };
  root.querySelector("#vType").onchange = e => { FS.type = e.target.value; re(); };
  root.querySelector("#vHL").onchange = e => { FS.hl = e.target.checked; re(); };
  root.querySelector("#vClear").onclick = () => { FS.team = ""; FS.player = ""; FS.type = ""; FS.hl = false; re(); };
  root.querySelector("#vAuto").onchange = e => { FS.autoplay = e.target.checked; };
  root.querySelectorAll(".fchip button").forEach(b => b.onclick = () => { chips[+b.dataset.i][1](); re(); });
  root.querySelector("#prev").onclick = () => { FS.idx--; renderViewer(); };
  root.querySelector("#next").onclick = () => { FS.idx++; renderViewer(); };
  root.querySelector("#replay").onclick = () => renderViewer();
  root.querySelector("#vLog").onclick = () => playForm(null, cur ? cur.game : FS.game);
  const ep = root.querySelector("#editPlay"); if (ep) ep.onclick = () => playForm(cur);
  const eg = root.querySelector("#vEditGame"); if (eg) eg.onclick = () => gameForm(g);
  const pp = root.querySelector("#vPart"); if (pp) pp.onclick = () => partForm(g);
  root.querySelector("#fsBtn").onclick = enterFS;
  root.querySelector("#ppBtn").onclick = togglePlayTB;
  root.querySelector("#fsPP").onclick = togglePlayTB;
  root.querySelector("#fsExit").onclick = exitFS;
  root.querySelector("#fsPrev").onclick = () => goPlay(FS.idx - 1);
  root.querySelector("#fsNext").onclick = () => goPlay(FS.idx + 1);

  setFsLabel(list, cur);
  playVideo(root.querySelector("#vbox"), g, cur, list.length);
}

// ---------- full screen ----------
// The whole stage (video + slim play bar) goes full screen, so highlights keep auto-playing play
// after play without dropping out. Real full screen + landscape lock where the browser allows it
// (Android, desktop); iPhone Safari can't full-screen a page element, so there the stage covers the
// screen and turns sideways instead. While full screen, moving between plays only swaps the video;
// the rest of the page catches up when you exit.
const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.querySelector(".vstage.fs-fake"));
function setFsLabel(list, cur){
  const el = document.getElementById("fsLbl"); if (!el) return;
  el.textContent = cur ? `${FS.idx + 1}/${list.length} · ${descOf(cur)}` : "";
}
function goPlay(i){
  const list = filteredPlays();
  if (i < 0 || i >= list.length) return;
  FS.idx = i;
  if (!isFS()) { renderViewer(); return; }
  const cur = list[i];
  setFsLabel(list, cur);
  playVideo(document.getElementById("vbox"), gameById(cur.game), cur, list.length);
}
function enterFS(){
  const st = document.getElementById("vstage"); if (!st) return;
  const req = st.requestFullscreen || st.webkitRequestFullscreen;
  if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    Promise.resolve(req.call(st, {navigationUI: "hide"})).then(() => {
      try { screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {}); } catch(e){}
    }).catch(() => fakeFS(st, true));
  } else fakeFS(st, true);
}
function fakeFS(st, on){ st.classList.toggle("fs-fake", on); document.body.classList.toggle("fs-lock", on); }
function exitFS(){
  const st = document.getElementById("vstage");
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else if (st && st.classList.contains("fs-fake")) { fakeFS(st, false); renderViewer(); }
  try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch(e){}
}
["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => {
  if (!(document.fullscreenElement || document.webkitFullscreenElement)) {
    try { screen.orientation.unlock(); } catch(e){}
    if (!document.getElementById("pg-film").hidden && document.getElementById("vstage")) renderViewer();   // sync the page to the play you ended on
  }
}));
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.querySelector(".vstage.fs-fake")) exitFS(); });

function scoreboard(g, cur){
  const H = team(g.season, g.home), A = team(g.season, g.away);
  const hs = g.score ? g.score[g.home] ?? "" : "", as = g.score ? g.score[g.away] ?? "" : "";
  const poss = cur ? cur.off : null;
  return `<div class="sb">
    <div class="side" style="background:${A.c1};color:${A.c2}"><span class="mini-logo">${esc(g.away)}</span>${esc(as)}${poss===g.away?' <span class="poss">🏈</span>':""}</div>
    <div class="mid">${esc(g.round||"")}<br>${g.status==="FINAL"?"FINAL":fmtDate(g.date)}</div>
    <div class="side r" style="background:${H.c1};color:${H.c2}">${poss===g.home?'<span class="poss">🏈</span> ':""}${esc(hs)}<span class="mini-logo">${esc(g.home)}</span></div>
  </div>`;
}

// ---------- video ----------
// YouTube clips play with YouTube's controls off (they pop up every time a clip starts); a clear
// layer on top takes taps: tap = pause / play (also the ⏯ buttons). Pausing also pauses the
// "move to the next play" timer, so a paused clip never skips ahead.
let vidTimer = null, vidLeft = 0, vidStarted = 0, vidTotal = 0, ytPausedTB = false;
function stopVideo(){ clearTimeout(vidTimer); vidTimer = null; vidLeft = 0; ytPausedTB = false; }
function startTimer(ms, total){ clearTimeout(vidTimer); vidLeft = ms; vidTotal = total; vidStarted = Date.now(); vidTimer = setTimeout(() => autoNext(total), ms); }
function ytCmd(func){
  const f = document.querySelector("#vbox iframe.ytf"); if (!f) return;
  f.contentWindow.postMessage(JSON.stringify({event: "command", func, args: []}), "https://www.youtube.com");
}
function togglePlayTB(){
  const v = document.querySelector("#vbox video");
  if (v) { v.paused ? v.play().catch(() => {}) : v.pause(); setTimeout(syncPlayTB, 100); return; }
  if (!document.querySelector("#vbox iframe.ytf")) return;
  if (ytPausedTB) { ytCmd("playVideo"); ytPausedTB = false; if (vidLeft > 0) startTimer(vidLeft, vidTotal); }
  else { ytCmd("pauseVideo"); ytPausedTB = true; clearTimeout(vidTimer); vidLeft = Math.max(0, vidLeft - (Date.now() - vidStarted)); }
  syncPlayTB();
}
function syncPlayTB(){
  const v = document.querySelector("#vbox video");
  const paused = v ? v.paused : ytPausedTB;
  const box = document.getElementById("vbox"); if (box) box.classList.toggle("paused", !!document.querySelector("#vbox iframe.ytf") && ytPausedTB);
  const a = document.getElementById("ppBtn"), b = document.getElementById("fsPP");
  if (a) a.textContent = paused ? "▶ Play" : "⏸ Pause";
  if (b) b.textContent = paused ? "▶" : "⏸";
}
function autoNext(total){ if (FS.autoplay && FS.idx < total - 1) goPlay(FS.idx + 1); }
function playVideo(box, g, p, total){
  stopVideo(); box.classList.remove("paused");
  if (!p) { box.innerHTML = `<div class="novid"><div class="big">🎬</div><b>No play selected</b></div>`; return; }
  const url = (p.film || (g && g.film) || "").trim();
  const s = Math.max(0, +p.start || 0), e = Math.max(s + 1, +p.end || s + 15);
  if (!url) {
    box.innerHTML = `<div class="novid"><div class="big">🎬</div><b>No film uploaded for this game yet</b><span>Use “Edit game / film link” to add a YouTube, Google Drive or .mp4 link —<br>each play then jumps straight to its timestamp.</span><span class="ts">${fmtT(s)} – ${fmtT(e)}</span></div>`;
    return;
  }
  const yt = url.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
  if (yt) {
    box.innerHTML = `<iframe class="ytf" src="https://www.youtube.com/embed/${yt[1]}?start=${Math.floor(s)}&end=${Math.ceil(e)}&autoplay=1&rel=0&playsinline=1&controls=0&disablekb=1&iv_load_policy=3&modestbranding=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" allow="autoplay; encrypted-media; fullscreen"></iframe>
      <div class="yt-tap" aria-label="Play or pause"></div><div class="yt-cover show"><div class="yt-cover-t">${esc(descOf(p))}</div></div><div class="yt-paused"><span>▶</span></div>`;
    box.querySelector(".yt-tap").onclick = togglePlayTB;
    // quick cut card while the new clip loads (hides YouTube's own loading flash)
    setTimeout(() => { const c = box.querySelector(".yt-cover"); if (c) c.classList.remove("show"); }, 1300);
    startTimer((e - s + 1.5) * 1000, total);
    syncPlayTB();
  } else if (drive) {
    box.innerHTML = `<iframe src="https://drive.google.com/file/d/${drive[1]}/preview" allow="autoplay; fullscreen" allowfullscreen></iframe>
      <div style="position:absolute;left:10px;bottom:10px;background:rgba(0,0,0,.75);color:#f1d39a;font-size:12px;padding:5px 9px;border-radius:6px">Drive can't auto-jump — skip to ${fmtT(s)}</div>`;
  } else {
    const v = document.createElement("video"); v.controls = true; v.autoplay = true; v.playsInline = true; v.src = url;
    v.addEventListener("loadedmetadata", () => { v.currentTime = s; v.play().catch(()=>{}); });
    v.addEventListener("timeupdate", () => { if (v.currentTime >= e) { v.pause(); if (!v._done) { v._done = true; autoNext(total); } } });
    v.addEventListener("play", syncPlayTB); v.addEventListener("pause", syncPlayTB);
    box.innerHTML = ""; box.appendChild(v);
    window._filmVideo = v;
  }
}

// ---------- modal forms ----------
function openForm(html, wire){
  let ov = document.getElementById("fov");
  if (!ov) { ov = document.createElement("div"); ov.id = "fov"; ov.className = "ov"; document.body.appendChild(ov); ov.addEventListener("click", e => { if (e.target === ov) closeForm(); }); }
  ov.innerHTML = `<div class="fm">${html}</div>`; ov.hidden = false; wire(ov.querySelector(".fm"));
}
function closeForm(){ const ov = document.getElementById("fov"); if (ov) ov.hidden = true; }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeForm(); });
const val = (f, id) => f.querySelector("#" + id).value.trim();

function playForm(p, gid){
  const isNew = !p;
  const games = FD.games.slice().sort(gameSort);
  if (!games.length) { alert("Add a game first (Film Room → + Add game)."); return; }
  p = p ? {...p} : {id: "p" + Date.now().toString(36), game: gid || games[0].id, start: 0, end: 0, off: "", type: "pass", qb: "", target: "", result: "comp", yds: 0, td: false, cov: "", tkl: "", pd: "", int: "", hl: false, desc: ""};
  if (isNew && window._filmVideo && !isNaN(window._filmVideo.currentTime)) { p.start = Math.floor(window._filmVideo.currentTime); p.end = p.start + 12; }
  const g0 = gameById(p.game) || games[0];
  openForm(`
    <h2>${isNew ? "Log a play" : "Edit play"}</h2>
    <div class="sub">Every play you log feeds the player cards (targets, catches, yards, TDs, flag pulls, PDs, INTs).</div>
    <div class="fgrid">
      <div class="fld full"><label>Game</label><select id="pGame">${games.map(g => `<option value="${g.id}" ${g.id===p.game?"selected":""}>${g.season} · ${esc(g.round||"")} · ${esc(g.away)} at ${esc(g.home)}</option>`).join("")}</select></div>
      <div class="fld"><label>Start (m:ss in film)</label><input id="pStart" value="${fmtT(p.start)}"></div>
      <div class="fld"><label>End (m:ss)</label><input id="pEnd" value="${fmtT(p.end)}"></div>
      <div class="fld"><label>Offense</label><select id="pOff"></select></div>
      <div class="fld"><label>Play type</label><select id="pType">${[["pass","Pass"],["run","Run"],["other","Other"]].map(([v,l]) => `<option value="${v}" ${v===p.type?"selected":""}>${l}</option>`).join("")}</select></div>
      <div class="sect">Offense</div>
      <div class="fld"><label>QB</label><select id="pQB">${playerOptions(p.qb)}</select></div>
      <div class="fld"><label>Target / ball carrier</label><select id="pTgt">${playerOptions(p.target)}</select></div>
      <div class="fld"><label>Result</label><select id="pRes">${[["comp","Complete"],["inc","Incomplete"],["int","Intercepted"],["run","Run"],["","—"]].map(([v,l]) => `<option value="${v}" ${v===p.result?"selected":""}>${l}</option>`).join("")}</select></div>
      <div class="fld"><label>Yards</label><input id="pYds" type="number" value="${+p.yds||0}"></div>
      <label class="chk"><input type="checkbox" id="pTD" ${p.td?"checked":""}> Touchdown</label>
      <label class="chk"><input type="checkbox" id="pHL" ${p.hl?"checked":""}> Mark as highlight</label>
      <div class="sect">Defense</div>
      <div class="fld"><label>Coverage (defender on the target)</label><select id="pCov">${playerOptions(p.cov)}</select></div>
      <div class="fld"><label>Flag pull (tackle)</label><select id="pTkl">${playerOptions(p.tkl)}</select></div>
      <div class="fld"><label>Pass deflection</label><select id="pPD">${playerOptions(p.pd)}</select></div>
      <div class="fld"><label>Interception</label><select id="pINT">${playerOptions(p.int)}</select></div>
      <div class="fld full"><label>Description (optional — auto-written if blank)</label><textarea id="pDesc" placeholder="${esc(autoDesc(p))}">${esc(p.desc)}</textarea></div>
    </div>
    <div class="fm-foot">
      <div>${isNew ? "" : `<button class="obtn" id="pDel" style="border-color:#ef5a4c;color:#ef5a4c">Delete play</button>`}</div>
      <div style="display:flex;gap:8px"><button class="obtn" id="pCancel">Cancel</button><button class="obtn solid" id="pSave">${isNew ? "Save play" : "Save changes"}</button></div>
    </div>`, f => {
    const fillOff = () => { const g = gameById(f.querySelector("#pGame").value) || g0; f.querySelector("#pOff").innerHTML = [g.home, g.away].map(ab => `<option value="${ab}" ${ab===p.off?"selected":""}>${esc(team(g.season, ab).name)}</option>`).join(""); };
    fillOff(); f.querySelector("#pGame").onchange = fillOff;
    f.querySelector("#pType").onchange = e => { if (e.target.value === "run") f.querySelector("#pRes").value = "run"; };
    f.querySelector("#pCancel").onclick = closeForm;
    const del = f.querySelector("#pDel");
    if (del) del.onclick = () => { if (confirm("Delete this play?")) { FD.plays = FD.plays.filter(x => x.id !== p.id); saveFD(); closeForm(); renderViewer(); } };
    f.querySelector("#pSave").onclick = () => {
      Object.assign(p, {game: val(f,"pGame"), start: parseT(val(f,"pStart")), end: parseT(val(f,"pEnd")), off: val(f,"pOff"), type: val(f,"pType"),
        qb: val(f,"pQB"), target: val(f,"pTgt"), result: val(f,"pRes"), yds: +val(f,"pYds") || 0, td: f.querySelector("#pTD").checked,
        hl: f.querySelector("#pHL").checked, cov: val(f,"pCov"), tkl: val(f,"pTkl"), pd: val(f,"pPD"), int: val(f,"pINT"), desc: val(f,"pDesc")});
      if (p.end <= p.start) p.end = p.start + 12;
      const i = FD.plays.findIndex(x => x.id === p.id);
      if (i >= 0) FD.plays[i] = p; else FD.plays.push(p);
      saveFD(); closeForm();
      if (isNew) { FS.game = p.game; const list = filteredPlays(); const k = list.findIndex(x => x.id === p.id); FS.idx = k >= 0 ? k : FS.idx; }
      renderViewer();
    };
  });
}

function gameForm(g){
  const isNew = !g;
  const season = g ? g.season : FS.season;
  g = g ? JSON.parse(JSON.stringify(g)) : {id: season + "-" + Date.now().toString(36), season, round: "Round 1", date: `${season}-11-26`, home: "", away: "", score: {}, status: "FINAL", film: ""};
  const teamOpts = (sel) => `<option value="">Select…</option>` + Object.entries(FD.teams[g.season] || {}).map(([ab,t]) => `<option value="${ab}" ${ab===sel?"selected":""}>${esc(t.name)} (${ab})</option>`).join("") + `<option value="__new">+ New team…</option>`;
  const newTeamFields = id => `<div class="fgrid full" id="${id}" hidden style="grid-column:1/-1">
      <div class="fld"><label>Abbreviation (3 letters)</label><input class="nt-ab" maxlength="4" placeholder="SRZ"></div>
      <div class="fld"><label>Team name</label><input class="nt-name" placeholder="Team Surtz"></div>
      <div class="fld"><label>Main color</label><input class="nt-c1" type="color" value="#1f4e8c"></div>
      <div class="fld"><label>Logo text color</label><input class="nt-c2" type="color" value="#ffffff"></div></div>`;
  openForm(`
    <h2>${isNew ? "Add game" : "Edit game"}</h2>
    <div class="sub">Paste the film link once — every logged play jumps to its own timestamp in it.</div>
    <div class="fgrid">
      <div class="fld"><label>Season</label><input id="gSeason" type="number" value="${g.season}"></div>
      <div class="fld"><label>Round / label</label><input id="gRound" value="${esc(g.round)}"></div>
      <div class="fld"><label>Date</label><input id="gDate" type="date" value="${esc(g.date)}"></div>
      <div class="fld"><label>Status</label><select id="gStatus">${["FINAL","UPCOMING","LIVE"].map(s => `<option ${s===g.status?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="fld"><label>Home team</label><select id="gHome">${teamOpts(g.home)}</select></div>
      <div class="fld"><label>Home score</label><input id="gHS" type="number" value="${g.score?.[g.home] ?? ""}"></div>
      ${newTeamFields("ntHome")}
      <div class="fld"><label>Away team</label><select id="gAway">${teamOpts(g.away)}</select></div>
      <div class="fld"><label>Away score</label><input id="gAS" type="number" value="${g.score?.[g.away] ?? ""}"></div>
      ${newTeamFields("ntAway")}
      <div class="fld full"><label>Film link (YouTube, Google Drive or .mp4)</label><input id="gFilm" value="${esc(g.film)}" placeholder="https://youtu.be/..."></div>
    </div>
    <div class="fm-foot">
      <div>${isNew ? "" : `<button class="obtn" id="gDel" style="border-color:#ef5a4c;color:#ef5a4c">Delete game</button>`}</div>
      <div style="display:flex;gap:8px"><button class="obtn" id="gCancel">Cancel</button><button class="obtn solid" id="gSave">Save game</button></div>
    </div>`, f => {
    f.querySelector("#gHome").onchange = e => f.querySelector("#ntHome").hidden = e.target.value !== "__new";
    f.querySelector("#gAway").onchange = e => f.querySelector("#ntAway").hidden = e.target.value !== "__new";
    f.querySelector("#gCancel").onclick = closeForm;
    const del = f.querySelector("#gDel");
    if (del) del.onclick = () => { if (confirm("Delete this game and all its logged plays?")) { FD.games = FD.games.filter(x => x.id !== g.id); FD.plays = FD.plays.filter(p => p.game !== g.id); delete FD.participation[g.id]; saveFD(); closeForm(); location.hash = "#film"; } };
    f.querySelector("#gSave").onclick = () => {
      g.season = +val(f,"gSeason") || season; g.round = val(f,"gRound"); g.date = val(f,"gDate"); g.status = val(f,"gStatus"); g.film = val(f,"gFilm");
      const pick = (selId, boxId) => {
        let ab = val(f, selId);
        if (ab === "__new") {
          const box = f.querySelector("#" + boxId);
          ab = box.querySelector(".nt-ab").value.trim().toUpperCase();
          if (!ab) return null;
          FD.teams[g.season] = FD.teams[g.season] || {};
          FD.teams[g.season][ab] = {name: box.querySelector(".nt-name").value.trim() || ab, c1: box.querySelector(".nt-c1").value, c2: box.querySelector(".nt-c2").value};
        }
        return ab || null;
      };
      const h = pick("gHome","ntHome"), a = pick("gAway","ntAway");
      if (!h || !a || h === a) { alert("Pick two different teams."); return; }
      g.home = h; g.away = a;
      const hs = val(f,"gHS"), as = val(f,"gAS");
      g.score = {}; if (hs !== "") g.score[h] = +hs; if (as !== "") g.score[a] = +as;
      delete g.sample;
      const i = FD.games.findIndex(x => x.id === g.id);
      if (i >= 0) FD.games[i] = g; else FD.games.push(g);
      FS.season = g.season;
      saveFD(); closeForm();
      if (location.hash.startsWith("#film/")) renderViewer(); else renderLanding();
    };
  });
}

function partForm(g){
  const names = [...new Set(playsOf(g.id).flatMap(involved))];
  const part = FD.participation[g.id] || {};
  Object.keys(part).forEach(n => { if (!names.includes(n)) names.push(n); });
  openForm(`
    <h2>Snap &amp; route %</h2>
    <div class="sub">${esc(g.away)} at ${esc(g.home)} — percent of their team's plays each player was on the field (and running a route on passes).</div>
    <table class="ptable"><thead><tr><th>Player</th><th>Off snap %</th><th>Route %</th><th>Def snap %</th></tr></thead><tbody id="ptb"></tbody></table>
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><select id="addP" style="background:#0f1525;border:1px solid #2a3449;color:var(--ink);border-radius:8px;padding:8px">${playerOptions("")}</select><button class="obtn sm" id="addPB">+ Add player</button></div>
    <div class="fm-foot"><span></span><div style="display:flex;gap:8px"><button class="obtn" id="xCancel">Cancel</button><button class="obtn solid" id="xSave">Save</button></div></div>`, f => {
    const tb = f.querySelector("#ptb");
    const row = n => { const x = part[n] || {}; tb.insertAdjacentHTML("beforeend", `<tr data-n="${esc(n)}"><td>${esc(n)}</td><td><input type="number" min="0" max="100" class="s" value="${x.snap ?? ""}"></td><td><input type="number" min="0" max="100" class="r" value="${x.route ?? ""}"></td><td><input type="number" min="0" max="100" class="d" value="${x.dsnap ?? ""}"></td></tr>`); };
    names.forEach(row);
    f.querySelector("#addPB").onclick = () => { const n = f.querySelector("#addP").value; if (n && !tb.querySelector(`tr[data-n="${CSS.escape(n)}"]`)) row(n); };
    f.querySelector("#xCancel").onclick = closeForm;
    f.querySelector("#xSave").onclick = () => {
      const out = {};
      tb.querySelectorAll("tr").forEach(tr => { const num = c => { const v = tr.querySelector(c).value; return v === "" ? undefined : +v; }; const o = {snap: num(".s"), route: num(".r"), dsnap: num(".d")}; Object.keys(o).forEach(k => o[k] === undefined && delete o[k]); if (Object.keys(o).length) out[tr.dataset.n] = o; });
      FD.participation[g.id] = out; saveFD(); closeForm(); renderViewer();
    };
  });
}

// ---------- export / import ----------
function exportData(){
  const txt = "// Film Room data — exported " + new Date().toLocaleString() + "\nwindow.FILM_DATA = " + JSON.stringify(FD, null, 1) + ";\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([txt], {type: "text/javascript"}));
  a.download = "film_data.js"; document.body.appendChild(a); a.click(); a.remove();
}
function importData(){
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".js,.json";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      let t = await f.text();
      t = t.replace(/^[\s\S]*?window\.FILM_DATA\s*=\s*/, "").replace(/;\s*$/, "");
      const d = JSON.parse(t);
      if (!d.games || !d.plays) throw new Error("not film data");
      FD = d; FD.teams = FD.teams || {}; FD.participation = FD.participation || {};
      saveFD(); FS.season = seasons()[0] || FS.season; renderLanding();
    } catch(e) { alert("That file doesn't look like Film Room data."); }
  };
  inp.click();
}

route();
// Board was drawn before Film Room data loaded — redraw so PPG uses logged plays.
if (typeof render === "function") render();
if (typeof drawCard === "function" && PC.name && !document.getElementById("ov").hidden) drawCard();
