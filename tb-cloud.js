// ===================== TURKEY BOWL CLOUD (sign-in, nicknames, comps) =====================
// Firebase project "gallturkeybowl" (Turkey Bowl only). Rules live in firestore.rules.
//   players/{slug}  {num, age, ht "5-11", wt, nickname, comp:{name,team,league,id,img}|null, college:{name,id|null}|null, tier, name+added (players added on the site), by, at}
//   board/order     {order: [slug, ...], by, at}  - drag-and-drop order on the Draft Board (tiers stay on players/{slug})
//   draft/<season>  the live draft: {status: "live"|"done", order: [captains], pool: [players], picks: [names],
//                   owners: {"<pick index>": captain} (traded picks), moved: {player: captain} (traded players), tradesDone: [trade ids], by, at}
//   trades/{id}     trade offers: {season, from, to, givePicks/getPicks: ["<pick index>"], givePlayers/getPlayers: [names],
//                   givePlayerIdx/getPlayerIdx: [pick index], note, status: pending|accepted|declined|cancelled, by, at}
//   lottery/<season> {order: [captains], id, by, at}  - draft lottery result (everyone on Live Draft watches it run)
//   teams/<season>  {names: {captainSlug: "Team name"}, by, at}  - team names editors set at/after the draft
//   photos/{slug}   {img: small JPEG as a data: URL, by, at}  - headshot uploaded on the site (beats images/*.jpg)
//   requests/{uid}  "Request edit access"      editors/{uid}  people Jack approved
// Everyone sees all of it. Only approved editors (and the admin) can change it.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch, runTransaction, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// The web config is public by design (it only identifies the project); the rules do the protecting.
const app = initializeApp({
  apiKey: "AIzaSyDNwFNWGEEdNzKvpuaYnr5_WbgdGj-WWrY",
  authDomain: "gallturkeybowl.firebaseapp.com",
  projectId: "gallturkeybowl",
  storageBucket: "gallturkeybowl.firebasestorage.app",
  messagingSenderId: "342594231463",
  appId: "1:342594231463:web:245e979f60bfa49af24f82",
});
const auth = getAuth(app), db = getFirestore(app);
// Who's the admin is decided only in firestore.rules: the site just asks "may I see the request list?".

const slugOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LEAGUE = {"nfl": "NFL", "college-football": "CFB"};

const TBC = window.TBC = {
  ready: false, user: null, role: "viewer", profiles: {}, photos: {}, order: [], live: null, teamNames: {}, lottery: null, teamInfo: {}, captainsByUid: {}, trades: [],
  canEdit(){ return this.role === "editor" || this.role === "admin"; },   // approved editors + the admin
  isAdmin(){ return this.role === "admin"; },   // editors/captains list stays admin-only
  profile(slug){ return this.profiles[slug] || null; },
  photo(slug){ return this.photos[slug] || null; },
};
const changed = () => document.dispatchEvent(new CustomEvent("tbc-change"));

// ---- live nicknames + comps for everyone ----
onSnapshot(collection(db, "players"), snap => {
  const p = {}; snap.forEach(d => p[d.id] = d.data());
  TBC.profiles = p; TBC.ready = true; changed();
}, err => { console.warn("Turkey Bowl cloud: couldn't load nicknames/comps", err); TBC.ready = true; changed(); });
onSnapshot(doc(db, "board", "order"), d => {
  const o = d.exists() ? d.data().order : null;
  TBC.order = Array.isArray(o) ? o : []; changed();
}, err => console.warn("Turkey Bowl cloud: couldn't load the board order", err));
const DRAFT_ID = String(typeof CURRENT_SEASON !== "undefined" ? CURRENT_SEASON : 2026);
const draftRef = doc(db, "draft", DRAFT_ID);
onSnapshot(draftRef, d => { TBC.live = d.exists() ? d.data() : null; changed(); },
  err => console.warn("Turkey Bowl cloud: couldn't load the live draft", err));
// Trade offers for this season, newest first
onSnapshot(query(collection(db, "trades"), where("season", "==", DRAFT_ID)), snap => {
  const t = []; snap.forEach(d => t.push({id: d.id, ...d.data()}));
  const ms = x => x.at && x.at.toMillis ? x.at.toMillis() : Date.now();
  TBC.trades = t.sort((a, b) => ms(b) - ms(a)); changed();
}, err => console.warn("Turkey Bowl cloud: couldn't load trades", err));
onSnapshot(doc(db, "teams", DRAFT_ID), d => { const n = d.exists() ? d.data().names : null; TBC.teamNames = n && typeof n === "object" ? n : {}; changed(); },
  err => console.warn("Turkey Bowl cloud: couldn't load team names", err));
onSnapshot(doc(db, "lottery", DRAFT_ID), d => { TBC.lottery = d.exists() ? d.data() : null; changed(); },
  err => console.warn("Turkey Bowl cloud: couldn't load the draft lottery", err));
// Captain accounts: captains/<season> {byUid: {uid: "Captain Name"}} — Jack assigns them in Manage editors.
onSnapshot(doc(db, "captains", DRAFT_ID), d => { const m = d.exists() ? d.data().byUid : null; TBC.captainsByUid = m && typeof m === "object" ? m : {}; TBC.captainNames = d.exists() ? (d.data().names || {}) : {}; changed(); },
  err => console.warn("Turkey Bowl cloud: couldn't load captains", err));
