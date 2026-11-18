// ===================== BRACKET (Turkey Bowl tournament, double elimination, 6 teams) =====================
// Stored in the cloud as bracket/<season> (tb-cloud.js): {slots: [6 captains], lotteryId, start "HH:MM", minutes, results}.
// The schedule lottery shuffles the 6 teams into slots: slots 1-2 get byes, slot 3 v 6 and slot 4 v 5 play first.
// One field, back to back: game N starts about start + (N-1) * minutes.
// Editors (and Jack) enter scores; the bracket fills itself in. A result can only be changed or cleared while no later
// game that depends on it has a result (clear the later game first).
// Teams = the live draft's captains (draft/<season>.order), named and colored like the rest of the site.

// a/b: {slot: i} = team in that lottery slot, {w: "gX"} = winner of game X, {l: "gX"} = loser of game X.
const BR_GAMES = [
  {id: "g1",  n: 1,  round: "Winners R1",    side: "W", a: {slot: 2}, b: {slot: 5}},
  {id: "g2",  n: 2,  round: "Winners R1",    side: "W", a: {slot: 3}, b: {slot: 4}},
  {id: "g3",  n: 3,  round: "Winners R2",    side: "W", a: {slot: 0}, b: {w: "g2"}},
  {id: "g4",  n: 4,  round: "Winners R2",    side: "W", a: {slot: 1}, b: {w: "g1"}},
  {id: "g5",  n: 5,  round: "Losers R1",     side: "L", a: {l: "g3"}, b: {l: "g1"}},
  {id: "g6",  n: 6,  round: "Losers R1",     side: "L", a: {l: "g4"}, b: {l: "g2"}},
  {id: "g7",  n: 7,  round: "Losers R2",     side: "L", a: {w: "g5"}, b: {w: "g6"}},
  {id: "g8",  n: 8,  round: "Winners Final", side: "W", a: {w: "g3"}, b: {w: "g4"}},
  {id: "g9",  n: 9,  round: "Losers Final",  side: "L", a: {l: "g8"}, b: {w: "g7"}},
  {id: "g10", n: 10, round: "Championship",  side: "F", a: {w: "g8"}, b: {w: "g9"}},
  {id: "g11", n: 11, round: "Championship (if necessary)", side: "F", a: {w: "g8"}, b: {w: "g9"}, ifNeeded: true},
];
const BR_BY = Object.fromEntries(BR_GAMES.map(g => [g.id, g]));
// where each game's winner / loser goes next (for the little "→" hints)
const brNext = (gid, wl) => { const g = BR_GAMES.find(x => !x.ifNeeded && [x.a, x.b].some(s => s[wl] === gid)); return g ? "G" + g.n : wl === "l" ? "out" : ""; };

// Everything about the bracket from the saved doc: teams in each game, winners, who's alive, the champion.
function brState(B){
  const slots = (B && B.slots) || [], res = (B && B.results) || {}, out = {};
  const who = s => s.slot != null ? (slots[s.slot] || null) : s.w ? (out[s.w] && out[s.w].winner) : (out[s.l] && out[s.l].loser);
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
  return {slots, out, champion, losses, next: next && out[next.id]};
}
// games whose teams come from this game's result
const brDependents = gid => BR_GAMES.filter(x => [x.a, x.b].some(s => s.w === gid || s.l === gid) || (gid === "g10" && x.id === "g11"));

