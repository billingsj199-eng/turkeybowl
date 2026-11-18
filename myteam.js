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
  else pane.innerHTML = `<h3>📘 Playbook</h3><div class="mt-empty">The playbook goes here. Jack will upload it before the tournament. Only your team will be able to see it.</div>`;
}

function mtRoster(pane, cap, L){
  const ros = L ? rosterOf(L, cap) : [];
  pane.innerHTML = `<h3>Roster · ${ros.length + 1} players <small class="psub">${CURRENT_SEASON} stats</small></h3>`;
  const wrap = document.createElement("div"); wrap.className = "mt-tbl-wrap";
  const t = document.createElement("table"); t.className = "mt-tbl";
  t.innerHTML = `<thead><tr><th>Player</th><th>Tier</th><th>GP</th><th>FPTS/G</th><th>REC</th><th>YDS</th><th>TD</th><th>TKL</th><th>INT</th><th>PD</th></tr></thead>`;
  const tb = document.createElement("tbody");
  [{name: cap, sub: "Captain · QB"}, ...ros.map(r => ({name: r.name, sub: "Pick " + pickLabel(L, r.i)}))].forEach(r => {
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