TBC.myCap = () => (TBC.user && TBC.captainsByUid[TBC.user.uid]) || null;
TBC.capUser = cap => { const uid = Object.keys(TBC.captainsByUid).find(u => TBC.captainsByUid[u] === cap); return uid ? ((TBC.captainNames || {})[uid] || "captain account") : null; };
// Team look: teamInfo/<season>-<captain-slug> {season, cap, name, logo (emoji or small image), color}
onSnapshot(collection(db, "teamInfo"), snap => {
  const t = {}; snap.forEach(d => { const v = d.data(); if (v.season === DRAFT_ID && typeof v.cap === "string" && d.id === DRAFT_ID + "-" + slugOf(v.cap)) t[v.cap] = v; });
  TBC.teamInfo = t; changed();
}, err => console.warn("Turkey Bowl cloud: couldn't load teams", err));
onSnapshot(collection(db, "photos"), snap => {
  const p = {}; snap.forEach(d => { const v = d.data().img; if (typeof v === "string" && v.startsWith("data:image/")) p[d.id] = v; });
  TBC.photos = p; changed();
}, err => console.warn("Turkey Bowl cloud: couldn't load headshots", err));

// ---- who is signed in, and what they're allowed to do ----
async function roleFor(u){
  if (!u) return "viewer";
  try { await getDocs(collection(db, "requests")); return "admin"; } catch(e){}   // only the admin may list requests
  try { if ((await getDoc(doc(db, "editors", u.uid))).exists()) return "editor"; } catch(e){}
  try { if ((await getDoc(doc(db, "requests", u.uid))).exists()) return "pending"; } catch(e){}
  return "viewer";
}
onAuthStateChanged(auth, async u => {
  TBC.user = u ? {uid: u.uid, name: u.displayName || u.email || "Someone", email: u.email || ""} : null;
  // remember who has signed in, so Jack can pick captain accounts from a list
  if (u) setDoc(doc(db, "users", u.uid), {name: TBC.user.name.slice(0, 80), email: TBC.user.email, at: serverTimestamp()}).catch(() => {});
  TBC.role = await roleFor(u);
  document.body.classList.toggle("tb-edit", TBC.canEdit());   // shows Film Room / History edit buttons to editors + admin
  renderAuthBox(); changed();
});

