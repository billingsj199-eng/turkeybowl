// ===================== MY TEAM (top nav "🏈 My Team") =====================
// Your team's private page: roster with this season's stats, team chat, and a playbook tab (coming later).
// Who sees it: the team's captain account, plus accounts Jack linked to one of its players (links/accounts, kept every season;
// tb-cloud.js turns them into members/<season> from that year's draft). Nobody can open another team's page, the admin included:
// firestore.rules onTeam() guards the chat and anything else in teamspace/<season>/teams/<captain>.
let MT_TAB = "roster";

// Which captain's team a player is on this season (captain = their own team; drafted player = whoever has them now, trades included).
function mtPlayerTeam(name){
  const L = window.TBC && TBC.live; if (!L || !Array.isArray(L.order)) return null;
  if (L.order.includes(name)) return name;
  return playerOwnerOf(L, name) || null;
}
window.tbPlayers = () => players.map(p => p.name);   // every player on the board (for the admin linking list)

// This season's stats for one player (from the Film Room once games are logged)
function mtStats(name){
  const gs = allGamesFor(name).filter(g => (g.season || CURRENT_SEASON) === CURRENT_SEASON);
  const sum = (side, k) => gs.reduce((a, g) => a + ((g[side] || {})[k] || 0), 0);
  const fp = gs.reduce((a, g) => a + SCORING.off(g.off || {}) + SCORING.def(g.def || {}), 0);
  return {gp: gs.length, ppg: gs.length ? fp / gs.length : null, rec: sum("off", "rec"), yds: sum("off", "yds"), td: sum("off", "td"), tkl: sum("def", "tkl"), int: sum("def", "int"), pd: sum("def", "pd")};
}

