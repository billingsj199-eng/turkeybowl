// ===================== BRACKET (Turkey Bowl tournament, double elimination, 6 teams) =====================
// Stored in the cloud as bracket/<season> (tb-cloud.js): {slots: [captains in draw order], lotteryId, start "HH:MM", minutes, results}.
// The schedule lottery is drawn one by one (an editor taps "Draw next"; everyone watches each pick land):
//   slots[0], slots[1] = byes, slots[2] v slots[3] = Game 1, slots[4] v slots[5] = Game 2. Games use the slots once all 6 are drawn.
// One field, back to back: game N starts about start + (N-1) * minutes.
// Editors (and Jack) enter scores; the bracket fills itself in. A result can only be changed or cleared while no later
// game that depends on it has a result (clear the later game first).
// Teams = the live draft's captains (draft/<season>.order), named and colored like the rest of the site.

// a/b: {slot: i} = team in that lottery slot, {w: "gX"} = winner of game X, {l: "gX"} = loser of game X.
// Flip the two halves for a season (Jack 11-18, 2026): the 2nd drawn first-round game (draw spots 5-6) is Game 1 on top and
// feeds bye 1's game (Game 3); the 1st drawn game (spots 3-4) is Game 2 and feeds bye 2 (Game 4). Same matchups either way.
const BR_FLIP = !!(typeof CURRENT_SEASON !== "undefined" && {2026: true}[CURRENT_SEASON]);
const BR_GAMES = [
  {id: "g1",  n: 1,  round: "Winners R1",    side: "W", a: {slot: BR_FLIP ? 4 : 2}, b: {slot: BR_FLIP ? 5 : 3}},
  {id: "g2",  n: 2,  round: "Winners R1",    side: "W", a: {slot: BR_FLIP ? 2 : 4}, b: {slot: BR_FLIP ? 3 : 5}},
  // Pairings never change (Jack 11-18): bye 2 (Danny, top) plays the G1 winner, bye 1 (Luke, bottom) the G2 winner.
  // Only the order was tuned for rest: each round-1 winner gets one game off (G1 winner plays G3, G2 winner G4),
  // and the Winners Final comes before Losers R2 so nobody waits more than 3 games in the winners bracket.
  // Losers R1 is crossed (G3 loser v G2 loser, G4 loser v G1 loser) so nobody gets an instant rematch.
  {id: "g3",  n: 3,  round: "Winners R2",    side: "W", a: {slot: BR_FLIP ? 0 : 1}, b: {w: "g1"}},
  {id: "g4",  n: 4,  round: "Winners R2",    side: "W", a: {slot: BR_FLIP ? 1 : 0}, b: {w: "g2"}},
  {id: "g5",  n: 5,  round: "Losers R1",     side: "L", a: {l: "g3"}, b: {l: "g2"}},
  {id: "g6",  n: 6,  round: "Losers R1",     side: "L", a: {l: "g4"}, b: {l: "g1"}},
  {id: "g7",  n: 7,  round: "Winners Final", side: "W", a: {w: "g3"}, b: {w: "g4"}},
  {id: "g8",  n: 8,  round: "Losers R2",     side: "L", a: {w: "g5"}, b: {w: "g6"}},
  {id: "g9",  n: 9,  round: "Losers Final",  side: "L", a: {l: "g7"}, b: {w: "g8"}},
  {id: "g10", n: 10, round: "Championship",  side: "F", a: {w: "g7"}, b: {w: "g9"}},
  {id: "g11", n: 11, round: "Championship (if necessary)", side: "F", a: {w: "g7"}, b: {w: "g9"}, ifNeeded: true},
];
const BR_BY = Object.fromEntries(BR_GAMES.map(g => [g.id, g]));
// where each game's winner / loser goes next (for the little "→" hints)
const brNext = (gid, wl) => { const g = BR_GAMES.find(x => !x.ifNeeded && [x.a, x.b].some(s => s[wl] === gid)); return g ? "G" + g.n : wl === "l" ? "out" : ""; };