TBC.signIn = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e){
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, new GoogleAuthProvider());   // some phones block pop-ups
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") alert("Sign-in didn't work: " + (e.message || e.code));
  }
};
TBC.signOut = () => signOut(auth);
TBC.requestAccess = async () => {
  const u = TBC.user; if (!u) return TBC.signIn();
  await setDoc(doc(db, "requests", u.uid), {name: u.name.slice(0, 80), email: u.email, at: serverTimestamp()});
  TBC.role = "pending"; renderAuthBox(); changed();
};
const by = () => (TBC.user?.name || "").slice(0, 60);
// Only the fields passed in change (merge), so a nickname edit never wipes a position change and vice versa.
TBC.saveProfile = async (slug, {nickname, comp, tier, college, ...bio}) => {
  const d = {by: by(), at: serverTimestamp()};
  if (nickname !== undefined) d.nickname = (nickname || "").trim().slice(0, 30);
  if (comp !== undefined) d.comp = comp ? {name: comp.name.slice(0, 60), team: (comp.team || "").slice(0, 60), league: comp.league, id: String(comp.id), img: comp.img} : null;
  if (tier !== undefined) d.tier = tier;
  if (college !== undefined) d.college = college ? {name: college.name.trim().slice(0, 40), id: college.id ? String(college.id) : null} : null;
  ["num", "age", "ht", "wt"].forEach(k => { if (bio[k] !== undefined) d[k] = bio[k]; });   // null clears it
  await setDoc(doc(db, "players", slug), d, {merge: true});
};
// One drag on the board: the new order plus any players that crossed a tier line, saved together.
TBC.saveBoard = async (order, tierChanges) => {
  const b = writeBatch(db), stamp = {by: by(), at: serverTimestamp()};
  b.set(doc(db, "board", "order"), {order: order.slice(0, 300), ...stamp});
  Object.entries(tierChanges || {}).forEach(([slug, tier]) => b.set(doc(db, "players", slug), {tier, ...stamp}, {merge: true}));
  await b.commit();
};
// ---- live draft ----
TBC.liveStart = async (order, pool) => runTransaction(db, async tx => {
  if ((await tx.get(draftRef)).exists()) throw new Error("The draft has already been started.");
  tx.set(draftRef, {status: "live", order, pool, picks: [], by: by(), at: serverTimestamp()});
});
// expect = how many picks the person saw; if someone else picked in the meantime, refuse instead of double-picking
TBC.livePick = async (name, expect) => runTransaction(db, async tx => {
  const s = await tx.get(draftRef); if (!s.exists()) throw new Error("The draft isn't running.");
  const d = s.data();
  if (d.status !== "live") throw new Error("The draft is over.");
  if (d.picks.length !== expect) throw new Error("Another pick just came in. Check the board and try again.");
  if (d.picks.includes(name) || !d.pool.includes(name)) throw new Error(name + " can't be picked.");
  const picks = [...d.picks, name];
  tx.update(draftRef, {picks, status: picks.length >= d.pool.length ? "done" : "live", by: by(), at: serverTimestamp()});
});
TBC.liveUndo = async expect => runTransaction(db, async tx => {
  const s = await tx.get(draftRef); if (!s.exists()) return;
  const d = s.data();
  if (d.picks.length !== expect) throw new Error("The board changed. Check it and try again.");
  const gone = d.picks[d.picks.length - 1], moved = {...(d.moved || {})}, had = gone in moved;
  delete moved[gone];   // an undone pick takes back any trade of that player too
  tx.update(draftRef, {picks: d.picks.slice(0, -1), status: "live", ...(had ? {moved} : {}), by: by(), at: serverTimestamp()});
});
// ---- trades ----
// Ownership, same rules as firestore.rules: a pick belongs to owners[i] or the snake order; a drafted player to
// moved[name] or whoever made that pick.
const snakeOwner = (d, i) => { const n = d.order.length, r = Math.floor(i / n), s = i % n; return d.order[r % 2 === 0 ? s : n - 1 - s]; };
TBC.pickOwner = (d, i) => (d.owners || {})[String(i)] || snakeOwner(d, i);
TBC.playerOwner = (d, name) => { const i = (d.picks || []).indexOf(name); return i < 0 ? null : ((d.moved || {})[name] || TBC.pickOwner(d, i)); };
// Why a pending trade can't go through any more ("" = still fine).
TBC.tradeProblem = (t, d) => {
  if (!d) return "The draft isn't running.";
  const made = (d.picks || []).length;
  const pickBad = (ks, who) => ks.some(k => +k < made) ? "A pick in it has already been made." : ks.some(k => TBC.pickOwner(d, +k) !== who) ? "A pick in it changed hands." : "";
  const plBad = (ns, ix, who) => ns.some((n, j) => d.picks[ix[j]] !== n || TBC.playerOwner(d, n) !== who) ? "A player in it changed teams." : "";
  return pickBad(t.givePicks, t.from) || pickBad(t.getPicks, t.to) || plBad(t.givePlayers, t.givePlayerIdx, t.from) || plBad(t.getPlayers, t.getPlayerIdx, t.to);
};
// offer = {from, to, givePicks: [i], getPicks: [i], givePlayers: [names], getPlayers: [names], note}
TBC.proposeTrade = async o => {
  const d = TBC.live; if (!d) throw new Error("Trades open once the live draft starts.");
  const idx = ns => ns.map(n => d.picks.indexOf(n));
  const t = {season: DRAFT_ID, from: o.from, to: o.to, givePicks: o.givePicks.map(String), getPicks: o.getPicks.map(String),
    givePlayers: o.givePlayers, getPlayers: o.getPlayers, givePlayerIdx: idx(o.givePlayers), getPlayerIdx: idx(o.getPlayers),
    note: (o.note || "").trim().slice(0, 200), status: "pending"};
  const why = TBC.tradeProblem(t, d); if (why) throw new Error(why);
  await setDoc(doc(collection(db, "trades")), {...t, by: by(), at: serverTimestamp()});
};
const tradeStatus = (id, status) => updateDoc(doc(db, "trades", id), {status, by: by(), at: serverTimestamp()});
TBC.declineTrade = id => tradeStatus(id, "declined");
TBC.cancelTrade = id => tradeStatus(id, "cancelled");
// Accept: move the picks/players on the draft and mark the offer accepted, in one commit (rules check both together).
TBC.acceptTrade = async id => runTransaction(db, async tx => {
  const tRef = doc(db, "trades", id);
  const [ds, ts] = [await tx.get(draftRef), await tx.get(tRef)];
  if (!ds.exists()) throw new Error("The draft isn't running.");
  if (!ts.exists() || ts.data().status !== "pending") throw new Error("That offer isn't open any more.");
  const d = ds.data(), t = ts.data(), why = TBC.tradeProblem(t, d);
  if (why) throw new Error(why + " This offer can't go through any more.");
  const owners = {...(d.owners || {})}, moved = {...(d.moved || {})};
  t.givePicks.forEach(k => owners[k] = t.to); t.getPicks.forEach(k => owners[k] = t.from);
  t.givePlayers.forEach(n => moved[n] = t.to); t.getPlayers.forEach(n => moved[n] = t.from);
  tx.update(draftRef, {owners, moved, tradesDone: [...(d.tradesDone || []), id], by: by(), at: serverTimestamp()});
  tx.update(tRef, {status: "accepted", by: by(), at: serverTimestamp()});
});
TBC.liveReset = () => deleteDoc(draftRef);
// Draft lottery: shuffle the captains (fair Fisher-Yates using the browser's crypto random), save it,
// and every open Live Draft page plays the reveal. Not allowed once the draft has started (rules).
TBC.runLottery = async captains => {
  const o = [...captains], r = new Uint32Array(o.length); crypto.getRandomValues(r);
  for (let i = o.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [o[i], o[j]] = [o[j], o[i]]; }
  await setDoc(doc(db, "lottery", DRAFT_ID), {order: o, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), by: by(), at: serverTimestamp()});
  return o;
};
// Rename a team (keyed by its captain). Empty name = back to "Team <captain's last name>".
TBC.saveTeamName = async (capSlug, name) => {
  const names = {...TBC.teamNames};
  if (name) names[capSlug] = name; else delete names[capSlug];
  await setDoc(doc(db, "teams", DRAFT_ID), {names, by: by(), at: serverTimestamp()});
};
// ---- teams ----
TBC.saveTeam = async (cap, {name, logo, color}) => {
  await setDoc(doc(db, "teamInfo", DRAFT_ID + "-" + slugOf(cap)), {season: DRAFT_ID, cap, name: (name || "").trim().slice(0, 30), logo: logo || "", color: color || "", by: by(), at: serverTimestamp()});
};
TBC.assignCaptain = async (cap, uid, uname) => {   // admin only (rules). uid "" = nobody
  const byUid = {...TBC.captainsByUid}, names = {...(TBC.captainNames || {})};
  Object.keys(byUid).forEach(u => { if (byUid[u] === cap) { delete byUid[u]; delete names[u]; } });
  if (uid) { delete byUid[uid]; byUid[uid] = cap; names[uid] = (uname || "").slice(0, 40); }
  await setDoc(doc(db, "captains", DRAFT_ID), {byUid, names, by: by(), at: serverTimestamp()});
};
const EMOJI = ["🦃","🏈","🔥","⚡","🐺","🦅","🐻","🦁","🐍","🦈","🐉","👑","💀","🚀","🌪️","🎯","🍗","🥧","🍂","🏆","💪","🧊","🌶️","🐐"];
const COLORS = ["#e9b949","#ef6b5f","#5fd68f","#4b9ce8","#c58af9","#f28c38","#2ec4b6","#e8ecf4"];
TBC.openTeamEditor = cap => {
  const cur = TBC.teamInfo[cap] || {}, mine = TBC.myCap() === cap;
  if (!mine && !TBC.canEdit()) return;
  let logo = cur.logo || "", color = cur.color || "";
  let ov = document.getElementById("teamOv");
  if (!ov) { ov = document.createElement("div"); ov.id = "teamOv"; ov.className = "ov"; document.body.appendChild(ov); ov.addEventListener("click", e => { if (e.target === ov) ov.hidden = true; }); }
  ov.innerHTML = `<div class="pc adminpc"><div class="pc-head"><div><h2 class="pc-name">Customize team</h2>
      <div class="pc-meta">Captain ${esc(cap)}${mine ? " (you)" : ""}</div></div><button class="pc-close" aria-label="Close">✕</button></div>
    <div class="pc-body"><div class="ed team-ed">
      <div class="prev" id="tePrev"></div>
      <div class="ed-row"><label>Team name</label><input id="teName" maxlength="30" placeholder="Team ${esc(cap.split(" ").slice(-1)[0])}" value="${esc(cur.name || "")}"></div>
      <div class="ed-row"><label>Logo</label><div class="emo">${EMOJI.map(e => `<button type="button" data-e="${e}">${e}</button>`).join("")}</div>
        <div class="ed-photo" style="margin-top:8px"><label class="obtn sm" style="margin:0;cursor:pointer">📷 Upload a logo<input type="file" id="teFile" accept="image/*"></label>
        <button class="obtn sm" type="button" id="teNoLogo">No logo (use captain photo)</button></div></div>
      <div class="ed-row"><label>Team color</label><div class="sw">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join("")}</div></div>
      <div class="ed-btns"><button class="obtn solid" id="teSave">Save</button><button class="obtn" id="teCancel">Cancel</button><span class="ed-msg" id="teMsg"></span></div>
    </div></div></div>`;
  ov.hidden = false;
  const $ = s => ov.querySelector(s), close = () => { ov.hidden = true; };
  const draw = () => {
    const pv = $("#tePrev"); pv.innerHTML = "";
    const b = document.createElement("div"); b.className = "hs tlogo"; if (color) b.style.background = color;
    if (/^data:image\//.test(logo)) { const im = new Image(); im.src = logo; b.appendChild(im); } else b.textContent = logo || "🦃";
    pv.appendChild(b); pv.insertAdjacentHTML("beforeend", `<div class="mt-name">${esc($("#teName").value.trim() || "Team " + cap.split(" ").slice(-1)[0])}</div>`);
    ov.querySelectorAll(".emo button").forEach(x => x.classList.toggle("on", x.dataset.e === logo));
    ov.querySelectorAll(".sw button").forEach(x => x.classList.toggle("on", x.dataset.c === color));
  };
  draw();
  $("#teName").oninput = draw;
  ov.querySelectorAll(".emo button").forEach(x => x.onclick = () => { logo = x.dataset.e; draw(); });
  ov.querySelectorAll(".sw button").forEach(x => x.onclick = () => { color = color === x.dataset.c ? "" : x.dataset.c; draw(); });
  $("#teNoLogo").onclick = () => { logo = ""; draw(); };
  $("#teFile").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { logo = await TBC.shrinkPhoto(f, 128); draw(); } catch(err){ $("#teMsg").textContent = err.message; } };
  ov.querySelector(".pc-close").onclick = close; $("#teCancel").onclick = close;
  $("#teSave").onclick = async () => {
    $("#teSave").disabled = true; $("#teMsg").textContent = "Saving…";
    try { await TBC.saveTeam(cap, {name: $("#teName").value, logo, color}); close(); }
    catch(err){ $("#teSave").disabled = false; $("#teMsg").textContent = "Couldn't save: " + (err.code === "permission-denied" ? "only this team's captain or an editor can change it." : err.message); }
  };
};
TBC.savePhoto = async (slug, img) => img
  ? setDoc(doc(db, "photos", slug), {img, by: by(), at: serverTimestamp()})
  : deleteDoc(doc(db, "photos", slug));
