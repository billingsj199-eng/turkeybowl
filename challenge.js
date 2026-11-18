// ===================== BRACKET CHALLENGE (Bracket page → "🎯 Bracket Challenge" tab) =====================
// Signed-in people pick the winner of every game before kickoff; a leaderboard scores everyone as real games finish.
// Scoring works like ESPN's Tournament Challenge: points double each round.
//   Round 1 (G1, G2) 10 · Round 2 (Winners R2 G3/G4 + Losers R1 G5/G6) 20 · Round 3 (Winners Final G7, Losers R2 G8) 40
//   Losers Final (G9) 80 · Champion 160  →  a perfect bracket = 420.
// A pick scores when the team you picked wins that game (like ESPN: your team has to win that slot).
// Tiebreaker: total points scored in Game 10 (closest wins).
// Picks are run through the real bracket logic (bracket.js brState), so picking G1's winner fills G3 and G1's loser
// drops into the losers bracket. Stored in challenge/<season>/entries/{uid} (tb-cloud.js). Locks when an editor taps Lock
// or Game 1 kicks off (bracket.js brKickoff, same as the rules); nobody sees anyone else's picks until then.
const CH_POINTS = {g1: 10, g2: 10, g3: 20, g4: 20, g5: 20, g6: 20, g7: 40, g8: 40, g9: 80};
const CH_CHAMP = 160, CH_MAX = Object.values(CH_POINTS).reduce((a, b) => a + b, 0) + CH_CHAMP;
let CH_DRAFT = null;      // {picks, tiebreak} being edited (null = take the saved entry)
let CH_VIEW = null;       // uid of the bracket being looked at on the leaderboard

// Run picks through the bracket like results. Picks that no longer fit (an earlier pick changed) are dropped.
function chPickState(picks, slots){
  const base = {slots, results: {}}, clean = {};
  for (const g of BR_GAMES) {
    const x = brState(base).out[g.id];
    if (!x.needed) continue;
    const p = picks && picks[g.id];
    if (x.A && x.B && (p === x.A || p === x.B)) { clean[g.id] = p; base.results[g.id] = {a: x.A, b: x.B, sa: p === x.A ? 1 : 0, sb: p === x.B ? 1 : 0}; }
  }
  const st = brState(base);
  return {st, clean, champion: st.champion};
}
// Score an entry against the real results. max = points still possible.
function chScore(entry, S){
  const ps = chPickState(entry.picks, S.slots), picks = ps.clean;
  let pts = 0, correct = 0, wrong = 0, max = 0;
  const alive = c => c && (S.losses[c] || 0) < 2;
  Object.entries(CH_POINTS).forEach(([gid, p]) => {
    const x = S.out[gid], mine = picks[gid];
    if (x.winner) { if (mine === x.winner) { pts += p; correct++; } else wrong++; }
    else if (alive(mine) && (!x.A || !x.B || x.A === mine || x.B === mine)) max += p;
  });
  if (S.champion) { if (ps.champion === S.champion) { pts += CH_CHAMP; correct++; } else wrong++; }
  else if (alive(ps.champion)) max += CH_CHAMP;
  return {pts, max: pts + max, correct, wrong, decided: correct + wrong, perfect: wrong === 0 && !!ps.champion, champ: ps.champion, picks};
}
const chRound = gid => ({10: "Round 1", 20: "Round 2", 40: "Round 3", 80: "Losers Final"})[CH_POINTS[gid]];