// Everything about the bracket from the saved doc: teams in each game, winners, who's alive, the champion.
// Automatic byes: teams that get a bye without being drawn (Jack 11-18: Team Billings + Team Surtz have people coming late).
// They fill slots 1-2 before the draw starts; the lottery only draws the Game 1 / Game 2 teams. [] = byes are drawn too.
const BR_FIXED_BYES = {2026: ["Luke Billings", "Danny Surtz"]};
function brFixed(){
  try { const f = BR_FIXED_BYES[CURRENT_SEASON] || [], t = brTeams(); return f.length === 2 && f.every(c => t.includes(c)) ? f.slice() : []; } catch(e){ return []; }
}
function brState(B){
  const real = (B && Array.isArray(B.slots)) ? B.slots : [], fx = brFixed();
  const drawn = real.length ? real : fx, ready = drawn.length === 6, slots = ready ? drawn : [], res = (B && B.results) || {}, out = {};
  const fixedN = fx.length && drawn[0] === fx[0] && drawn[1] === fx[1] ? fx.length : 0;
  const who = s => s.slot != null ? (drawn[s.slot] || null) : s.w ? (out[s.w] && out[s.w].winner) : (out[s.l] && out[s.l].loser);
  BR_GAMES.forEach(g => {
    const A = who(g.a), Bt = who(g.b), r = res[g.id];
    const valid = !!(r && A && Bt && r.a === A && r.b === Bt && r.sa !== r.sb);
    const x = {g, A, B: Bt, r: valid ? r : null, stale: !!r && !valid, winner: null, loser: null, needed: true};
    if (valid) { x.winner = r.sa > r.sb ? A : Bt; x.loser = x.winner === A ? Bt : A; }
    out[g.id] = x;
  });
  const f = out.g10, f2 = out.g11;
  f2.needed = !f.winner || f.winner === f.B;               // only if the losers-bracket team wins the first final
  if (f.winner && !f2.needed) { f2.A = f2.B = null; f2.r = null; f2.winner = f2.loser = null; }
  const champion = f.winner && !f2.needed ? f.winner : f2.winner || null;
  const losses = {}; Object.values(out).forEach(x => { if (x.loser) losses[x.loser] = (losses[x.loser] || 0) + 1; });
  const next = slots.length ? BR_GAMES.find(g => out[g.id].needed && !out[g.id].r && !champion) || null : null;
  return {slots, drawn, realN: real.length, fixedN, out, champion, losses, next: next && out[next.id]};
}
// games whose teams come from this game's result
const brDependents = gid => BR_GAMES.filter(x => [x.a, x.b].some(s => s.w === gid || s.l === gid) || (gid === "g10" && x.id === "g11"));

const brTime = (B, n) => {
  const start = B && typeof B.start === "string" ? B.start : "10:00";   // Game 1 at 10 AM until someone changes it
  if (!start) return "";
  const [h, m] = start.split(":").map(Number), t = h * 60 + m + (n - 1) * ((B && B.minutes) || 30);
  const hh = Math.floor(t / 60) % 24, mm = t % 60;
  return `${(hh % 12) || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
};
const brTeams = () => (window.TBC && TBC.live && Array.isArray(TBC.live.order) && TBC.live.order.length ? TBC.live.order : captains).slice();
const brEsc = s => esc2(s);
let BR_EDIT = null;            // game id whose score editor is open
let BR_LOTTO_SEEN;             // {id, n}: lottery draw already shown (undefined = not loaded yet: don't auto-play old ones)
// what each draw is, in order (slots[k])
// what each draw spot is (slots[k]), worked out from the games: byes, then each first-round game's two teams
const brSlotGame = k => BR_GAMES.find(g => !g.ifNeeded && g.n <= 2 && (g.a.slot === k || g.b.slot === k));
const BR_DRAWS = [0, 1, 2, 3, 4, 5].map(k => k < 2 ? "Bye #" + (k + 1) : `Game ${brSlotGame(k).n} · ${brSlotGame(k).a.slot === k ? "first team" : "opponent"}`);
const BR_R1 = [1, 2].map(n => { const g = BR_GAMES.find(x => x.n === n); return [g.a.slot, g.b.slot]; });   // [[slot, slot] for Game 1, Game 2]
let BR_CHAMP_SEEN;             // champion already celebrated

function brTeamChip(c, cls = ""){
  const d = document.createElement("div"); d.className = "br-tm " + cls;
  if (c) { d.style.setProperty("--team", teamColor(c) || "var(--accent)"); d.appendChild(teamBadge(c)); d.insertAdjacentHTML("beforeend", `<span class="br-tn">${brEsc(draftTeamName(c))}</span>`); }
  return d;
}
const brSrc = s => s.slot != null ? (s.slot < 2 ? "Bye team " + (s.slot + 1) : "Lottery slot " + (s.slot + 1)) : (s.w ? "Winner G" : "Loser G") + BR_BY[s.w || s.l].n;

// One team line inside a game (bracket card or schedule row)
function brLine(x, side){
  const c = side === "a" ? x.A : x.B, src = side === "a" ? x.g.a : x.g.b, score = x.r ? (side === "a" ? x.r.sa : x.r.sb) : null;
  const row = document.createElement("div"); row.className = "br-line" + (x.winner && x.winner === c ? " win" : x.loser && x.loser === c ? " lose" : "");
  if (c) row.appendChild(brTeamChip(c)); else row.insertAdjacentHTML("beforeend", `<div class="br-tm tbd"><span class="br-tn">${brEsc(brSrc(src))}</span></div>`);
  row.insertAdjacentHTML("beforeend", `<span class="br-sc">${score != null ? score : ""}</span>`);
  return row;
}

function brGameCard(x, S, B, ed){
  const g = x.g, card = document.createElement("div");
  card.className = "br-game" + (S.next && S.next.g.id === g.id ? " next" : "") + (x.r ? " done" : "") + (!x.needed ? " skip" : "");
  const tm = brTime(B, g.n);
  card.innerHTML = `<div class="br-gh"><b>Game ${g.n}</b><span>${brEsc(g.round)}</span>${tm ? `<span class="br-time">${x.r ? "Final" : "~" + tm}</span>` : x.r ? `<span class="br-time">Final</span>` : ""}</div>`;
  if (!x.needed) { card.insertAdjacentHTML("beforeend", `<div class="br-skipmsg">Not needed: ${brEsc(draftTeamName(S.out.g10.winner))} won the first final.</div>`); return card; }
  card.append(brLine(x, "a"), brLine(x, "b"));
  const hint = g.side === "F" ? (g.ifNeeded ? "Winner takes the title" : "If the losers-bracket team wins, Game 11 decides it") : `W → ${brNext(g.id, "w")} · L → ${brNext(g.id, "l")}`;
  card.insertAdjacentHTML("beforeend", `<div class="br-hint">${brEsc(hint)}</div>`);
  if (x.stale) card.insertAdjacentHTML("beforeend", `<div class="br-warn">⚠ A saved score doesn't match these teams any more. Re-enter it.</div>`);
  if (ed && x.A && x.B) {
    if (BR_EDIT === g.id) card.appendChild(brScoreEditor(x, B));
    else { const b = document.createElement("button"); b.className = "btn br-enter"; b.textContent = x.r ? "✎ Edit score" : "Enter score"; b.onclick = () => { BR_EDIT = g.id; renderBracket(true); }; card.appendChild(b); }
  }
  return card;
}