TBC.addPlayer = async (name, tier) => {
  const slug = slugOf(name);
  await setDoc(doc(db, "players", slug), {name, added: true, tier, by: by(), at: serverTimestamp()}, {merge: true});
  return slug;
};
TBC.removePlayer = async slug => {
  await deleteDoc(doc(db, "photos", slug)).catch(() => {});
  await deleteDoc(doc(db, "players", slug));
};

// Shrink a picked photo to a 256px square JPEG (about 15-25 KB) so it fits in the database.
// Tall photos are cropped a little above center, where the face usually is.
TBC.shrinkPhoto = (file, size = 256) => new Promise((ok, bad) => {
  if (!file || !/^image\//.test(file.type)) return bad(new Error("That isn't a picture."));
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    const S = size, side = Math.min(im.naturalWidth, im.naturalHeight);
    const sx = (im.naturalWidth - side) / 2, sy = (im.naturalHeight - side) * 0.3;
    const c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(im, sx, sy, side, side, 0, 0, S, S);
    URL.revokeObjectURL(url);
    let q = 0.85, out = c.toDataURL("image/jpeg", q);
    while (out.length > (size < 200 ? 50000 : 140000) && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
    ok(out);
  };
  im.onerror = () => { URL.revokeObjectURL(url); bad(new Error("Couldn't open that picture (try a JPG or PNG).")); };
  im.src = url;
});

const TIER_OPTS = [["S","S Tier"],["A","A Tier"],["B","B Tier"],["C","C Tier"],["D","D Tier"],["NA","Unranked"]];
const posTierHTML = (pos, tier) => `
  <div class="ed-row ed-2">
    <div><label>Position</label><select id="edPos"><option value="QB" ${pos === "QB" ? "selected" : ""}>QB</option><option value="FLEX" ${pos !== "QB" ? "selected" : ""}>FLEX</option></select></div>
    <div id="edTierWrap" ${pos === "QB" ? "hidden" : ""}><label>Tier</label><select id="edTier">${TIER_OPTS.map(([k, l]) => `<option value="${k}" ${k === tier ? "selected" : ""}>${l}</option>`).join("")}</select></div>
  </div>
  <div class="ed-hint" style="margin-top:-8px">QBs are the captains in the mock draft. FLEX players are ranked by tier.</div>`;
const wirePosTier = $ => { $("#edPos").onchange = e => { $("#edTierWrap").hidden = e.target.value === "QB"; }; };
const readTier = $ => $("#edPos").value === "QB" ? "QB" : $("#edTier").value;

// ---- ESPN player search (NFL + college football only) ----
TBC.searchPlayers = async q => {
  q = q.trim(); if (q.length < 2) return [];
  const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=40&type=player`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.items || []).filter(it => LEAGUE[it.league] && /^\d+$/.test(String(it.id))).slice(0, 10).map(it => {
    const img = it.headshot?.href && /^https:\/\/a\.espncdn\.com\//.test(it.headshot.href) ? it.headshot.href
      : `https://a.espncdn.com/i/headshots/${it.league}/players/full/${it.id}.png`;
    return {name: it.displayName, team: it.teamRelationships?.[0]?.displayName || "", league: it.league, id: String(it.id), img};
  });
};

