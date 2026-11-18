// ===================== BRACKET CHALLENGE (Bracket page → "🎯 Bracket Challenge" tab) =====================
// Signed-in people pick the winner of every game before kickoff; a leaderboard scores everyone as real games finish.
// Scoring works points double each round.
//   Round 1 (G1, G2) 10 · Round 2 (Winners R2 G3/G4 + Losers R1 G5/G6) 20 · Round 3 (Winners Final G7, Losers R2 G8) 40
//   Losers Final (G9) 80 · Champion 160  →  a perfect bracket = 420.
// A pick scores when the team you picked wins that game (your team has to win that slot).
// Tiebreaker: total points scored in Game 10 (closest wins).
// Picks are run through the real bracket logic (bracket.js brState), so picking G1's winner fills G3 and G1's loser
// drops into the losers bracket. Stored in challenge/<season>/entries/{uid} (tb-cloud.js). Locks when an editor taps Lock
// or Game 1 kicks off (bracket.js brKickoff, same as the rules); nobody sees anyone else's picks until then.
const CH_POINTS = {g1: 10, g2: 10, g3: 20, g4: 20, g5: 20, g6: 20, g7: 40, g8: 40, g9: 80};
const CH_CHAMP = 160, CH_MAX = Object.values(CH_POINTS).reduce((a, b) => a + b, 0) + CH_CHAMP;
let CH_DRAFT = null;      // {picks, tiebreak} being edited (null = take the saved entry)
let CH_VIEW = null;       // uid of the bracket being looked at on the leaderboard

// Pick percentages from everyone's brackets (anonymous copies, TBC.votes): of the brackets that pick game gid,
// what share have each team winning it. chChampOdds = share picking each team to win it all.
function chOdds(gid){
  const vs = ((window.TBC && TBC.votes) || []).filter(v => v.picks && v.picks[gid]), n = vs.length, c = {};
  vs.forEach(v => { c[v.picks[gid]] = (c[v.picks[gid]] || 0) + 1; });
  return {n, pct: t => n ? Math.round(100 * (c[t] || 0) / n) : 0};
}
function chChampOdds(slots){
  const vs = (window.TBC && TBC.votes) || [], c = {}; let n = 0;
  vs.forEach(v => { const ch = chPickState(v.picks, slots).champion; if (ch) { c[ch] = (c[ch] || 0) + 1; n++; } });
  return {n, list: Object.entries(c).sort((a, b) => b[1] - a[1]).map(([t, k]) => [t, Math.round(100 * k / n)])};
}
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