function brScoreEditor(x, B){
  const d = document.createElement("div"); d.className = "br-ed";
  d.innerHTML = `<label>${brEsc(draftTeamName(x.A))}<input type="number" inputmode="numeric" min="0" max="199" id="brSa" value="${x.r ? x.r.sa : ""}"></label>
    <label>${brEsc(draftTeamName(x.B))}<input type="number" inputmode="numeric" min="0" max="199" id="brSb" value="${x.r ? x.r.sb : ""}"></label>
    <div class="row-btns" style="margin:6px 0 0"><button class="btn primary" id="brSave">Save</button><button class="btn" id="brCancel">Cancel</button>${x.r ? `<button class="btn lv-danger" id="brClear">Clear result</button>` : ""}</div>
    <div class="psub" id="brMsg"></div>`;
  const msg = t => { d.querySelector("#brMsg").textContent = t; };
  const gid = x.g.id;
  // refuse if the teams changed, or a later game that depends on this result already has a score and the winner would change
  const guard = (fresh, results) => {
    const before = brState(fresh), after = brState({...(fresh || {}), results});
    const bx = before.out[gid];
    if (!bx.A || bx.A !== x.A || bx.B !== x.B) return "The teams in this game changed. Check the bracket and try again.";
    const changed = BR_GAMES.filter(g => (before.out[g.id].winner || null) !== (after.out[g.id].winner || null) || (before.out[g.id].loser || null) !== (after.out[g.id].loser || null)).map(g => g.id);
    if (!changed.includes(gid)) return "";
    const blocked = brDependents(gid).filter(g => (fresh && fresh.results || {})[g.id]);
    return blocked.length ? `Clear Game ${blocked.map(g => g.n).join(" and Game ")} first: ${blocked.length > 1 ? "they depend" : "it depends"} on this result.` : "";
  };
  const save = async res => {
    d.querySelectorAll("button").forEach(b => b.disabled = true); msg("Saving…");
    try { await TBC.bracketResult(gid, res, guard); BR_EDIT = null; renderBracket(true); }
    catch(err){ d.querySelectorAll("button").forEach(b => b.disabled = false); msg(err.code === "permission-denied" ? "You don't have edit access." : err.message); }
  };
  setTimeout(() => d.querySelector("#brSa").focus(), 0);
  d.querySelector("#brCancel").onclick = () => { BR_EDIT = null; renderBracket(true); };
  d.querySelector("#brSave").onclick = () => {
    const sa = d.querySelector("#brSa").value.trim(), sb = d.querySelector("#brSb").value.trim();
    if (!/^\d{1,3}$/.test(sa) || !/^\d{1,3}$/.test(sb)) return msg("Enter both scores (whole numbers).");
    if (+sa === +sb) return msg("No ties in the bracket: one team has to win.");
    save({a: x.A, b: x.B, sa: +sa, sb: +sb});
  };
  const cl = d.querySelector("#brClear"); if (cl) cl.onclick = () => { if (confirm(`Clear the Game ${x.g.n} result?`)) save(null); };
  d.addEventListener("keydown", e => { if (e.key === "Enter") d.querySelector("#brSave").click(); if (e.key === "Escape") d.querySelector("#brCancel").click(); });
  return d;
}