// ---- colleges: colleges.js (ESPN's college football + basketball schools, plus every NCAA.com school ESPN lacks), loaded on first search ----
let COLLEGES = null;
TBC.colleges = () => COLLEGES || (COLLEGES = new Promise((ok, bad) => {
  if (window.TB_COLLEGES) return ok();
  const sc = document.createElement("script"); sc.src = "colleges.js?v=2";
  sc.onload = ok; sc.onerror = () => { COLLEGES = null; sc.remove(); bad(new Error("couldn't load colleges.js")); };
  document.head.appendChild(sc);
}).then(() => (window.TB_COLLEGES || []).map(([name, full, abbr, id]) => ({name, full, abbr, id}))));
TBC.searchColleges = async q => {
  q = q.trim().toLowerCase(); if (q.length < 2) return [];
  const list = await TBC.colleges();
  const hit = t => t.name.toLowerCase().startsWith(q) ? 0 : t.abbr.toLowerCase() === q ? 1 : t.full.toLowerCase().includes(q) ? 2 : -1;
  return list.map(t => [hit(t), t]).filter(([h]) => h >= 0).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, t]) => t);
};
// Logo, or the school's initials if no logo loads. id = ESPN team id (dark-background logo, else the regular one)
// or "n-<slug>" for a school from NCAA.com (dark-background logo, else the regular one). cls sizes it (.col-logo in index.html).
const LOGO_URLS = id => /^n-/.test(id)
  ? ["bgd", "bgl"].map(v => `https://www.ncaa.com/sites/default/files/images/logos/schools/${v}/${id.slice(2)}.svg`)
  : ["500-dark", "500"].map(v => `https://a.espncdn.com/i/teamlogos/ncaa/${v}/${id}.png`);
TBC.collegeLogo = (c, cls = "col-logo") => {
  if (!c || !c.name) return "";
  const words = c.name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const ini = (words.filter(w => /^[A-Z0-9]/.test(w)).map(w => w[0]).join("") || words.map(w => w[0]).join("") || "?").slice(0, 3).toUpperCase();
  const id = String(c.id || "");
  if (!/^([0-9]{1,8}|n-[a-z0-9-]{1,60})$/.test(id)) return `<span class="${cls}" title="${esc(c.name)}"><b>${ini}</b></span>`;
  const [a, b] = LOGO_URLS(id);
  return `<span class="${cls}" title="${esc(c.name)}"><img src="${a}" alt="${esc(c.name)}" loading="lazy" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${b}'}else this.replaceWith(Object.assign(document.createElement('b'),{textContent:'${ini}'}))"></span>`;
};
TBC.collegeTag = c => c && c.name ? `<span class="col-tag">${TBC.collegeLogo(c)}<span>${esc(c.name)}</span></span>` : "";

// ---- small UI helpers used by the player card (index.html) ----
TBC.nameHTML = (first, last, slug) => {
  const n = TBC.profile(slug)?.nickname;
  return n ? `${esc(first)} <span class="pc-nick">“${esc(n)}”</span> ${esc(last)}` : `${esc(first)} ${esc(last)}`;
};
TBC.compHTML = comp => comp ? `
  <div class="comp-card">
    <img src="${esc(comp.img)}" alt="" onerror="this.style.visibility='hidden'">
    <div><div class="comp-k">Player comp</div><div class="comp-n">${esc(comp.name)}</div>
      <div class="comp-t">${esc(comp.team)}${comp.team ? " · " : ""}${LEAGUE[comp.league] || ""}</div></div>
  </div>` : "";

