// ===================== TURKEY BOWL CLOUD (sign-in, nicknames, comps) =====================
// Firebase project "gallturkeybowl" (Turkey Bowl only). Rules live in firestore.rules.
//   players/{slug}  {nickname, comp:{name,team,league,id,img}|null, tier, name+added (players added on the site), by, at}
//   board/order     {order: [slug, ...], by, at}  - drag-and-drop order on the Draft Board (tiers stay on players/{slug})
//   draft/<season>  the live draft: {status: "live"|"done", order: [captains], pool: [players], picks: [names], by, at}
//   photos/{slug}   {img: small JPEG as a data: URL, by, at}  - headshot uploaded on the site (beats images/*.jpg)
//   requests/{uid}  "Request edit access"      editors/{uid}  people Jack approved
// Everyone sees all of it. Only approved editors (and the admin) can change it.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch, runTransaction }
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
  ready: false, user: null, role: "viewer", profiles: {}, photos: {}, order: [], live: null,
  canEdit(){ return this.role === "editor" || this.role === "admin"; },
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
const by = () => (TBC.user?.name || "").slice(0, 60);
const slugOf = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Only the fields passed in change (merge), so a nickname edit never wipes a position change and vice versa.
TBC.saveProfile = async (slug, {nickname, comp, tier}) => {
  const d = {by: by(), at: serverTimestamp()};
  if (nickname !== undefined) d.nickname = (nickname || "").trim().slice(0, 30);
  if (comp !== undefined) d.comp = comp ? {name: comp.name.slice(0, 60), team: (comp.team || "").slice(0, 60), league: comp.league, id: String(comp.id), img: comp.img} : null;
  if (tier !== undefined) d.tier = tier;
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
  tx.update(draftRef, {picks: d.picks.slice(0, -1), status: "live", by: by(), at: serverTimestamp()});
});
TBC.liveReset = () => deleteDoc(draftRef);
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
TBC.shrinkPhoto = file => new Promise((ok, bad) => {
  if (!file || !/^image\//.test(file.type)) return bad(new Error("That isn't a picture."));
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    const S = 256, side = Math.min(im.naturalWidth, im.naturalHeight);
    const sx = (im.naturalWidth - side) / 2, sy = (im.naturalHeight - side) * 0.3;
    const c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(im, sx, sy, side, side, 0, 0, S, S);
    URL.revokeObjectURL(url);
    let q = 0.85, out = c.toDataURL("image/jpeg", q);
    while (out.length > 140000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
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
  let pick = cur.comp || null, timer = null, seq = 0, newPhoto;   // newPhoto: undefined = unchanged, "" = remove, data URL = new
  const ini = esc((p.first[0] || "") + (p.last[0] || ""));
  host.innerHTML = `
    <div class="ed">
      <div class="ed-row"><label>Headshot</label>
        <div class="ed-photo"><span id="edPh"></span>
          <label class="obtn sm" style="margin:0;cursor:pointer">📷 Upload photo<input type="file" id="edFile" accept="image/*"></label>
          <button class="obtn sm" id="edPhRm" type="button" ${TBC.photo(slug) ? "" : "hidden"}>Remove uploaded photo</button></div>
        <div class="ed-hint">Any photo works. It's cropped to a square around the face and shrunk.</div></div>
      ${posTierHTML(p.pos, p.tier === "QB" ? (p.prev !== "QB" ? p.prev : "NA") : p.tier)}
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
      await TBC.saveProfile(slug, {nickname: $("#edNick").value, comp: pick, ...(tier !== p.tier ? {tier} : {})});
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
      ${TBC.role === "viewer" ? `<button class="obtn sm" id="abReq">Request edit access</button>` : ""}
      ${TBC.role === "admin" ? `<button class="obtn sm" id="abAdmin">Manage editors</button>` : ""}
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
    ov.innerHTML = `<div class="pc adminpc"><div class="pc-head"><div><h2 class="pc-name">Manage editors</h2>
      <div class="pc-meta">Editors can change nicknames, player comps, headshots and positions/tiers, and add players. Nothing else on the site.</div></div>
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
    if (!confirm("Remove this editor? They won't be able to edit players anymore.")) return;
    await deleteDoc(doc(db, "editors", b.dataset.rm)); openAdmin();
  });
}