function renderMyTeam(){
  const root = document.getElementById("pg-myteam"); if (!root || root.hidden) return;
  const active = document.activeElement;
  if (active && root.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.value) return;   // don't wipe a message being typed
  const T = window.TBC, me = T && T.user, cap = T && T.myTeam ? T.myTeam() : null, L = T && T.live;
  // the playbook is an iframe: redrawing would reload it and drop what someone is drawing, so leave it alone while it's open
  const pb = root.querySelector("iframe.mt-pbframe");
  if (MT_TAB === "playbook" && pb && me && pb.dataset.key === mtPbKey(cap, me)) return;
  root.innerHTML = `<header><h1>My <span>Team</span></h1></header>`;
  if (!T || !T.ready) { root.insertAdjacentHTML("beforeend", `<div class="empty">Loading…</div>`); return; }
  if (!me) {
    root.insertAdjacentHTML("beforeend", `<div class="panel mt-gate"><h3>🔒 Your team's private page</h3><div class="psub">Roster and stats, team chat, and the playbook. Sign in with Google to see your team.</div></div>`);
    const b = document.createElement("button"); b.className = "btn primary"; b.textContent = "Sign in"; b.onclick = () => T.signIn(); root.querySelector(".mt-gate").appendChild(b);
    return;
  }
  if (!cap) {
    const pl = T.myPlayer && T.myPlayer();
    root.insertAdjacentHTML("beforeend", `<div class="panel mt-gate"><h3>🔒 Not on a team yet</h3><div class="psub">${pl
      ? `Your account is linked to <b>${esc2(pl)}</b>, who isn't on a ${CURRENT_SEASON} team.`
      : `Your account (${esc2(me.name)}) isn't linked to a player yet. Jack links each player to their Google account; once he does, your team's page shows up here.`}</div></div>`);
    return;
  }
  const S = typeof brState === "function" ? brState(T.bracket) : null;
  const W = S ? Object.values(S.out).filter(x => x.winner === cap).length : 0, Lc = S ? (S.losses[cap] || 0) : 0;
  // header
  const head = document.createElement("div"); head.className = "my-team mt-head"; if (teamColor(cap)) head.style.setProperty("--mt", teamColor(cap));
  head.appendChild(teamBadge(cap));
  head.insertAdjacentHTML("beforeend", `<div class="mt-body"><div class="lbl2">🔒 Private · only your team can see this</div><div class="mt-name">${esc2(draftTeamName(cap))}</div>
    <div class="psub">Captain ${esc2(cap)}${S && (W || Lc) ? ` · ${W}-${Lc} today` : ""}${T.myPlayer && T.myPlayer() ? ` · you: ${esc2(T.myPlayer())}` : ""}</div></div>`);
  root.appendChild(head);
  // tabs
  const tabs = document.createElement("div"); tabs.className = "br-tabs";
  [["roster", "📋 Roster"], ["chat", "💬 Team chat"], ["playbook", "📘 Playbook"]].forEach(([v, t]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn view" + (MT_TAB === v ? " on" : ""); b.textContent = t;
    b.onclick = () => { MT_TAB = v; renderMyTeam(); if (v === "chat") setTimeout(mtScrollChat, 0); };
    tabs.appendChild(b);
  });
  root.appendChild(tabs);
  const pane = document.createElement("div"); pane.className = "panel mt-pane"; root.appendChild(pane);
  if (MT_TAB === "roster") mtRoster(pane, cap, L);
  else if (MT_TAB === "chat") mtChat(pane);
  else mtPlaybook(pane, cap, me);
}

// Team playbook: playbook.html (the 5v5 play designer) in a frame. Plays live in teamspace/<season>/teams/<captain>/plays,
// so each team has its own playbook, starting empty. firestore.rules lets only that team read or change it.
// The playbook frame asks for this to fill "Player at X": your team's captain + roster this season (trades included).
window.tbMyRoster = () => {
  const T = window.TBC, cap = T && T.myTeam ? T.myTeam() : null, L = T && T.live;
  return cap ? [cap, ...(L ? rosterOf(L, cap).map(r => r.name) : [])] : [];
};
const mtPbKey = (cap, me) =>`${CURRENT_SEASON}|${cap}|${me.uid}`;
function mtPlaybook(pane, cap, me){
  const src = `playbook.html?season=${encodeURIComponent(CURRENT_SEASON)}&team=${encodeURIComponent(cap)}`;
  pane.classList.add("mt-pbpane");
  pane.innerHTML = `<div class="mt-pbbar"><a class="mt-pbfull" href="${esc2(src)}" target="_blank" rel="noopener">Full screen ↗</a></div>`;
  const f = document.createElement("iframe");
  f.className = "mt-pbframe"; f.title = "Team playbook"; f.src = src; f.dataset.key = mtPbKey(cap, me);
  pane.appendChild(f);
}

function mtRoster(pane, cap, L){
  const ros = L ? rosterOf(L, cap) : [];
  pane.innerHTML = `<h3>Roster · ${ros.length + 1} players <small class="psub">${CURRENT_SEASON} stats</small></h3>`;
  const wrap = document.createElement("div"); wrap.className = "mt-tbl-wrap";
  const t = document.createElement("table"); t.className = "mt-tbl";
  t.innerHTML = `<thead><tr><th>Player</th><th>Tier</th><th>GP</th><th>FPTS/G</th><th>REC</th><th>YDS</th><th>TD</th><th>TKL</th><th>INT</th><th>PD</th></tr></thead>`;
  const tb = document.createElement("tbody");
  [{name: cap, sub: "Captain · QB"}, ...ros.map(r => ({name: r.name, sub: pickTxt(L, r.i)}))].forEach(r => {
    const p = byName[r.name], s = mtStats(r.name), tr = document.createElement("tr");
    const td0 = document.createElement("td"); const pl = document.createElement("div"); pl.className = "mt-pl";
    if (p) { pl.style.setProperty("--tc", `var(--t-${p.tier})`); pl.appendChild(headshot(p)); }
    pl.insertAdjacentHTML("beforeend", `<div><div class="pname">${esc2(r.name)}</div><div class="psub">${esc2(r.sub)}${colLogo(r.name)}</div></div>`);
    if (p) { pl.style.cursor = "pointer"; pl.onclick = () => openCard(r.name); }
    td0.appendChild(pl); tr.appendChild(td0);
    const n = v => s.gp ? v : "—";
    tr.insertAdjacentHTML("beforeend", `<td>${p ? `<span class="pill" style="--tc:var(--t-${p.tier})">${tlabel(p.tier)}</span>` : ""}</td><td>${s.gp || "—"}</td><td><b>${s.ppg != null ? fmt(s.ppg) : "—"}</b></td><td>${n(s.rec)}</td><td>${n(s.yds)}</td><td>${n(s.td)}</td><td>${n(s.tkl)}</td><td>${n(s.int)}</td><td>${n(s.pd)}</td>`);
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t); pane.appendChild(wrap);
  pane.insertAdjacentHTML("beforeend", `<div class="swipe-hint">← Swipe sideways for all the stats →</div>`);
  pane.insertAdjacentHTML("beforeend", `<div class="psub" style="margin-top:8px">${CURRENT_SEASON} stats fill in as games are logged in the Film Room. Tap a player for their full card.</div>`);
}

function mtChat(pane){
  const T = window.TBC, me = T.user, msgs = T.chat;
  pane.innerHTML = `<h3>💬 Team chat <small class="psub">only your team can read this</small></h3><div class="mt-chat" id="mtChat"></div>
    <form class="mt-send" id="mtSend"><input id="mtMsg" maxlength="500" placeholder="Message your team…" autocomplete="off"><button class="btn primary" type="submit">Send</button></form><div class="psub" id="mtErr"></div>`;
  const box = pane.querySelector("#mtChat");
  if (msgs == null) box.innerHTML = `<div class="mt-empty">Loading…</div>`;
  else if (!msgs.length) box.innerHTML = `<div class="mt-empty">No messages yet. Say something to your team 👋</div>`;
  else {
    let lastDay = "";
    msgs.forEach(m => {
      const d = m.at && m.at.toDate ? m.at.toDate() : new Date(), day = d.toLocaleDateString([], {weekday: "short", month: "short", day: "numeric"});
      if (day !== lastDay) { lastDay = day; box.insertAdjacentHTML("beforeend", `<div class="mt-day">${esc2(day)}</div>`); }
      const mine = m.uid === me.uid, row = document.createElement("div"); row.className = "mt-msg" + (mine ? " me" : "");
      row.innerHTML = `<div class="mt-bub">${mine ? "" : `<div class="mt-who">${esc2(m.name)}</div>`}<div class="mt-txt">${esc2(m.text)}</div><div class="mt-time">${d.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}${mine ? ` · <button type="button" class="mt-del">delete</button>` : ""}</div></div>`;
      const del = row.querySelector(".mt-del"); if (del) del.onclick = async () => { if (!confirm("Delete this message?")) return; try { await T.deleteChat(m.id); } catch(e){ alert(e.message); } };
      box.appendChild(row);
    });
  }
  pane.querySelector("#mtSend").onsubmit = async e => {
    e.preventDefault();
    const inp = pane.querySelector("#mtMsg"), text = inp.value.trim(); if (!text) return;
    inp.value = ""; inp.disabled = true;
    try { await T.sendChat(text); } catch(err){ inp.value = text; pane.querySelector("#mtErr").textContent = err.code === "permission-denied" ? "You can't post in this team's chat." : "Couldn't send: " + err.message; }
    finally { inp.disabled = false; renderMyTeam(); setTimeout(() => { mtScrollChat(); document.getElementById("mtMsg")?.focus(); }, 0); }
  };
  setTimeout(mtScrollChat, 0);
}
const mtScrollChat = () => { const b = document.getElementById("mtChat"); if (b) b.scrollTop = b.scrollHeight; };

let MT_SEEN = 0;
document.addEventListener("tbc-change", () => {
  const n = (window.TBC && TBC.chat || []).length, grew = n > MT_SEEN; MT_SEEN = n;
  renderMyTeam(); if (grew && MT_TAB === "chat") setTimeout(mtScrollChat, 0);
});

// ===================== ADMIN: link players to Google accounts (with suggested matches) =====================
// The admin panel (tb-cloud.js openAdmin) calls mtLinksPanel. For every unlinked player it suggests the signed-in
// account whose name or email looks like theirs; Jack checks it and taps ✓ (or "Link all"). Nothing links without a tap.
const MT_NICK = [["jake","jacob","jakob"],["matt","matthew","mat"],["joe","joseph","joey"],["dan","danny","daniel"],["mike","michael","mikey"],
  ["chris","christopher"],["nick","nicholas","nicolas","nico"],["tom","thomas","tommy"],["will","william","billy","bill","liam"],
  ["jim","jimmy","james","jamie"],["bob","robert","rob","bobby","robbie"],["ben","benjamin","benny"],["sam","samuel","sammy"],
  ["tony","anthony"],["alex","alexander","alec"],["andy","andrew","drew"],["zach","zachary","zack","zac"],["josh","joshua"],
  ["steve","steven","stephen"],["dave","david"],["ed","edward","eddie"],["greg","gregory"],["pat","patrick"],["tim","timothy","timmy"],
  ["ken","kenneth","kenny"],["jon","jonathan","john","johnny"],["shay","shea"],["luke","lucas"],["max","maxwell"],["nate","nathan","nathaniel"],
  ["charlie","charles","chuck"],["jeff","jeffrey"],["rich","richard","rick","ricky"],["ron","ronald","ronnie"],["vince","vincent","vinny"],
  ["frank","francis","frankie"],["gabe","gabriel"],["sean","shawn"],["cam","cameron"],["dom","dominic","dominick"]];
const mtToks = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’.]/g, "").split(/[^a-z]+/).filter(Boolean);
const mtNicks = f => (MT_NICK.find(g => g.includes(f)) || [f]);
const mtSameFirst = (a, b) => a === b || mtNicks(a).includes(b) || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
const mtSameLast = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

// How much an account (name + email) looks like a player: 0-100 plus a short reason.
function mtMatchScore(player, acct){
  const pt = mtToks(player); if (!pt.length) return {s: 0, why: ""};
  const first = pt[0], last = pt.length > 1 ? pt[pt.length - 1] : "", at = mtToks(acct.name);
  let s = 0, why = "";
  const take = (v, w) => { if (v > s) { s = v; why = w; } };
  if (at.length && at.join(" ") === pt.join(" ")) take(100, "same name");
  const hasF = at.some(t => mtSameFirst(t, first)), hasL = !!last && at.some(t => mtSameLast(t, last));
  if (hasF && hasL) take(92, "name matches");
  if (hasL && at.some(t => t === first[0])) take(80, "initial + last name");
  if (last && hasF && at.some(t => t === last[0])) take(72, "first name + last initial");
  if (hasL) take(55, "same last name");
  const e = String(acct.email || "").toLowerCase().split("@")[0].replace(/[^a-z]/g, "");
  if (e && last) {
    const firsts = mtNicks(first).concat(first);
    if (firsts.some(f => e.includes(f + last) || e.includes(last + f))) take(90, "email matches");
    else if (last.length >= 4 && e.includes(last) && (e.startsWith(first[0]) || firsts.some(f => f.length >= 3 && e.includes(f)))) take(80, "email matches");
    else if (firsts.some(f => f.length >= 3 && e.startsWith(f) && e[f.length] === last[0])) take(66, "email looks like it");
    else if (last.length >= 5 && e.includes(last)) take(55, "last name in email");
  }
  return {s, why};
}

// Best guess for each unlinked player among accounts not linked yet. Only confident, one-to-one guesses:
// a player with two close candidates (or an account two players fit about equally) gets no suggestion.
function mtSuggestLinks(names, people, links){
  const linkedP = new Set(Object.values(links || {})), linkedU = new Set(Object.keys(links || {}));
  const pairs = [];
  names.filter(n => !linkedP.has(n)).forEach(n => Object.entries(people).forEach(([u, a]) => {
    if (linkedU.has(u)) return; const m = mtMatchScore(n, a); if (m.s >= 55) pairs.push({n, u, s: m.s, why: m.why});
  }));
  pairs.sort((a, b) => b.s - a.s);
  const out = {}, usedU = new Set(), doneN = new Set();
  for (const p of pairs) {
    if (doneN.has(p.n) || usedU.has(p.u)) continue;
    const rival = pairs.some(q => q !== p && q.s > p.s - 10 &&
      ((q.n === p.n && !usedU.has(q.u)) || (q.u === p.u && q.n !== p.n && !doneN.has(q.n))));
    doneN.add(p.n);
    if (p.s < 66 || rival) { if (rival) usedU.add(p.u); continue; }   // too weak or too close to call: Jack picks from the list
    usedU.add(p.u); out[p.n] = p;
  }
  return out;
}

const MT_SUG_NO = new Set();   // suggestions Jack waved off this visit ("player|uid")
function mtLinksPanel(box, people, links, save){
  links = links || {};
  const names = (window.tbPlayers && window.tbPlayers()) || [], teamOf = n => mtPlayerTeam(n) || "";
  const groups = {}; names.forEach(n => { const t = teamOf(n); (groups[t] = groups[t] || []).push(n); });
  const order = Object.keys(groups).sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  const uidOf = n => Object.keys(links).find(u => links[u] === n) || "";
  const sug = mtSuggestLinks(names, people, links);
  Object.keys(sug).forEach(n => { if (MT_SUG_NO.has(n + "|" + sug[n].u)) delete sug[n]; });
  const nSug = Object.keys(sug).length, nLinked = names.filter(uidOf).length;
  const sorted = Object.entries(people).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const opts = cur => `<option value="">— not linked —</option>${sorted.map(([u, v]) => `<option value="${esc2(u)}" ${u === cur ? "selected" : ""}>${esc2(v.name)} (${esc2(v.email)})${links[u] && u !== cur ? " · now " + esc2(links[u]) : ""}</option>`).join("")}`;
  const row = n => { const s = sug[n];
    return `<div class="adm-row mt-lr${s ? " sug" : ""}"><div class="mt-lr-n"><b>${esc2(n)}</b>${s ? `<div class="mt-sug"><span class="mt-sug-t">💡 <b>${esc2(people[s.u].name)}</b> <small>${esc2(people[s.u].email)} · ${esc2(s.why)}</small></span><span class="mt-sug-b"><button class="obtn solid sm" data-sok="${esc2(n)}">✓ Link</button><button class="obtn sm" data-sno="${esc2(n)}" title="Not them">✗</button></span></div>` : ""}</div>
      <select data-pl="${esc2(n)}">${opts(uidOf(n))}</select></div>`; };
  box.innerHTML = `<div class="sec-t" style="margin:18px 0 4px">Player accounts (My Team) · ${nLinked} of ${names.length} linked</div>
    <div class="ed-hint" style="margin:0 0 8px">Link each player to their Google account. It stays linked every season; each year they see the private My Team page of whatever team drafted them. Nobody, you included, can see another team's page. Friends show up here after they sign in once.</div>
    ${nSug ? `<div class="mt-sugbar"><span>💡 <b>${nSug} suggested match${nSug === 1 ? "" : "es"}</b> from account names and emails. Check each one and tap ✓ Link (✗ if it's wrong), or link them all at once.</span><button class="obtn solid sm" id="mtSugAll">✓ Link all ${nSug}</button></div>` : ""}
    ${order.map(t => `<div class="ed-hint" style="margin:10px 0 4px;font-weight:700;color:var(--ink)">${t ? esc2(window.draftTeamName ? draftTeamName(t) : t) : "Not on a team this season"}</div>` + groups[t].map(row).join("")).join("")}`;
  const commit = async (pairs, lock) => {
    const byUid = {...links};
    pairs.forEach(([player, uid]) => {
      Object.keys(byUid).forEach(u => { if (byUid[u] === player || u === uid) delete byUid[u]; });   // one account per player, one player per account
      if (uid) byUid[uid] = player;
    });
    lock.forEach(el => el.disabled = true);
    try { await save(byUid); links = byUid; } catch(err){ alert("Couldn't save: " + err.message); }
    mtLinksPanel(box, people, links, save);
  };
  box.querySelectorAll("select[data-pl]").forEach(sel => sel.onchange = () => commit([[sel.dataset.pl, sel.value]], [sel]));
  box.querySelectorAll("[data-sok]").forEach(b => b.onclick = () => commit([[b.dataset.sok, sug[b.dataset.sok].u]], [b]));
  box.querySelectorAll("[data-sno]").forEach(b => b.onclick = () => { MT_SUG_NO.add(b.dataset.sno + "|" + sug[b.dataset.sno].u); mtLinksPanel(box, people, links, save); });
  const all = box.querySelector("#mtSugAll");
  if (all) all.onclick = () => commit(Object.keys(sug).map(n => [n, sug[n].u]), [all]);
}