let BR_PENDING = false;      // an update came in while someone was typing: redraw when they leave the box
function renderBracket(force){
  const root = document.getElementById("pg-bracket"); if (!root || root.hidden) return;
  const B = window.TBC ? TBC.bracket : null, ed = !!(window.TBC && TBC.canEdit()), S = brState(B), teams = brTeams();
  const active = document.activeElement;
  if (!force && active && root.contains(active) && active.tagName === "INPUT") { BR_PENDING = true; return; }   // don't wipe a score being typed
  BR_PENDING = false;
  root.innerHTML = `<header><h1>Turkey Bowl <span>${CURRENT_SEASON}</span> Bracket</h1></header>
    <div class="summary"><span class="hl">DOUBLE ELIMINATION</span> &nbsp; ${teams.length} teams · one field, back to back · two losses and you're out</div>`;
  if (!window.TBC || !TBC.bracketReady) { root.insertAdjacentHTML("beforeend", `<div class="empty">Loading the bracket…</div>`); return; }
  if (teams.length !== 6) { root.insertAdjacentHTML("beforeend", `<div class="empty">The bracket is set up for 6 teams (there are ${teams.length} captains right now).</div>`); return; }

  // champion
  if (S.champion) {
    const ch = document.createElement("div"); ch.className = "br-champ"; ch.style.setProperty("--team", teamColor(S.champion) || "var(--accent)");
    ch.appendChild(teamBadge(S.champion));
    ch.insertAdjacentHTML("beforeend", `<div><div class="lbl2">🏆 ${CURRENT_SEASON} Turkey Bowl champion</div><div class="br-champ-n">${brEsc(draftTeamName(S.champion))}</div><div class="psub">Captain ${brEsc(S.champion)} · ${S.losses[S.champion] ? "came back with one loss" : "undefeated"}</div></div>`);
    root.appendChild(ch);
    if (BR_CHAMP_SEEN !== undefined && BR_CHAMP_SEEN !== S.champion) confetti(ch);
  }
  BR_CHAMP_SEEN = S.champion || null;

  // ---- the bracket graphic (top of the page) ----
  const pic = document.createElement("div"); pic.className = "br-pic";
  pic.innerHTML = `<div class="br-pic-h"><span class="lbl2">The bracket</span><button class="btn" type="button">⤢ Full screen</button></div><div class="br-pic-in">${brSvg(S, B)}</div>`;
  pic.querySelector("button").onclick = () => brFullBracket();
  root.appendChild(pic);

  const wrap = document.createElement("div"); wrap.className = "br-top";
  // ---- lottery: drawn one by one ----
  const lot = document.createElement("div"); lot.className = "panel br-lot";
  const dr = S.drawn, nd = dr.length, played = Object.keys((B && B.results) || {}).length;
  lot.innerHTML = `<h3>🎰 Schedule lottery</h3>${S.fixedN ? `<div class="lv-lotto-tag">📌 Automatic byes: ${brEsc(draftTeamName(dr[0]))} and ${brEsc(draftTeamName(dr[1]))} (people coming late)</div>` : ""}${nd <= S.fixedN ? `<div class="psub">Draws ${S.fixedN ? "the 4 teams in Game 1 and Game 2" : "the 2 teams with byes and both first-round games"}, one pick at a time. ${ed ? "Everyone on this page watches each pick land." : "Stay on this page to watch it live."}</div>` : ""}`;
  if (nd) {
    lot.insertAdjacentHTML("beforeend", `<div class="br-byes"><span class="lbl2">Byes</span></div><div class="br-r1"><div><span class="lbl2">Game 1</span></div><div><span class="lbl2">Game 2</span></div></div>`);
    const chip = i => dr[i] ? brTeamChip(dr[i]) : Object.assign(document.createElement("span"), {className: "br-q", textContent: "?"});
    const by = lot.querySelector(".br-byes"); [0, 1].forEach(i => by.appendChild(chip(i)));
    const r1 = lot.querySelectorAll(".br-r1 > div");
    BR_R1.forEach(([p, q], k) => { r1[k].append(chip(p), Object.assign(document.createElement("span"), {className: "br-vs", textContent: "vs"}), chip(q)); });
    if (nd < 6 && S.realN) lot.insertAdjacentHTML("beforeend", `<div class="psub" style="margin-top:8px">🔴 Draw in progress · ${nd - S.fixedN} of ${6 - S.fixedN} picked · next: ${BR_DRAWS[nd]}</div>`);
  }
  const lb = document.createElement("div"); lb.className = "row-btns";
  if (ed && nd < 6) {
    const nx = document.createElement("button"); nx.className = "btn primary"; nx.textContent = `🎰 Draw next: ${BR_DRAWS[nd]}`;
    nx.onclick = () => brDrawNext(nx);
    lb.appendChild(nx);
    if (nd) { const rest = document.createElement("button"); rest.className = "btn"; rest.textContent = "⏩ Draw the rest"; rest.onclick = () => brDrawRest(rest); lb.appendChild(rest); }
  }
  if (ed && S.realN) {
    const so = document.createElement("button"); so.className = "btn lv-danger"; so.textContent = "↺ Start over";
    so.disabled = played > 0; if (played) so.title = "Locked: games have been played";
    so.onclick = async () => {
      if (!confirm("Start the schedule lottery over? Every pick so far is wiped.")) return;
      so.disabled = true;
      try { await TBC.bracketLotteryReset(); } catch(err){ so.disabled = false; alert("Couldn't start over: " + (err.code === "permission-denied" ? "you don't have edit access." : err.message)); }
    };
    lb.appendChild(so);
  }
  if (S.realN && nd < 6) { const w = document.createElement("button"); w.className = "btn"; w.textContent = "👀 Watch the draw"; w.onclick = () => brDrawOverlay(dr, true); lb.appendChild(w); }
  if (nd === 6) { const rp = document.createElement("button"); rp.className = "btn"; rp.textContent = "▶ Replay lottery"; rp.onclick = () => brReplay(dr); lb.appendChild(rp); }
  if (lb.children.length) lot.appendChild(lb);
  wrap.appendChild(lot);

  // ---- team status ----
  if (S.slots.length) {
    const st = document.createElement("div"); st.className = "panel br-status"; st.innerHTML = `<h3>Teams</h3>`;
    const W = c => Object.values(S.out).filter(x => x.winner === c).length, Lc = c => S.losses[c] || 0;
    const tag = c => S.champion === c ? `<span class="br-tag ch">Champion</span>` : Lc(c) >= 2 ? `<span class="br-tag out">Eliminated</span>` : Lc(c) === 1 ? `<span class="br-tag lb">Losers bracket</span>` : `<span class="br-tag wb">Winners bracket</span>`;
    [...S.slots].sort((a, b) => (S.champion === b) - (S.champion === a) || Math.min(Lc(a), 2) - Math.min(Lc(b), 2) || W(b) - W(a)).forEach(c => {
      const r = document.createElement("div"); r.className = "br-strow" + (Lc(c) >= 2 ? " out" : "");
      r.appendChild(brTeamChip(c)); r.insertAdjacentHTML("beforeend", `<span class="br-rec">${W(c)}-${Lc(c)}</span>${tag(c)}`);
      st.appendChild(r);
    });
    wrap.appendChild(st);
  }
  root.appendChild(wrap);

  // ---- schedule settings (editors) ----
  if (ed) {
    const s = document.createElement("div"); s.className = "br-set";
    s.innerHTML = `<span class="lbl">Times</span> Game 1 at <input type="time" id="brStart" value="${(B && typeof B.start === "string") ? B.start : "10:00"}"> · <input type="number" id="brMin" min="10" max="240" value="${(B && B.minutes) || 30}"> min per game <button class="btn" id="brSetSave">Save times</button> <span class="psub" id="brSetMsg"></span>`;
    s.querySelector("#brSetSave").onclick = async () => {
      const st = s.querySelector("#brStart").value, mn = +s.querySelector("#brMin").value;
      if (st && !/^([01]\d|2[0-3]):[0-5]\d$/.test(st)) return s.querySelector("#brSetMsg").textContent = "Pick a start time.";
      if (!Number.isInteger(mn) || mn < 10 || mn > 240) return s.querySelector("#brSetMsg").textContent = "Minutes per game: 10 to 240.";
      s.querySelector("#brSetMsg").textContent = "Saving…";
      try { await TBC.bracketTimes(st, mn); s.querySelector("#brSetMsg").textContent = ""; renderBracket(true); }
      catch(err){ s.querySelector("#brSetMsg").textContent = err.code === "permission-denied" ? "You don't have edit access." : err.message; }
    };
    root.appendChild(s);
  }

  // ---- schedule (game order) ----
  root.insertAdjacentHTML("beforeend", `<h2 class="br-h">Schedule</h2>`);
  const sch = document.createElement("div"); sch.className = "br-sched";
  BR_GAMES.forEach(g => sch.appendChild(brGameCard(S.out[g.id], S, B, ed)));
  root.appendChild(sch);
}