// "Sat, Nov 28, 10:00 AM" in the viewer's own time zone
const chKoTxt = () => { const ko = TBC.challengeKickoff(); return ko ? new Date(ko).toLocaleString([], {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : "Game 1 kickoff"; };
function renderChallenge(root, S, B, ed){
  const locked = TBC.challengeLocked(), me = TBC.user, teams = S.slots, koTxt = chKoTxt();
  // scoring + status
  const top = document.createElement("div"); top.className = "ch-top";
  top.innerHTML = `<div class="panel ch-rules"><h3>🎯 ${CURRENT_SEASON} Bracket Challenge</h3>
      <div class="psub">Pick every game before kickoff. Points double each round.</div>
      <div class="ch-pts"><span><b>10</b>Round 1<small>G1 · G2</small></span><span><b>20</b>Round 2<small>G3–G6</small></span><span><b>40</b>Round 3<small>G7 · G8</small></span><span><b>80</b>Losers Final<small>G9</small></span><span class="ch-champ-pts"><b>160</b>Champion<small>G10/G11</small></span></div>
      <div class="psub">Perfect bracket = <b>${CH_MAX}</b> points. A pick counts when your team wins that game. Tiebreaker: total points in Game 10.</div>
      ${(() => { const co = chChampOdds(teams); const nv = ((window.TBC && TBC.votes) || []).length;
        return `<div class="ch-odds"><span class="lbl2">${nv} bracket${nv === 1 ? "" : "s"} entered${co.n ? " · picked to win it all" : ""}</span>${co.list.map(([t, p]) => `<span class="ch-oc" style="--team:${teamColor(t) || "#3a4560"}">${esc2(draftTeamName(t))} <b>${p}%</b></span>`).join("")}</div>`; })()}
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

// ===== Picks drawn on the bracket (same layout as the Bracket page graphic, bracket.js BR_POS / BR_LINES) =====
// mode "pick": tap a team to pick it (rows carry data-g / data-t). mode "review": each pick marked ✓ / ✗ against S (real results).
function chSvg(picks, slots, mode, S){
  const ps = chPickState(picks, slots), P = ps.st, e = esc2, out = [];
  const box = id => { const [c, y] = BR_POS[id]; return {x: BRX[c], y}; };
  const mark = gid => { if (mode !== "review") return ""; const mine = ps.clean[gid], real = S.out[gid].winner;
    return !mine ? "" : real ? (real === mine ? "ok" : "no") : (S.losses[mine] || 0) >= 2 ? "no" : ""; };
  BR_LINES.forEach(([f, t, row]) => {
    const a = box(f), b = box(t), x1 = a.x + BRW, y1 = a.y + BRH / 2, x2 = b.x, y2 = b.y + (row ? BRH * 0.75 : BRH * 0.25), xm = x2 - 24;
    out.push(`<path d="M${x1} ${y1} H${xm} V${y2} H${x2}" class="ln${P.out[f].winner ? " lit" : ""}"/>`);
  });
  out.push(`<path d="M${box("g10").x + BRW / 2} ${box("g10").y + BRH + 4} V${box("g11").y - 18}" class="ln dash"/>`);
  out.push(`<text x="16" y="30" class="sec">WINNERS BRACKET</text><text x="16" y="364" class="sec">LOSERS BRACKET</text><text x="${BRX[4]}" y="${BR_POS.g10[1] - 34}" class="sec">CHAMPIONSHIP</text>`);
  out.push(`<text x="16" y="400" class="note">${mode === "pick" ? "Tap a team to pick it." : "✓ right · ✗ wrong"}</text><text x="16" y="418" class="note">${mode === "pick" ? "Losers drop down here." : "Grey = not played yet."}</text>`);
  ["g4", "g3"].forEach(id => { const b = box(id), y = b.y + BRH * 0.25;
    out.push(`<path d="M${b.x - 26} ${y} H${b.x}" class="ln lit"/>`); });
  BR_GAMES.forEach(g => {
    const x = P.out[g.id], b = box(g.id), pts = CH_POINTS[g.id], m = mark(g.id), O = chOdds(g.id);
    const right = !x.needed ? "NOT NEEDED" : g.side === "F" ? (mode === "pick" ? "CHAMPION" : "") : m === "ok" ? "+" + pts : m === "no" ? "✗ 0" : pts + " PTS";
    out.push(`<g class="gm${!x.needed ? " skip" : ""}${m ? " m-" + m : ""}${mode === "pick" && x.needed && x.A && x.B && !x.winner ? " nx" : ""}">
      <text x="${b.x}" y="${b.y - 6}" class="gl">G${g.n}${g.a.slot != null && g.a.slot < 2 ? " · BYE" : ""}</text><text x="${b.x + BRW}" y="${b.y - 6}" class="gl gt pts" text-anchor="end">${right}</text>
      <rect x="${b.x}" y="${b.y}" width="${BRW}" height="${BRH}" rx="8" class="bx"/>
      <line x1="${b.x}" y1="${b.y + BRH / 2}" x2="${b.x + BRW}" y2="${b.y + BRH / 2}" class="mid"/>`);
    [0, 1].forEach(side => {
      const c = side ? x.B : x.A, ty = b.y + side * BRH / 2, picked = c && x.winner === c;
      const cls = !c ? "tbd" : picked ? "win" : x.winner ? "dim" : "tm";
      const pct = c && O.n, mk = picked && m;   // what sits on the right of this line
      if (picked) out.push(`<rect x="${b.x + 1}" y="${ty + 1}" width="${BRW - 2}" height="${BRH / 2 - 2}" rx="6" class="pk${m ? " " + m : ""}"/>`);
      if (c) out.push(`<rect x="${b.x + 1}" y="${ty + 1}" width="5" height="${BRH / 2 - 2}" rx="2" fill="${e(teamColor(c) || "#6c7689")}"/>`);
      out.push(`<text x="${b.x + 13}" y="${ty + 18.5}" class="${cls}">${e(brFit(c ? draftTeamName(c) : brSrc(side ? g.b : g.a), BRW - 13 - (pct ? 44 : 10) - (mk ? 18 : 0)))}</text>`);
      if (mk) out.push(`<text x="${b.x + BRW - 10}" y="${ty + 19}" class="mk ${m}" text-anchor="end">${m === "ok" ? "✓" : "✗"}</text>`);
      if (pct) out.push(`<text x="${b.x + BRW - (mk ? 28 : 9)}" y="${ty + 18.5}" class="pp${O.pct(c) >= 50 ? " hi" : ""}" text-anchor="end">${O.pct(c)}%</text>`);
      if (mode === "pick" && c && x.needed) out.push(`<rect x="${b.x}" y="${ty}" width="${BRW}" height="${BRH / 2}" class="hit" data-g="${g.id}" data-t="${e(c)}"><title>Pick ${e(draftTeamName(c))}</title></rect>`);
    });
    if (g.ifNeeded) out.push(BR_IFNOTE(b.x, b.y + BRH + 16));
    // "vs" (both rosters) sits just outside the box's left edge, clear of the color stripes and the lines
    if (x.needed && (x.A || x.B)) out.push(`<g class="vsb" data-mu="${g.id}"><title>Matchup: both rosters</title><circle cx="${b.x - 13}" cy="${b.y + BRH / 2}" r="10"/><text x="${b.x - 13}" y="${b.y + BRH / 2 + 3.5}" text-anchor="middle">vs</text></g>`);
    out.push(`</g>`);
  });
  const cb = {x: BRX[4], y: 520}, ch = ps.champion, cm = mode === "review" && ch ? (S.champion ? (S.champion === ch ? "ok" : "no") : (S.losses[ch] || 0) >= 2 ? "no" : "") : "";
  out.push(`<rect x="${cb.x}" y="${cb.y}" width="${BRW}" height="84" rx="10" class="champ${ch ? " won" : ""}${cm ? " " + cm : ""}"/>
    <text x="${cb.x + BRW / 2}" y="${cb.y + 20}" class="cl" text-anchor="middle">🏆 ${mode === "pick" ? "YOUR CHAMPION" : "CHAMPION PICK"}</text>
    <text x="${cb.x + BRW / 2}" y="${cb.y + 49}" class="cn${ch ? "" : " tbd"}" text-anchor="middle">${e(ch ? brFit(draftTeamName(ch), BRW - 24, "700 18px Oswald, sans-serif") : "Pick through G10")}</text>
    <text x="${cb.x + BRW / 2}" y="${cb.y + 72}" class="cpt${cm ? " " + cm : ""}" text-anchor="middle">${cm === "ok" ? "✓ +" + CH_CHAMP + " pts" : cm === "no" ? "✗ 0 pts" : CH_CHAMP + " pts"}</text>`);
  return `<div class="br-pic-in"><svg class="br-svg ch-svg" viewBox="-24 0 1024 610" role="img" aria-label="Bracket picks">${out.join("")}</svg></div><div class="swipe-hint">← Swipe sideways for Games 7-11 and your champion →</div>`;
}
let CH_LIST = false;   // list view instead of the bracket (phones)
// "vs" on a game → the matchup pop-up for the two teams in THIS bracket (they can differ from the real bracket)
function chWireVs(host, picks, slots, note){
  host.querySelectorAll(".ch-svg .vsb").forEach(el => el.addEventListener("click", e => {
    e.stopPropagation();
    const x = chPickState(picks, slots).st.out[el.dataset.mu];
    brMatchup(el.dataset.mu, {A: x.A, B: x.B, note});
  }));
}
const chToggle = () => `<div class="ch-tg"><button type="button" class="btn${CH_LIST ? "" : " on"}" data-l="0">Bracket view</button><button type="button" class="btn${CH_LIST ? " on" : ""}" data-l="1">List view</button></div>`;
function chWireToggle(host){ host.querySelectorAll(".ch-tg button").forEach(b => b.onclick = () => { CH_LIST = b.dataset.l === "1"; renderBracket(true); }); }

