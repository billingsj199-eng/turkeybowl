// ===================== TURKEY BOWL CLOUD (sign-in, nicknames, comps) =====================
// Firebase project "gallturkeybowl" (Turkey Bowl only). Rules live in firestore.rules.
//   players/{slug}  {nickname, comp:{name,team,league,id,img}|null, by, at}  - shown on player cards
//   requests/{uid}  "Request edit access"      editors/{uid}  people Jack approved
// Everyone can see nicknames and comps. Only approved editors (and the admin) can change them.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, serverTimestamp }
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

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LEAGUE = {"nfl": "NFL", "college-football": "CFB"};

const TBC = window.TBC = {
  ready: false, user: null, role: "viewer", profiles: {},
  canEdit(){ return this.role === "editor" || this.role === "admin"; },
  profile(slug){ return this.profiles[slug] || null; },
};
const changed = () => document.dispatchEvent(new CustomEvent("tbc-change"));

// ---- live nicknames + comps for everyone ----
onSnapshot(collection(db, "players"), snap => {
  const p = {}; snap.forEach(d => p[d.id] = d.data());
  TBC.profiles = p; TBC.ready = true; changed();
}, err => { console.warn("Turkey Bowl cloud: couldn't load nicknames/comps", err); TBC.ready = true; changed(); });

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
  TBC.role = await roleFor(u);
  renderAuthBox(); changed();
});

TBC.signIn = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e){ if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") alert("Sign-in didn't work: " + (e.message || e.code)); }
};
TBC.signOut = () => signOut(auth);
TBC.requestAccess = async () => {
  const u = TBC.user; if (!u) return TBC.signIn();
  await setDoc(doc(db, "requests", u.uid), {name: u.name.slice(0, 80), email: u.email, at: serverTimestamp()});
  TBC.role = "pending"; renderAuthBox(); changed();
};
TBC.saveProfile = async (slug, {nickname, comp}) => {
  await setDoc(doc(db, "players", slug), {
    nickname: (nickname || "").trim().slice(0, 30),
    comp: comp ? {name: comp.name.slice(0, 60), team: (comp.team || "").slice(0, 60), league: comp.league, id: String(comp.id), img: comp.img} : null,
    by: (TBC.user?.name || "").slice(0, 60),
    at: serverTimestamp(),
  });
};

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
  let pick = cur.comp || null, timer = null, seq = 0;
  host.innerHTML = `
    <div class="ed">
      <div class="ed-row"><label>Nickname</label>
        <input id="edNick" maxlength="30" placeholder="e.g. The Mailman" value="${esc(cur.nickname || "")}">
        <div class="ed-hint">Shows as ${esc(p.first)} “Nickname” ${esc(p.last)}</div></div>
      <div class="ed-row"><label>Player comp (NFL or college)</label>
        <div id="edPick"></div>
        <input id="edSearch" placeholder="Type a player's name, e.g. Puka Nacua" autocomplete="off">
        <div class="ed-res" id="edRes"></div></div>
      <div class="ed-btns"><button class="obtn solid" id="edSave">Save</button><button class="obtn" id="edCancel">Cancel</button><span class="ed-msg" id="edMsg"></span></div>
    </div>`;
  const $ = s => host.querySelector(s);
  const drawPick = () => {
    $("#edPick").innerHTML = pick ? `<div class="ed-picked">${TBC.compHTML(pick)}<button class="obtn sm" id="edClear">Remove comp</button></div>` : "";
    const c = host.querySelector("#edClear"); if (c) c.onclick = () => { pick = null; drawPick(); };
  };
  drawPick();
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
    try { await TBC.saveProfile(slug, {nickname: $("#edNick").value, comp: pick}); onDone(); }
    catch(err){ $("#edSave").disabled = false; $("#edMsg").textContent = "Couldn't save: " + (err.code === "permission-denied" ? "you don't have edit access." : err.message); }
  };
  $("#edNick").focus();
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
  box.innerHTML = `
    <span class="ab-name" title="${esc(u.email)}">${esc(u.name.split(" ")[0])}</span>
    ${chip ? `<span class="ab-chip ab-${TBC.role}">${chip}</span>` : ""}
    ${TBC.role === "viewer" ? `<button class="obtn sm" id="abReq">Request edit access</button>` : ""}
    ${TBC.role === "admin" ? `<button class="obtn sm" id="abAdmin">Manage editors</button>` : ""}
    <button class="obtn sm" id="abOut">Sign out</button>`;
  box.querySelector("#abOut").onclick = TBC.signOut;
  const rq = box.querySelector("#abReq"); if (rq) rq.onclick = async () => {
    try { await TBC.requestAccess(); alert("Request sent. Jack will see it and can approve you."); } catch(e){ alert("Couldn't send the request: " + e.message); }
  };
  const ad = box.querySelector("#abAdmin"); if (ad) ad.onclick = openAdmin;
}
renderAuthBox();

async function openAdmin(){
  let ov = document.getElementById("adminOv");
  if (!ov) {
    ov = document.createElement("div"); ov.id = "adminOv"; ov.className = "ov";
    ov.innerHTML = `<div class="pc adminpc"><div class="pc-head"><div><h2 class="pc-name">Manage editors</h2>
      <div class="pc-meta">Editors can change nicknames and player comps. Nothing else on the site.</div></div>
      <button class="pc-close" aria-label="Close">✕</button></div><div class="pc-body" id="adminBody"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) ov.hidden = true; });
    ov.querySelector(".pc-close").onclick = () => ov.hidden = true;
  }
  ov.hidden = false;
  const body = ov.querySelector("#adminBody");
  body.innerHTML = `<div class="ed-none">Loading…</div>`;
  const [rq, ed] = await Promise.all([getDocs(collection(db, "requests")), getDocs(collection(db, "editors"))]);
  const row = (d, btns) => `<div class="adm-row"><div><b>${esc(d.data().name)}</b><small>${esc(d.data().email)}</small></div><div>${btns}</div></div>`;
  body.innerHTML = `
    <div class="sec-t" style="margin-bottom:8px">Requests (${rq.size})</div>
    ${rq.size ? rq.docs.map(d => row(d, `<button class="obtn solid sm" data-ok="${esc(d.id)}">Approve</button> <button class="obtn sm" data-no="${esc(d.id)}">Deny</button>`)).join("") : `<div class="ed-none">No requests right now. Friends sign in and tap “Request edit access”.</div>`}
    <div class="sec-t" style="margin:18px 0 8px">Editors (${ed.size})</div>
    ${ed.size ? ed.docs.map(d => row(d, `<button class="obtn sm" data-rm="${esc(d.id)}">Remove</button>`)).join("") : `<div class="ed-none">No editors yet.</div>`}`;
  const byId = Object.fromEntries(rq.docs.map(d => [d.id, d.data()]));
  body.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => {
    const r = byId[b.dataset.ok];
    await setDoc(doc(db, "editors", b.dataset.ok), {name: r.name, email: r.email, at: serverTimestamp()});
    await deleteDoc(doc(db, "requests", b.dataset.ok)); openAdmin();
  });
  body.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => { await deleteDoc(doc(db, "requests", b.dataset.no)); openAdmin(); });
  body.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => {
    if (!confirm("Remove this editor? They won't be able to change nicknames or comps anymore.")) return;
    await deleteDoc(doc(db, "editors", b.dataset.rm)); openAdmin();
  });
}