// Edit panel inside the open player card. onDone() redraws the card.
TBC.openEditor = (host, p, slug, onDone) => {
  const cur = TBC.profile(slug) || {};
  let pick = cur.comp || null, timer = null, seq = 0, newPhoto;
  let colPick = cur.college || null, colTimer = null, colSeq = 0;   // newPhoto: undefined = unchanged, "" = remove, data URL = new
  const ini = esc((p.first[0] || "") + (p.last[0] || ""));
  host.innerHTML = `
    <div class="ed">
      <div class="ed-row"><label>Headshot</label>
        <div class="ed-photo"><span id="edPh"></span>
          <label class="obtn sm" style="margin:0;cursor:pointer">📷 Upload photo<input type="file" id="edFile" accept="image/*"></label>
          <button class="obtn sm" id="edPhRm" type="button" ${TBC.photo(slug) ? "" : "hidden"}>Remove uploaded photo</button></div>
        <div class="ed-hint">Any photo works. It's cropped to a square around the face and shrunk.</div></div>
      ${posTierHTML(p.pos, p.tier === "QB" ? (p.prev !== "QB" ? p.prev : "NA") : p.tier)}
      <div class="ed-row ed-2 ed-bio">
        <div><label>Number</label><input id="edNum" inputmode="numeric" maxlength="2" placeholder="#" value="${esc(cur.num ?? "")}"></div>
        <div><label>Age</label><input id="edAge" inputmode="numeric" maxlength="2" placeholder="—" value="${esc(cur.age ?? "")}"></div>
        <div><label>Height</label><span class="ed-ht"><select id="edFt"><option value="">ft</option>${[4,5,6,7].map(f => `<option ${String(cur.ht || "").split("-")[0] === String(f) ? "selected" : ""}>${f}</option>`).join("")}</select><select id="edIn"><option value="">in</option>${[...Array(12).keys()].map(i => `<option ${cur.ht && String(cur.ht).split("-")[1] === String(i) ? "selected" : ""}>${i}</option>`).join("")}</select></span></div>
        <div><label>Weight (lbs)</label><input id="edWt" inputmode="numeric" maxlength="3" placeholder="—" value="${esc(cur.wt ?? "")}"></div>
      </div>
      ${TBC.canEdit() ? `<div class="ed-row"><label>College</label>
        <div id="edColPick"></div>
        <input id="edColSearch" placeholder="Type a school, e.g. Penn State or Ithaca" autocomplete="off">
        <div class="ed-res" id="edColRes"></div>
        <div class="ed-hint">Shows as a logo next to their name on the Draft Board and in the drafts.</div></div>` : ""}
      <div class="ed-row"><label>Nickname</label>
        <input id="edNick" maxlength="30" placeholder="e.g. The Mailman" value="${esc(cur.nickname || "")}">
        <div class="ed-hint">Shows as ${esc(p.first)} “Nickname” ${esc(p.last)}</div></div>
      <div class="ed-row"><label>Player comp (NFL or college)</label>
        <div id="edPick"></div>
        <input id="edSearch" placeholder="Type a player's name, e.g. Puka Nacua" autocomplete="off">
        <div class="ed-res" id="edRes"></div></div>
      <div class="ed-btns"><button class="obtn solid" id="edSave">Save</button><button class="obtn" id="edCancel">Cancel</button><span class="ed-msg" id="edMsg"></span>
        ${p.added ? `<button class="obtn sm ed-danger" id="edDel" type="button">Remove player</button>` : ""}</div>
    </div>`;
  const $ = s => host.querySelector(s);
  const drawPh = () => {
    const src = newPhoto === undefined ? (TBC.photo(slug) || host.closest(".pc")?.querySelector(".pc-head .hs img")?.src) : newPhoto;
    $("#edPh").innerHTML = src ? `<img class="ph" src="${esc(src)}" alt="">` : `<span class="ph">${ini}</span>`;
  };
  drawPh();
  $("#edFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    $("#edMsg").textContent = "Preparing photo…";
    try { newPhoto = await TBC.shrinkPhoto(f); drawPh(); $("#edPhRm").hidden = false; $("#edMsg").textContent = "Photo ready. Tap Save."; }
    catch(err){ $("#edMsg").textContent = err.message; }
  };
  $("#edPhRm").onclick = () => { newPhoto = ""; $("#edPhRm").hidden = true; drawPh(); };
  wirePosTier($);
  const del = $("#edDel"); if (del) del.onclick = async () => {
    if (!confirm(`Remove ${p.name} from the board? This deletes the player, their photo, nickname and comp.`)) return;
    try { await TBC.removePlayer(slug); onDone(true); } catch(err){ $("#edMsg").textContent = "Couldn't remove: " + err.message; }
  };
  const drawPick = () => {
    $("#edPick").innerHTML = pick ? `<div class="ed-picked">${TBC.compHTML(pick)}<button class="obtn sm" id="edClear">Remove comp</button></div>` : "";
    const c = host.querySelector("#edClear"); if (c) c.onclick = () => { pick = null; drawPick(); };
  };
  drawPick();
  if (TBC.canEdit()) {
    const drawCol = () => {
      $("#edColPick").innerHTML = colPick ? `<div class="ed-picked">${TBC.collegeTag(colPick)}<button class="obtn sm" id="edColClear" type="button">Remove college</button></div>` : "";
      const c = host.querySelector("#edColClear"); if (c) c.onclick = () => { colPick = null; drawCol(); };
    };
    drawCol();
    $("#edColSearch").oninput = e => {
      clearTimeout(colTimer);
      const q = e.target.value, my = ++colSeq;
      colTimer = setTimeout(async () => {
        const res = $("#edColRes");
        if (q.trim().length < 2) { res.innerHTML = ""; return; }
        let list = [], failed = false;
        try { list = await TBC.searchColleges(q); } catch(err){ failed = true; }
        if (my !== colSeq) return;
        res.innerHTML = failed ? `<div class="ed-none">Couldn't load the school list. You can still use the name as typed.</div>` : "";
        const pickIt = x => { colPick = x; drawCol(); res.innerHTML = ""; $("#edColSearch").value = ""; };
        list.forEach(x => {
          const b = document.createElement("button"); b.type = "button"; b.className = "ed-opt";
          b.innerHTML = `${TBC.collegeLogo(x, "col-logo lg")}<span><b>${esc(x.name)}</b><small>${esc(x.full)}</small></span>`;
          b.onclick = () => pickIt({name: x.name, id: x.id});
          res.appendChild(b);
        });
        const typed = q.trim().replace(/\s+/g, " ").slice(0, 40);
        const b = document.createElement("button"); b.type = "button"; b.className = "ed-opt";
        b.innerHTML = `${TBC.collegeLogo({name: typed}, "col-logo lg")}<span><b>Use “${esc(typed)}”</b><small>No logo (school isn't listed)</small></span>`;
        b.onclick = () => pickIt({name: typed, id: null});
        res.appendChild(b);
      }, 200);
    };
  }
  $("#edSearch").oninput = e => {
    clearTimeout(timer);
    const q = e.target.value, my = ++seq;
    timer = setTimeout(async () => {
      const res = $("#edRes");
      if (q.trim().length < 2) { res.innerHTML = ""; return; }
      res.innerHTML = `<div class="ed-none">Searching…</div>`;
      let list = [];
      try { list = await TBC.searchPlayers(q); } catch(err){}
      if (my !== seq) return;
      res.innerHTML = list.length ? "" : `<div class="ed-none">No NFL or college players found.</div>`;
      list.forEach(x => {
        const b = document.createElement("button"); b.type = "button"; b.className = "ed-opt";
        b.innerHTML = `<img src="${esc(x.img)}" alt="" onerror="this.style.visibility='hidden'"><span><b>${esc(x.name)}</b><small>${esc(x.team)}${x.team ? " · " : ""}${LEAGUE[x.league]}</small></span>`;
        b.onclick = () => { pick = x; drawPick(); res.innerHTML = ""; $("#edSearch").value = ""; };
        res.appendChild(b);
      });
    }, 250);
  };
  $("#edCancel").onclick = onDone;
  $("#edSave").onclick = async () => {
    $("#edSave").disabled = true; $("#edMsg").textContent = "Saving…";
    try {
      const tier = readTier($);
      const int = (v, lo, hi, what) => { v = String(v).trim(); if (!v) return null; const n = +v; if (!/^\d+$/.test(v) || n < lo || n > hi) throw new Error(`${what} should be a number from ${lo} to ${hi}.`); return n; };
      const num = $("#edNum").value.trim();
      if (num && !/^\d{1,2}$/.test(num)) throw new Error("Number should be 0 to 99.");
      const ft = $("#edFt").value, inch = $("#edIn").value;
      if (!ft !== !inch) throw new Error("Pick both feet and inches for height (or neither).");
      const bio = {num: num || null, age: int($("#edAge").value, 10, 99, "Age"), wt: int($("#edWt").value, 80, 400, "Weight"), ht: ft ? `${ft}-${inch}` : null};
      const colChanged = TBC.canEdit() && ((colPick?.name || "") !== (cur.college?.name || "") || (colPick?.id || null) !== (cur.college?.id || null));
      await TBC.saveProfile(slug, {nickname: $("#edNick").value, comp: pick, ...bio, ...(tier !== p.tier ? {tier} : {}), ...(colChanged ? {college: colPick} : {})});
      if (newPhoto !== undefined) await TBC.savePhoto(slug, newPhoto || null);
      onDone();
    }
    catch(err){ $("#edSave").disabled = false; $("#edMsg").textContent = "Couldn't save: " + (err.code === "permission-denied" ? "you don't have edit access." : err.message); }
  };
};