// The pick-em: every game in order; tap the team you think wins. Later games fill in from your picks.
function chPicker(S){
  const box = document.createElement("div");
  if (!CH_DRAFT) CH_DRAFT = {picks: {...((TBC.myEntry && TBC.myEntry.picks) || {})}, tiebreak: TBC.myEntry ? String(TBC.myEntry.tiebreak) : ""};
  const ps = chPickState(CH_DRAFT.picks, S.slots);
  const saved = TBC.myEntry, same = saved && JSON.stringify(chPickState(saved.picks, S.slots).clean) === JSON.stringify(ps.clean) && String(saved.tiebreak) === CH_DRAFT.tiebreak;
  const nPicked = Object.keys(ps.clean).length, nNeeded = BR_GAMES.filter(g => ps.st.out[g.id].needed).length;
  box.innerHTML = `<div class="ch-mh"><h3>My bracket <small class="psub">${nPicked} of ${nNeeded} picked · one bracket per Google account</small></h3>${chToggle()}</div>`;
  const list = document.createElement("div"); list.className = "ch-games";
  BR_GAMES.forEach(g => {
    const x = ps.st.out[g.id]; if (!x.needed) return;
    const card = document.createElement("div"); card.className = "ch-g" + (ps.clean[g.id] ? " done" : "");
    const O = chOdds(g.id);
    card.innerHTML = `<div class="ch-gh"><b>G${g.n}</b><span>${esc2(g.round)}</span><em>${CH_POINTS[g.id] ? CH_POINTS[g.id] + " pts" : g.side === "F" ? "picks your champion" : ""}</em></div>`;
    const row = document.createElement("div"); row.className = "ch-opts";
    [x.A, x.B].forEach((c, k) => {
      const b = document.createElement("button"); b.type = "button";
      if (!c) { b.className = "ch-opt tbd"; b.disabled = true; b.textContent = brSrc(k ? g.b : g.a); row.appendChild(b); return; }
      b.className = "ch-opt" + (ps.clean[g.id] === c ? " pick" : ps.clean[g.id] ? " not" : "");
      b.appendChild(brTeamChip(c)); if (O.n) b.insertAdjacentHTML("beforeend", `<span class="ch-pp">${O.pct(c)}%</span>`);
      b.onclick = () => { CH_DRAFT.picks[g.id] = c; renderBracket(true); };
      row.appendChild(b);
    });
    card.appendChild(row);
    if (x.A || x.B) { const mb = document.createElement("button"); mb.type = "button"; mb.className = "btn br-mu-btn"; mb.textContent = "👥 Matchup · rosters"; mb.onclick = () => brMatchup(g.id, {A: x.A, B: x.B, note: "In your bracket"}); card.appendChild(mb); }
    list.appendChild(card);
  });
  if (CH_LIST) box.appendChild(list);
  else {
    box.insertAdjacentHTML("beforeend", `<div class="psub" style="margin-bottom:6px">Tap the team you think wins each game. Your picks move along the lines; losers drop to the losers bracket.</div>` + chSvg(CH_DRAFT.picks, S.slots, "pick", S));
    box.querySelectorAll(".ch-svg .hit").forEach(h => h.addEventListener("click", () => { CH_DRAFT.picks[h.dataset.g] = h.dataset.t; renderBracket(true); }));
    chWireVs(box, CH_DRAFT.picks, S.slots, "In your bracket");
  }
  chWireToggle(box);
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
  box.insertAdjacentHTML("beforeend", chToggle());
  box.insertAdjacentHTML("beforeend", `<div class="ch-ro-h"><b>${sc.pts}</b> pts · ${sc.correct} right · ${sc.wrong} wrong · max ${sc.max}${sc.perfect && sc.decided ? " · 🔥 perfect so far" : ""}<span class="psub">Tiebreaker ${entry.tiebreak}</span></div>`);
  if (!CH_LIST) { box.insertAdjacentHTML("beforeend", chSvg(entry.picks, S.slots, "review", S)); chWireToggle(box); chWireVs(box, entry.picks, S.slots, (entry.name || "Their") + "'s bracket"); return box; }
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
  chWireToggle(box);
  return box;
}