// "Thu, Nov 26, 10:00 AM" in the viewer's own time zone
const chKoTxt = () => { const ko = TBC.challengeKickoff(); return ko ? new Date(ko).toLocaleString([], {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : "Game 1 kickoff"; };
function renderChallenge(root, S, B, ed){
  const locked = TBC.challengeLocked(), me = TBC.user, teams = S.slots, koTxt = chKoTxt();
  // scoring + status
  const top = document.createElement("div"); top.className = "ch-top";
  top.innerHTML = `<div class="panel ch-rules"><h3>🎯 ${CURRENT_SEASON} Bracket Challenge</h3>
      <div class="psub">Pick every game before kickoff. Points double each round, like ESPN's Tournament Challenge.</div>
      <div class="ch-pts"><span><b>10</b>Round 1<small>G1 · G2</small></span><span><b>20</b>Round 2<small>G3–G6</small></span><span><b>40</b>Round 3<small>G7 · G8</small></span><span><b>80</b>Losers Final<small>G9</small></span><span class="ch-champ-pts"><b>160</b>Champion<small>G10/G11</small></span></div>
      <div class="psub">Perfect bracket = <b>${CH_MAX}</b> points. A pick counts when your team wins that game. Tiebreaker: total points in Game 10.</div>
      <div class="ch-lock ${locked ? "on" : ""}">${locked ? "🔒 Brackets are locked. Good luck!" : `🟢 Open: make or change your picks until Game 1 kicks off (${koTxt}). Everyone's brackets show up then.`}</div></div>`;
  if (ed) {
    const lb = document.createElement("div"); lb.className = "row-btns";
    const manual = !!(TBC.challenge && TBC.challenge.locked), played = Object.keys((B && B.results) || {}).length > 0;
    const b = document.createElement("button"); b.className = "btn" + (manual ? "" : " primary"); b.textContent = manual ? "🔓 Unlock brackets" : "🔒 Lock brackets now";
    b.disabled = played; if (played) b.title = "Locked for good: games have been played";
    b.onclick = async () => { if (!confirm(manual ? "Unlock the Bracket Challenge so people can change picks again?" : "Lock the Bracket Challenge? Nobody can change picks after this, and everyone's brackets become visible.")) return;
      b.disabled = true; try { await TBC.setChallengeLock(!manual); } catch(err){ b.disabled = false; alert(err.code === "permission-denied" ? "You don't have edit access." : err.message); } };
    lb.appendChild(b); top.querySelector(".ch-rules").appendChild(lb);
  }
  root.appendChild(top);
  if (teams.length !== 6) { root.insertAdjacentHTML("beforeend", `<div class="empty">Picks open once the schedule lottery is drawn.</div>`); return; }

  const wrap = document.createElement("div"); wrap.className = "ch-wrap";
  // ---- my bracket ----
  const mine = document.createElement("div"); mine.className = "panel ch-mine";
  if (!me) {
    mine.innerHTML = `<h3>My bracket</h3><div class="psub" style="margin-bottom:10px">Sign in with Google to make your picks${locked ? " (picks are locked now, but you can still follow the leaderboard)" : ""}.</div>`;
    if (!locked) { const si = document.createElement("button"); si.className = "btn primary"; si.textContent = "Sign in to play"; si.onclick = () => TBC.signIn(); mine.appendChild(si); }
  } else if (locked) {
    mine.innerHTML = `<h3>My bracket</h3>`;
    if (TBC.myEntry) mine.appendChild(chReadOnly(TBC.myEntry, S)); else mine.insertAdjacentHTML("beforeend", `<div class="psub">You didn't enter a bracket this year.</div>`);
  } else mine.appendChild(chPicker(S));
  wrap.appendChild(mine);

  // ---- leaderboard ----
  const lb = document.createElement("div"); lb.className = "panel ch-board";
  if (!locked || !TBC.entries) {
    lb.innerHTML = `<h3>Leaderboard</h3><div class="psub">🔒 Everyone's brackets show up here at Game 1 kickoff (${koTxt}), so nobody can copy.${me && TBC.myEntry ? "<br><b>You're in ✓</b>" : ""}</div>`;
  } else {
    const tbTotal = S.out.g10.r ? S.out.g10.r.sa + S.out.g10.r.sb : null;
    const rows = TBC.entries.map(e => ({e, s: chScore(e, S)}))
      .sort((a, b) => b.s.pts - a.s.pts || (tbTotal == null ? 0 : Math.abs(a.e.tiebreak - tbTotal) - Math.abs(b.e.tiebreak - tbTotal)) || b.s.max - a.s.max || a.e.name.localeCompare(b.e.name));
    const perfect = rows.filter(r => r.s.perfect).length, decided = rows.length ? rows[0].s.decided : 0;
    lb.innerHTML = `<h3>Leaderboard <small class="psub">${rows.length} bracket${rows.length === 1 ? "" : "s"}</small></h3>
      <div class="ch-perfect">${!rows.length ? "No brackets were entered." : S.champion ? (perfect ? `🏆 ${perfect === 1 ? "A PERFECT BRACKET!" : perfect + " perfect brackets!"}` : "No perfect brackets this year.") : decided ? (perfect ? `🔥 ${perfect} perfect bracket${perfect === 1 ? "" : "s"} still alive` : "💀 No perfect brackets left") : `🔥 Everyone is perfect… for now`}</div>`;
    const tbl = document.createElement("div"); tbl.className = "ch-rows";
    let rank = 0, prev = null;
    rows.forEach((r, k) => {
      const key = r.s.pts + "|" + (tbTotal == null ? "" : Math.abs(r.e.tiebreak - tbTotal)); if (key !== prev) { rank = k + 1; prev = key; }
      const d = document.createElement("button"); d.type = "button"; d.className = "ch-row" + (me && r.e.uid === me.uid ? " me" : "") + (CH_VIEW === r.e.uid ? " on" : "");
      d.innerHTML = `<span class="ch-rk">${rank}</span><span class="ch-nm">${esc2(r.e.name)}${r.s.perfect && r.s.decided ? " 🔥" : ""}</span>`;
      const cb = document.createElement("span"); cb.className = "ch-cp"; if (r.s.champ) cb.appendChild(brTeamChip(r.s.champ)); d.appendChild(cb);
      d.insertAdjacentHTML("beforeend", `<span class="ch-sc"><b>${r.s.pts}</b><small>max ${r.s.max}</small></span>`);
      d.onclick = () => { CH_VIEW = CH_VIEW === r.e.uid ? null : r.e.uid; renderBracket(true); };
      tbl.appendChild(d);
      if (CH_VIEW === r.e.uid) { const v = document.createElement("div"); v.className = "ch-view"; v.appendChild(chReadOnly(r.e, S)); tbl.appendChild(v); }
    });
    lb.appendChild(tbl);
    lb.insertAdjacentHTML("beforeend", `<div class="psub" style="margin-top:8px">Tap a name to see their bracket. Max = points they can still reach.${tbTotal != null ? ` Game 10 total: ${tbTotal} (tiebreaker).` : ""}</div>`);
  }
  wrap.appendChild(lb);
  root.appendChild(wrap);
}

// The pick-em: every game in order; tap the team you think wins. Later games fill in from your picks.
function chPicker(S){
  const box = document.createElement("div");
  if (!CH_DRAFT) CH_DRAFT = {picks: {...((TBC.myEntry && TBC.myEntry.picks) || {})}, tiebreak: TBC.myEntry ? String(TBC.myEntry.tiebreak) : ""};
  const ps = chPickState(CH_DRAFT.picks, S.slots);
  const saved = TBC.myEntry, same = saved && JSON.stringify(chPickState(saved.picks, S.slots).clean) === JSON.stringify(ps.clean) && String(saved.tiebreak) === CH_DRAFT.tiebreak;
  const nPicked = Object.keys(ps.clean).length, nNeeded = BR_GAMES.filter(g => ps.st.out[g.id].needed).length;
  box.innerHTML = `<h3>My bracket <small class="psub">${nPicked} of ${nNeeded} picked</small></h3>`;
  const list = document.createElement("div"); list.className = "ch-games";
  BR_GAMES.forEach(g => {
    const x = ps.st.out[g.id]; if (!x.needed) return;
    const card = document.createElement("div"); card.className = "ch-g" + (ps.clean[g.id] ? " done" : "");
    card.innerHTML = `<div class="ch-gh"><b>G${g.n}</b><span>${esc2(g.round)}</span><em>${CH_POINTS[g.id] ? CH_POINTS[g.id] + " pts" : g.side === "F" ? "picks your champion" : ""}</em></div>`;
    const row = document.createElement("div"); row.className = "ch-opts";
    [x.A, x.B].forEach((c, k) => {
      const b = document.createElement("button"); b.type = "button";
      if (!c) { b.className = "ch-opt tbd"; b.disabled = true; b.textContent = brSrc(k ? g.b : g.a); row.appendChild(b); return; }
      b.className = "ch-opt" + (ps.clean[g.id] === c ? " pick" : ps.clean[g.id] ? " not" : "");
      b.appendChild(brTeamChip(c));
      b.onclick = () => { CH_DRAFT.picks[g.id] = c; renderBracket(true); };
      row.appendChild(b);
    });
    card.appendChild(row); list.appendChild(card);
  });
  box.appendChild(list);
  const foot = document.createElement("div"); foot.className = "ch-foot";
  foot.innerHTML = `<div class="ch-champ-row"><span class="lbl2">Your champion</span><span id="chChamp"></span></div>
    <label class="ch-tb">Tiebreaker: total points in Game 10 <input type="number" inputmode="numeric" min="0" max="300" id="chTb" value="${esc2(CH_DRAFT.tiebreak)}" placeholder="e.g. 42"></label>
    <div class="row-btns" style="margin:8px 0 0"><button class="btn primary" id="chSave">${saved ? "Save changes" : "Submit my bracket"}</button>${nPicked ? `<button class="btn" id="chClear">Clear picks</button>` : ""}</div>
    <div class="psub" id="chMsg">${saved ? (same ? `✅ Saved. You can change it until ${chKoTxt()}.` : "You have unsaved changes.") : "Not submitted yet."}</div>`;
  const cc = foot.querySelector("#chChamp"); if (ps.champion) cc.appendChild(brTeamChip(ps.champion)); else cc.textContent = "pick through Game 10";
  const tb = foot.querySelector("#chTb"); tb.oninput = () => { CH_DRAFT.tiebreak = tb.value.trim(); };
  const msg = t => { foot.querySelector("#chMsg").textContent = t; };
  foot.querySelector("#chSave").onclick = async e => {
    if (!ps.champion) return msg(`Pick every game first (${nNeeded - nPicked} left).`);
    if (!/^\d{1,3}$/.test(CH_DRAFT.tiebreak) || +CH_DRAFT.tiebreak > 300) return msg("Enter the tiebreaker: total points you think Game 10 has (0-300).");
    e.target.disabled = true; msg("Saving…");
    try { await TBC.saveEntry(ps.clean, +CH_DRAFT.tiebreak); CH_DRAFT = null; renderBracket(true); }
    catch(err){ e.target.disabled = false; msg(err.code === "permission-denied" ? "Picks are locked now." : "Couldn't save: " + err.message); }
  };
  const cl = foot.querySelector("#chClear"); if (cl) cl.onclick = () => { if (confirm("Clear all your picks? (Your saved bracket stays until you save.)")) { CH_DRAFT = {picks: {}, tiebreak: CH_DRAFT.tiebreak}; renderBracket(true); } };
  box.appendChild(foot);
  return box;
}

// Someone's bracket, read-only, marked against the real results.
function chReadOnly(entry, S){
  const sc = chScore(entry, S), ps = chPickState(entry.picks, S.slots), box = document.createElement("div"); box.className = "ch-ro";
  box.insertAdjacentHTML("beforeend", `<div class="ch-ro-h"><b>${sc.pts}</b> pts · ${sc.correct} right · ${sc.wrong} wrong · max ${sc.max}${sc.perfect && sc.decided ? " · 🔥 perfect so far" : ""}<span class="psub">Tiebreaker ${entry.tiebreak}</span></div>`);
  BR_GAMES.forEach(g => {
    const p = ps.clean[g.id]; if (!p || g.side === "F") return;
    const real = S.out[g.id].winner, st = real ? (real === p ? "ok" : "no") : (S.losses[p] || 0) >= 2 ? "no" : "";
    const r = document.createElement("div"); r.className = "ch-ro-r " + st;
    r.innerHTML = `<span class="ch-ro-g">G${g.n}</span>`; r.appendChild(brTeamChip(p));
    r.insertAdjacentHTML("beforeend", `<span class="ch-ro-p">${st === "ok" ? "+" + CH_POINTS[g.id] : st === "no" ? "✗" : CH_POINTS[g.id]}</span>`);
    box.appendChild(r);
  });
  const st = S.champion ? (S.champion === ps.champion ? "ok" : "no") : ps.champion && (S.losses[ps.champion] || 0) >= 2 ? "no" : "";
  const r = document.createElement("div"); r.className = "ch-ro-r champ " + st; r.innerHTML = `<span class="ch-ro-g">🏆</span>`;
  if (ps.champion) r.appendChild(brTeamChip(ps.champion));
  r.insertAdjacentHTML("beforeend", `<span class="ch-ro-p">${st === "ok" ? "+" + CH_CHAMP : st === "no" ? "✗" : CH_CHAMP}</span>`);
  box.appendChild(r);
  return box;
}