// ===== The bracket graphic: a classic bracket with lines (SVG), filled in live =====
// Winners bracket on top (R1 → R2 → Final), losers bracket below (R1 → R2 → Final), both into the Championship.
const BRX = [16, 216, 416, 616, 816], BRW = 168, BRH = 56;
const BR_POS = {g1: [0, 70], g2: [0, 190], g3: [1, 70], g4: [1, 190], g7: [2, 130],
  g5: [1, 400], g6: [1, 520], g8: [2, 460], g9: [3, 460], g10: [4, 295], g11: [4, 415]};
// lines: [from, to, which row of "to" (0 top / 1 bottom)]
const BR_LINES = [["g1", "g3", 1], ["g2", "g4", 1], ["g3", "g7", 0], ["g4", "g7", 1], ["g7", "g10", 0],
  ["g5", "g8", 0], ["g6", "g8", 1], ["g8", "g9", 1], ["g9", "g10", 1]];
function brSvg(S, B){
  const e = brEsc, out = [];
  const box = id => { const [c, y] = BR_POS[id]; return {x: BRX[c], y}; };
  const nm = (x, side) => { const c = side ? x.B : x.A; return c ? draftTeamName(c) : brSrc(side ? x.g.b : x.g.a); };
  // lines first (under the boxes)
  BR_LINES.forEach(([f, t, row]) => {
    const a = box(f), b = box(t), x1 = a.x + BRW, y1 = a.y + BRH / 2, x2 = b.x, y2 = b.y + (row ? BRH * 0.75 : BRH * 0.25), xm = x2 - 24;
    const lit = !!S.out[f].winner;
    out.push(`<path d="M${x1} ${y1} H${xm} V${y2} H${x2}" class="ln${lit ? " lit" : ""}"/>`);
  });
  out.push(`<path d="M${box("g10").x + BRW / 2} ${box("g10").y + BRH + 4} V${box("g11").y - 18}" class="ln dash"/>`);
  // section labels
  out.push(`<text x="16" y="30" class="sec">WINNERS BRACKET</text><text x="16" y="364" class="sec">LOSERS BRACKET</text><text x="${BRX[4]}" y="${BR_POS.g10[1] - 34}" class="sec">CHAMPIONSHIP</text>`);
  out.push(`<text x="16" y="400" class="note">Lose once and you drop here.</text><text x="16" y="418" class="note">Lose twice and you're out.</text>`);
  // byes: a short "BYE" arrow straight into the top line of round-2 games G3 / G4
  ["g4", "g3"].forEach(id => {
    const b = box(id), y = b.y + BRH * 0.25;
    out.push(`<path d="M${b.x - 26} ${y} H${b.x}" class="ln lit"/><text x="${b.x - 13}" y="${y - 5}" class="bye" text-anchor="middle">BYE</text>`);
  });
  // the games
  BR_GAMES.forEach(g => {
    const x = S.out[g.id], b = box(g.id), nx = S.next && S.next.g.id === g.id;
    const tm = x.r ? "FINAL" : g.ifNeeded && !x.needed ? "NOT NEEDED" : "~" + brTime(B, g.n);
    out.push(`<g class="gm${nx ? " nx" : ""}${!x.needed ? " skip" : ""}">
      <text x="${b.x}" y="${b.y - 6}" class="gl">G${g.n}${g.ifNeeded ? " · IF NEEDED" : ""}</text><text x="${b.x + BRW}" y="${b.y - 6}" class="gl gt" text-anchor="end">${tm}</text>
      <rect x="${b.x}" y="${b.y}" width="${BRW}" height="${BRH}" rx="8" class="bx"/>
      <line x1="${b.x}" y1="${b.y + BRH / 2}" x2="${b.x + BRW}" y2="${b.y + BRH / 2}" class="mid"/>`);
    [0, 1].forEach(side => {
      const c = side ? x.B : x.A, ty = b.y + side * BRH / 2, cls = !c ? "tbd" : x.winner === c ? "win" : x.loser === c ? "lose" : "tm";
      if (c) out.push(`<rect x="${b.x + 1}" y="${ty + 1}" width="5" height="${BRH / 2 - 2}" rx="2" fill="${e(teamColor(c) || "#6c7689")}"/>`);
      out.push(`<text x="${b.x + 13}" y="${ty + 18.5}" class="${cls}">${e(nm(x, side))}</text>`);
      if (x.r) out.push(`<text x="${b.x + BRW - 10}" y="${ty + 19}" class="sc ${cls}" text-anchor="end">${side ? x.r.sb : x.r.sa}</text>`);
    });
    out.push(`</g>`);
  });
  // champion
  const cb = {x: BRX[4], y: 520};
  out.push(`<rect x="${cb.x}" y="${cb.y}" width="${BRW}" height="62" rx="10" class="champ${S.champion ? " won" : ""}"/>
    <text x="${cb.x + BRW / 2}" y="${cb.y + 22}" class="cl" text-anchor="middle">🏆 CHAMPION</text>
    <text x="${cb.x + BRW / 2}" y="${cb.y + 47}" class="cn${S.champion ? "" : " tbd"}" text-anchor="middle">${e(S.champion ? draftTeamName(S.champion) : "TBD")}</text>`);
  return `<svg class="br-svg" viewBox="0 0 1000 600" role="img" aria-label="${CURRENT_SEASON} Turkey Bowl bracket">${out.join("")}</svg>`;
}
function brFullBracket(){
  const ov = document.createElement("div"); ov.className = "ov br-full";
  ov.innerHTML = `<div class="br-full-in"><div class="br-pic-h"><span class="lbl2">${CURRENT_SEASON} Turkey Bowl bracket · turn your phone sideways for a bigger view</span><button class="btn" type="button">✕ Close</button></div>${brSvg(brState(window.TBC && TBC.bracket), window.TBC && TBC.bracket)}</div>`;
  const close = () => { ov.remove(); document.removeEventListener("tbc-change", redraw); };
  const redraw = () => { const s = ov.querySelector("svg"); if (s) s.outerHTML = brSvg(brState(TBC.bracket), TBC.bracket); };
  ov.querySelector("button").onclick = close; ov.addEventListener("click", e => { if (e.target === ov) close(); });
  document.addEventListener("tbc-change", redraw);
  document.body.appendChild(ov);
}