const brTime = (B, n) => {
  const start = B && typeof B.start === "string" ? B.start : "10:00";   // Game 1 at 10 AM until someone changes it
  if (!start) return "";
  const [h, m] = start.split(":").map(Number), t = h * 60 + m + (n - 1) * ((B && B.minutes) || 20);
  const hh = Math.floor(t / 60) % 24, mm = t % 60;
  return `${(hh % 12) || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
};
const brTeams = () => (window.TBC && TBC.live && Array.isArray(TBC.live.order) && TBC.live.order.length ? TBC.live.order : captains).slice();
const brEsc = s => esc2(s);
let BR_EDIT = null;            // game id whose score editor is open
let BR_LOTTO_SEEN;             // lottery id already known (undefined = not loaded yet: don't auto-play old ones)
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

  const wrap = document.createElement("div"); wrap.className = "br-top";
  // ---- lottery / byes ----
  const lot = document.createElement("div"); lot.className = "panel br-lot";
  if (!S.slots.length) {
    lot.innerHTML = `<h3>🎰 Schedule lottery</h3><div class="psub">Picks the 2 teams with byes and every first-round matchup. ${ed ? "Everyone on this page watches it happen." : "Stay on this page to watch it live."}</div>`;
  } else {
    lot.innerHTML = `<h3>🎰 Schedule lottery</h3>
      <div class="br-byes"><span class="lbl2">Byes</span></div>
      <div class="br-r1"><div><span class="lbl2">Game 1</span></div><div><span class="lbl2">Game 2</span></div></div>`;
    const by = lot.querySelector(".br-byes"); [0, 1].forEach(i => by.appendChild(brTeamChip(S.slots[i])));
    const r1 = lot.querySelectorAll(".br-r1 > div");
    [[2, 5], [3, 4]].forEach(([p, q], k) => { r1[k].append(brTeamChip(S.slots[p]), Object.assign(document.createElement("span"), {className: "br-vs", textContent: "vs"}), brTeamChip(S.slots[q])); });
  }
  const lb = document.createElement("div"); lb.className = "row-btns";
  const played = Object.keys((B && B.results) || {}).length;
  if (ed) {
    const run = document.createElement("button"); run.className = "btn primary"; run.textContent = S.slots.length ? "🎰 Re-run lottery" : "🎰 Run schedule lottery";
    run.disabled = played > 0; if (played) run.title = "Locked: games have been played";
    run.onclick = async () => {
      if (!confirm(`Run the ${CURRENT_SEASON} schedule lottery now?\n\nIt picks the 2 bye teams and the first-round games, and everyone on the Bracket page watches.${S.slots.length ? "\n\nThis replaces the last result." : ""}`)) return;
      run.disabled = true;
      try { await TBC.bracketLottery(teams); } catch(err){ run.disabled = false; alert("Couldn't run the lottery: " + (err.code === "permission-denied" ? "you don't have edit access." : err.message)); }
    };
    lb.appendChild(run);
  }
  if (S.slots.length) { const rp = document.createElement("button"); rp.className = "btn"; rp.textContent = "▶ Replay lottery"; rp.onclick = () => playSchedLottery(S.slots); lb.appendChild(rp); }
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
    s.innerHTML = `<span class="lbl">Times</span> Game 1 at <input type="time" id="brStart" value="${(B && typeof B.start === "string") ? B.start : "10:00"}"> · <input type="number" id="brMin" min="10" max="240" value="${(B && B.minutes) || 20}"> min per game <button class="btn" id="brSetSave">Save times</button> <span class="psub" id="brSetMsg"></span>`;
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

  // ---- bracket view ----
  root.insertAdjacentHTML("beforeend", `<h2 class="br-h">Bracket</h2>`);
  const cols = (title, ids, cls = "") => `<div class="br-col ${cls}"><div class="br-colh">${title}</div>${ids.map(id => `<div class="br-slot" data-g="${id}"></div>`).join("")}</div>`;
  const bw = document.createElement("div"); bw.className = "br-tree";
  bw.innerHTML = `<div class="br-sec"><div class="br-sech">Winners bracket</div><div class="br-cols">${cols("Round 1", ["g1", "g2"])}${cols("Round 2", ["g4", "g3"])}${cols("Final", ["g8"])}</div></div>
    <div class="br-sec"><div class="br-sech">Losers bracket</div><div class="br-cols">${cols("Round 1", ["g5", "g6"])}${cols("Round 2", ["g7"])}${cols("Final", ["g9"])}</div></div>
    <div class="br-sec"><div class="br-sech">Championship</div><div class="br-cols">${cols("Game 10", ["g10"])}${cols("Game 11", ["g11"], "if")}</div></div>`;
  bw.querySelectorAll(".br-slot").forEach(sl => sl.appendChild(brGameCard(S.out[sl.dataset.g], S, B, false)));
  root.appendChild(bw);
}

// ===== Schedule lottery reveal: byes first, then the first-round games. Played for everyone on the Bracket page. =====
async function playSchedLottery(slots){
  if (!slots || slots.length !== 6 || document.getElementById("lottoOv")) return;
  const ov = document.createElement("div"); ov.id = "lottoOv"; ov.className = "lotto-ov";
  const rows = [["Bye", [0]], ["Bye", [1]], ["Game 1", [2, 5]], ["Game 2", [3, 4]]];
  ov.innerHTML = `<div class="lotto">
      <div class="lotto-h">🦃 ${CURRENT_SEASON} Schedule Lottery</div>
      <div class="lotto-sub" id="loSub">Shuffling the teams…</div>
      <div class="lotto-reel" id="loReel"></div>
      <div class="lotto-name" id="loName">&nbsp;</div>
      <ol class="lotto-list" id="loList">${rows.map(([t, ix], k) => `<li data-k="${k}"><span class="lo-k" style="width:62px">${t}</span>${ix.map(i => `<span class="lo-v" data-s="${i}">?</span>`).join(`<small>vs</small>`)}</li>`).join("")}</ol>
      <div class="lotto-btns"><button class="btn" id="loSkip">Skip to results</button></div></div>`;
  document.body.appendChild(ov); document.body.style.overflow = "hidden";
  let skip = false, closed = false;
  const close = () => { closed = true; ov.remove(); document.body.style.overflow = ""; };
  ov.querySelector("#loSkip").onclick = () => { if (skip) close(); else skip = true; };
  const reel = ov.querySelector("#loReel"), faces = {};
  slots.forEach(c => { const f = document.createElement("div"); f.className = "lo-face"; f.appendChild(teamBadge(c)); reel.appendChild(f); faces[c] = f; });
  const show = c => { Object.values(faces).forEach(f => f.classList.remove("on")); faces[c].classList.add("on"); ov.querySelector("#loName").textContent = draftTeamName(c) + " · " + c; };
  const fill = i => { const v = ov.querySelector(`.lo-v[data-s="${i}"]`); v.innerHTML = brEsc(draftTeamName(slots[i])); v.closest("li").classList.add("set"); };
  const order = [0, 1, 2, 5, 3, 4], left = [...slots];
  const subs = {0: "The first <b>bye</b> goes to…", 1: "The second <b>bye</b> goes to…", 2: "<b>Game 1</b> · first team…", 5: "<b>Game 1</b> · their opponent…", 3: "<b>Game 2</b> · first team…", 4: "<b>Game 2</b> · their opponent…"};
  await sleep(skip ? 0 : 900);
  for (const i of order) {
    if (closed) return;
    const c = slots[i];
    if (skip) { fill(i); continue; }
    ov.querySelector("#loSub").innerHTML = subs[i];
    reel.classList.remove("landed");
    if (left.length > 1) { let d = 55, last = null; while (d < 420 && !skip) { let x; do { x = left[Math.floor(Math.random() * left.length)]; } while (x === last && left.length > 1); show(x); last = x; await sleep(d); d *= 1.12; } }
    if (skip) { fill(i); continue; }
    show(c); reel.classList.add("landed"); fill(i); left.splice(left.indexOf(c), 1);
    if (i < 2) confetti(ov);
    await sleep(1100);
  }
  if (closed) return;
  ov.querySelector("#loSub").innerHTML = `The ${CURRENT_SEASON} schedule is set`;
  const b = ov.querySelector("#loSkip"); b.textContent = "Done"; b.classList.add("primary"); b.onclick = close;
}
function maybePlaySchedLottery(){
  const B = window.TBC && TBC.bracket;
  if (!window.TBC || !TBC.bracketReady) return;
  const id = B && B.lotteryId ? B.lotteryId : null;
  if (BR_LOTTO_SEEN === undefined) { BR_LOTTO_SEEN = id; return; }
  if (id && id !== BR_LOTTO_SEEN) { BR_LOTTO_SEEN = id; const pg = document.getElementById("pg-bracket"); if (pg && !pg.hidden && !document.hidden) playSchedLottery(B.slots); }
}
document.addEventListener("tbc-change", () => { maybePlaySchedLottery(); renderBracket(); });
document.addEventListener("focusout", e => { const pg = document.getElementById("pg-bracket"); if (BR_PENDING && pg && pg.contains(e.target)) setTimeout(() => { if (!pg.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") renderBracket(); }, 0); });