// "+ Add player" on the board (editors only). taken(slug) says if that name is already on the board;
// onDone(name) opens the new player's card.
TBC.openAddPlayer = (onDone, taken) => {
  let ov = document.getElementById("addOv");
  if (!ov) {
    ov = document.createElement("div"); ov.id = "addOv"; ov.className = "ov";
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) ov.hidden = true; });
  }
  ov.innerHTML = `<div class="pc adminpc"><div class="pc-head"><div><h2 class="pc-name">Add player</h2>
      <div class="pc-meta">They show up on the board for everyone. Add a photo, nickname and comp from their card after.</div></div>
      <button class="pc-close" aria-label="Close">✕</button></div>
    <div class="pc-body"><div class="ed">
      <div class="ed-row"><label>First and last name</label><input id="apName" maxlength="40" placeholder="e.g. Chris Romano" autocomplete="off"></div>
      ${posTierHTML("FLEX", "NA")}
      <div class="ed-btns"><button class="obtn solid" id="apSave">Add player</button><button class="obtn" id="apCancel">Cancel</button><span class="ed-msg" id="apMsg"></span></div>
    </div></div></div>`;
  ov.hidden = false;
  const $ = s => ov.querySelector(s), close = () => { ov.hidden = true; };
  ov.querySelector(".pc-close").onclick = close; $("#apCancel").onclick = close;
  wirePosTier($);
  $("#apName").focus();
  $("#apSave").onclick = async () => {
    const name = $("#apName").value.trim().replace(/\s+/g, " ").replace(/(^|[ '-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
    if (!/^[A-Za-z][A-Za-z.' -]{2,39}$/.test(name) || name.split(" ").length < 2) { $("#apMsg").textContent = "Type a first and last name (letters only)."; return; }
    if ((taken && taken(slugOf(name))) || TBC.profile(slugOf(name))?.added) { $("#apMsg").textContent = name + " is already on the board."; return; }
    $("#apSave").disabled = true; $("#apMsg").textContent = "Adding…";
    try { await TBC.addPlayer(name, readTier($)); close(); onDone && onDone(name); }
    catch(err){ $("#apSave").disabled = false; $("#apMsg").textContent = "Couldn't add: " + (err.code === "permission-denied" ? "you don't have edit access." : err.message); }
  };
};

// ---- top-bar sign-in box + admin panel ----
function renderAuthBox(){
  let box = document.getElementById("authBox");
  if (!box) {
    box = document.createElement("div"); box.id = "authBox"; box.className = "authbox";
    document.querySelector(".topnav-in")?.appendChild(box);
  }
  const u = TBC.user;
  if (!u) { box.innerHTML = `<button class="obtn sm" id="abIn">Sign in</button>`; box.querySelector("#abIn").onclick = TBC.signIn; return; }
  const chip = {admin: "Admin", editor: "Editor", pending: "Access requested", viewer: ""}[TBC.role];
  // On phones (CSS, max-width 600px) the buttons fold into a menu behind the round initial button.
  box.innerHTML = `
    <button class="ab-toggle" id="abToggle" aria-label="Account menu" aria-expanded="false">${esc((u.name.trim()[0] || "?").toUpperCase())}</button>
    <div class="ab-menu">
      <span class="ab-name" title="${esc(u.email)}">${esc(u.name.split(" ")[0])}</span>
      ${chip ? `<span class="ab-chip ab-${TBC.role}">${chip}</span>` : ""}
      ${TBC.myCap() ? `<span class="ab-chip ab-editor">Captain</span>` : ""}
      ${TBC.role === "viewer" ? `<button class="obtn sm" id="abReq">Request edit access</button>` : ""}
      ${TBC.role === "admin" ? `<button class="obtn sm" id="abAdmin">Editors &amp; captains</button>` : ""}
      <button class="obtn sm" id="abOut">Sign out</button>
    </div>`;
  const tg = box.querySelector("#abToggle");
  tg.onclick = e => { e.stopPropagation(); const open = box.classList.toggle("open"); tg.setAttribute("aria-expanded", open); };
  box.querySelector(".ab-menu").addEventListener("click", e => { if (e.target.closest("button")) box.classList.remove("open"); });
  box.querySelector("#abOut").onclick = TBC.signOut;
  const rq = box.querySelector("#abReq"); if (rq) rq.onclick = async () => {
    try { await TBC.requestAccess(); alert("Request sent. Jack will see it and can approve you."); } catch(e){ alert("Couldn't send the request: " + e.message); }
  };
  const ad = box.querySelector("#abAdmin"); if (ad) ad.onclick = openAdmin;
}
renderAuthBox();
TBC.renderAuthBox = renderAuthBox;
document.addEventListener("click", e => { const b = document.getElementById("authBox"); if (b && !b.contains(e.target)) b.classList.remove("open"); });

async function openAdmin(){
  let ov = document.getElementById("adminOv");
  if (!ov) {
    ov = document.createElement("div"); ov.id = "adminOv"; ov.className = "ov";
    ov.innerHTML = `<div class="pc adminpc"><div class="pc-head"><div><h2 class="pc-name">Manage editors &amp; captains</h2>
      <div class="pc-meta">Editors can edit players, rankings and run the draft. Captain accounts can draft for their team and customize it.</div></div>
      <button class="pc-close" aria-label="Close">✕</button></div><div class="pc-body" id="adminBody"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) ov.hidden = true; });
    ov.querySelector(".pc-close").onclick = () => ov.hidden = true;
  }
  ov.hidden = false;
  const body = ov.querySelector("#adminBody");
  body.innerHTML = `<div class="ed-none">Loading…</div>`;
  const [rq, ed, us] = await Promise.all([getDocs(collection(db, "requests")), getDocs(collection(db, "editors")), getDocs(collection(db, "users")).catch(() => ({docs: []}))]);
  const row = (d, btns) => `<div class="adm-row"><div><b>${esc(d.data().name)}</b><small>${esc(d.data().email)}</small></div><div>${btns}</div></div>`;
  body.innerHTML = `
    <div class="sec-t" style="margin-bottom:8px">Requests (${rq.size})</div>
    ${rq.size ? rq.docs.map(d => row(d, `<button class="obtn solid sm" data-ok="${esc(d.id)}">Approve</button> <button class="obtn sm" data-no="${esc(d.id)}">Deny</button>`)).join("") : `<div class="ed-none">No requests right now. Friends sign in and tap “Request edit access”.</div>`}
    <div class="sec-t" style="margin:18px 0 8px">Editors (${ed.size})</div>
    ${ed.size ? ed.docs.map(d => row(d, `<button class="obtn sm" data-rm="${esc(d.id)}">Remove</button>`)).join("") : `<div class="ed-none">No editors yet.</div>`}
    <div class="sec-t" style="margin:18px 0 4px">Captain accounts (${esc(DRAFT_ID)} draft)</div>
    <div class="ed-hint" style="margin:0 0 8px">Pick which signed-in account drafts for each captain. They draft live from their phone and can customize their team. Friends show up here after they sign in once.</div>
    <div id="capRows"></div>`;
  const people = {};   // uid -> {name, email} from everyone who has signed in, asked for access, or edits
  [...us.docs, ...rq.docs, ...ed.docs].forEach(d => { const v = d.data(); if (!people[d.id]) people[d.id] = {name: v.name || "?", email: v.email || ""}; });
  const caps = (window.tbCaptains && window.tbCaptains()) || [];
  const capBox = body.querySelector("#capRows");
  capBox.innerHTML = caps.length ? caps.map(c => {
    const cur = Object.keys(TBC.captainsByUid).find(u => TBC.captainsByUid[u] === c) || "";
    return `<div class="adm-row"><div><b>${esc(c)}</b><small>${esc(window.draftTeamName ? window.draftTeamName(c) : "")}</small></div>
      <select data-cap="${esc(c)}" style="max-width:55%;background:#0f1525;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:7px"><option value="">— nobody —</option>${Object.entries(people).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([u, v]) => `<option value="${esc(u)}" ${u === cur ? "selected" : ""}>${esc(v.name)} (${esc(v.email)})</option>`).join("")}</select></div>`;
  }).join("") : `<div class="ed-none">No QBs (captains) on the board yet.</div>`;
  capBox.querySelectorAll("select[data-cap]").forEach(sel => sel.onchange = async () => {
    sel.disabled = true;
    try { await TBC.assignCaptain(sel.dataset.cap, sel.value, sel.value ? people[sel.value].name : ""); } catch(err){ alert("Couldn't save: " + err.message); }
    openAdmin();
  });
  const byId = Object.fromEntries(rq.docs.map(d => [d.id, d.data()]));
  body.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => {
    const r = byId[b.dataset.ok];
    await setDoc(doc(db, "editors", b.dataset.ok), {name: r.name, email: r.email, at: serverTimestamp()});
    await deleteDoc(doc(db, "requests", b.dataset.ok)); openAdmin();
  });
  body.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => { await deleteDoc(doc(db, "requests", b.dataset.no)); openAdmin(); });
  body.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => {
    if (!confirm("Remove this editor? They won't be able to edit players anymore.")) return;
    await deleteDoc(doc(db, "editors", b.dataset.rm)); openAdmin();
  });
}