// ===== Schedule lottery, drawn one by one =====
// An editor taps "Draw next"; the pick saves right away and every open Bracket page (the editor's too) spins and lands on it.
// The reveal screen stays up between draws ("Waiting for the next draw…"); editors can draw the next pick from it.
let BR_ANIM = Promise.resolve();   // reveals play one after another, never on top of each other
async function brDrawNext(btn){
  if (btn) btn.disabled = true;
  try { await TBC.bracketDraw(brTeams(), brFixed()); }
  catch(err){ alert("Couldn't draw: " + (err.code === "permission-denied" ? "you don't have edit access." : err.message)); }
  finally { if (btn) btn.disabled = false; }
}
async function brDrawRest(btn){
  if (!confirm("Draw all the remaining picks at once?")) return;
  if (btn) btn.disabled = true;
  try { await TBC.bracketLottery(brTeams(), brFixed()); }
  catch(err){ if (btn) btn.disabled = false; alert("Couldn't draw: " + (err.code === "permission-denied" ? "you don't have edit access." : err.message)); }
}
// The reveal screen. Opens (or reuses) the overlay and shows the picks drawn so far (no spin).
function brDrawOverlay(drawn, open){
  let ov = document.getElementById("brDrawOv");
  if (!ov) {
    if (!open) return null;
    ov = document.createElement("div"); ov.id = "brDrawOv"; ov.className = "lotto-ov";
    const rows = [["Bye", [0]], ["Bye", [1]], ["Game 1", BR_R1[0]], ["Game 2", BR_R1[1]]];
    ov.innerHTML = `<div class="lotto">
        <div class="lotto-h">🦃 ${CURRENT_SEASON} Schedule Lottery</div>
        <div class="lotto-sub" id="bdSub"></div>
        <div class="lotto-reel" id="bdReel"></div>
        <div class="lotto-name" id="bdName">&nbsp;</div>
        <ol class="lotto-list">${rows.map(([t, ix]) => `<li><span class="lo-k" style="width:62px">${t}</span>${ix.map(i => `<span class="lo-v" data-s="${i}">?</span>`).join(`<small>vs</small>`)}</li>`).join("")}</ol>
        <div class="lotto-btns"><button class="btn primary" id="bdNext" hidden></button> <button class="btn" id="bdClose">Close</button></div></div>`;
    document.body.appendChild(ov); document.body.style.overflow = "hidden";
    ov.querySelector("#bdClose").onclick = () => { ov.remove(); document.body.style.overflow = ""; };
    ov.querySelector("#bdNext").onclick = e => brDrawNext(e.target);
    const reel = ov.querySelector("#bdReel");
    brTeams().forEach(c => { const f = document.createElement("div"); f.className = "lo-face"; f.dataset.c = c; f.appendChild(teamBadge(c)); reel.appendChild(f); });
  }
  ov.querySelectorAll(".lo-v").forEach(v => { const i = +v.dataset.s; if (drawn[i]) { const fx = brFixed(); v.innerHTML = brEsc(draftTeamName(drawn[i])) + (i < fx.length && drawn[i] === fx[i] ? " <small>📌 auto</small>" : ""); v.closest("li").classList.add("set"); } else { v.textContent = "?"; } });
  brDrawState(ov, drawn.length);
  return ov;
}
function brDrawState(ov, n){
  const ed = !!(window.TBC && TBC.canEdit()), nb = ov.querySelector("#bdNext");
  ov.querySelector("#bdSub").innerHTML = n >= 6 ? `The ${CURRENT_SEASON} schedule is set` : n > brFixed().length ? `Waiting for the next draw… <small style="color:var(--muted)">(${BR_DRAWS[n]})</small>` : `Waiting for the first draw… <small style="color:var(--muted)">(${BR_DRAWS[n]})</small>`;
  nb.hidden = !ed || n >= 6; nb.textContent = `🎰 Draw next: ${BR_DRAWS[n] || ""}`;
  const cl = ov.querySelector("#bdClose"); cl.textContent = n >= 6 ? "Done" : "Close"; cl.classList.toggle("primary", n >= 6);
}
const BR_SUBS = BR_DRAWS.map((t, k) => k < 2 ? `The ${k ? "second" : "first"} <b>bye</b> goes to…` : t.replace(/^(Game \d) · (.*)$/, (m, g, w) => `<b>${g}</b> · ${w === "opponent" ? "their opponent" : w}…`));
// Spin through the teams still left and land on pick k.
async function brRevealPick(drawn, k){
  const fx = brFixed();
  if (k < fx.length && drawn[k] === fx[k]) {   // automatic bye: just show it, no spin
    brDrawOverlay(drawn.slice(0, k + 1), true);
    return;
  }
  const ov = brDrawOverlay(drawn.slice(0, k), true), reel = ov.querySelector("#bdReel"), nb = ov.querySelector("#bdNext");
  const faces = [...reel.querySelectorAll(".lo-face")], show = c => { faces.forEach(f => f.classList.toggle("on", f.dataset.c === c)); ov.querySelector("#bdName").textContent = draftTeamName(c) + " · " + c; };
  const left = brTeams().filter(c => !drawn.slice(0, k).includes(c));
  nb.hidden = true;
  ov.querySelector("#bdSub").innerHTML = BR_SUBS[k];
  reel.classList.remove("landed");
  if (left.length > 1) { let d = 55, last = null; while (d < 430 && document.body.contains(ov)) { let x; do { x = left[Math.floor(Math.random() * left.length)]; } while (x === last); show(x); last = x; await sleep(d); d *= 1.12; } }
  if (!document.body.contains(ov)) return;
  show(drawn[k]); reel.classList.add("landed");
  const v = ov.querySelector(`.lo-v[data-s="${k}"]`); v.innerHTML = brEsc(draftTeamName(drawn[k])); v.closest("li").classList.add("set");
  if (k < 2 || k === 5) confetti(ov);
  await sleep(1300);
  if (document.body.contains(ov)) brDrawState(ov, k + 1);
}
// Replay the finished lottery from the start, automatically.
function brReplay(drawn){
  document.getElementById("brDrawOv")?.remove();
  brDrawOverlay([], true).querySelector("#bdNext").hidden = true;
  for (let k = 0; k < drawn.length; k++) BR_ANIM = BR_ANIM.then(() => brRevealPick(drawn, k)).then(() => sleep(300));
}
// Called on every cloud update: play the picks that just came in.
function maybePlaySchedLottery(){
  const B = window.TBC && TBC.bracket;
  if (!window.TBC || !TBC.bracketReady) return;
  const id = B && B.lotteryId ? B.lotteryId : null, drawn = (B && Array.isArray(B.slots)) ? B.slots.slice() : [], n = drawn.length;
  const seen = BR_LOTTO_SEEN; BR_LOTTO_SEEN = {id, n};
  if (seen === undefined) return;                                       // page just loaded: don't replay old picks
  const pg = document.getElementById("pg-bracket"), watching = pg && !pg.hidden && !document.hidden;
  if (!n) { const ov = document.getElementById("brDrawOv"); if (ov && seen.n) { ov.remove(); document.body.style.overflow = ""; } return; }   // started over
  const from = id === seen.id ? seen.n : 0;
  if (n <= from || !watching) { const ov = document.getElementById("brDrawOv"); if (ov) brDrawOverlay(drawn, false); return; }
  if (from === 0) { document.getElementById("brDrawOv")?.remove(); brDrawOverlay([], true); }
  for (let k = from; k < n; k++) BR_ANIM = BR_ANIM.then(() => brRevealPick(drawn, k));
}
document.addEventListener("tbc-change", () => { maybePlaySchedLottery(); renderBracket(); });
document.addEventListener("focusout", e => { const pg = document.getElementById("pg-bracket"); if (BR_PENDING && pg && pg.contains(e.target)) setTimeout(() => { if (!pg.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") renderBracket(); }, 0); });
