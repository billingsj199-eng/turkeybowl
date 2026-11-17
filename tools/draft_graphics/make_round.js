// Turkey Bowl draft graphics: one Instagram carousel per round (1080x1350 PNGs).
//   slide 1 = round recap (every pick), slides 2+ = one "The pick is in" breakdown card per pick.
// Reads the LIVE draft + board from Firestore (public, read-only) and the board/players from index.html.
//
//   node tools/draft_graphics/make_round.js <round>        (run from E:\TurkeyBowl, needs Node 18+ and Chrome or Edge)
//
// Output: tools/graphics/round-<n>/01-round-<n>-recap.png, 02-pick-<n>.01.png ...  (+ out/preview.html to eyeball all slides)
// Picks not made yet are filled with the best available and tagged SAMPLE (file names end in -sample).
//
// Grades (tiers first, then rank):
//   - passing over a better tier: -3 per tier skipped, -0.5 per better-tier player still left (up to 4)
//   - a better tier than that slot usually gets (tier of board #<pick>): +2 per tier
//   - rank: 1 spot early is free, then -0.75 per spot (up to 8); each spot past board rank +0.4 (up to 8)
//   A+ >= 2.5 > A >= 0.6 > A- >= -0.5 > B+ >= -1.25 > B >= -2 > B- >= -3 > C+ >= -4.5 > C >= -6 > D >= -8 > F
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const ROUND = +(process.argv[2] || 0);
if (!ROUND) { console.error("usage: node tools/draft_graphics/make_round.js <round number>"); process.exit(1); }
const HERE = __dirname, TB = path.resolve(HERE, "../.."), OUT = path.join(HERE, "out"), PNG = path.join(TB, "tools", "graphics", "round-" + ROUND);
const API = "https://firestore.googleapis.com/v1/projects/gallturkeybowl/databases/(default)/documents/";

const c = v => v.stringValue ?? (v.integerValue != null ? +v.integerValue : undefined) ?? v.booleanValue ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, c(x)])) : v.arrayValue ? (v.arrayValue.values || []).map(c) : v.nullValue === null ? null : v.timestampValue);
const fields = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, c(v)]));
const get = async p => { const r = await fetch(API + p); if (!r.ok && r.status !== 404) throw new Error(p + ": HTTP " + r.status); return r.json(); };

(async () => {
  const [players_, order_, draft_, teams_, photos_] = await Promise.all([get("players?pageSize=300"), get("board/order"), get("draft/2026"), get("teamInfo?pageSize=50"), get("photos?pageSize=300")]);
  if (draft_.error) throw new Error("The live draft (draft/2026) hasn't started.");
  const html = fs.readFileSync(path.join(TB, "index.html"), "utf8");
  const at = html.indexOf("const PLAYERS = [");
  const PLAYERS = eval("(" + html.slice(at + 16, html.indexOf("\n];", at) + 2) + ")");
  const SEASON = +(html.match(/const CURRENT_SEASON = (\d{4})/) || [, 2026])[1];
  const FD = JSON.parse(fs.readFileSync(path.join(TB, "film_data.js"), "utf8").replace(/^[^{]*/, "").replace(/;\s*$/, ""));
  const prof = {}; (players_.documents || []).forEach(d => prof[d.name.split("/").pop()] = fields(d));
  const order = order_.fields ? (fields(order_).order || []) : [];
  const L = fields(draft_);
  const teamInfo = {}; (teams_.documents || []).forEach(d => { const v = fields(d); if (v.season === String(SEASON)) teamInfo[v.cap] = v; });
  const photos = {}; (photos_.documents || []).forEach(d => photos[d.name.split("/").pop()] = fields(d).img);

  // ---- the board, same as index.html buildPlayers() ----
  const TIERS = ["QB", "S", "A", "B", "C", "D", "NA"], TI = k => TIERS.indexOf(k), norm = t => (!t || t === "N/A") ? "NA" : t;
  const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const split = n => { const p = n.trim().split(/\s+/); return { first: p.slice(0, -1).join(" "), last: p[p.length - 1] }; };
  const list = PLAYERS.map(p => ({ ...p }));
  Object.entries(prof).forEach(([s, d]) => { if (d.added && d.name && !list.some(p => slug(p.name) === s)) list.push({ name: d.name, tier25: "N/A", added: true }); });
  const players = list.map(p => { const cp = prof[slug(p.name)] || {}; return { ...p, ...split(p.name), tier: norm(cp.tier || p.tier26 || p.tier25), prev: norm(p.tier25) }; });
  const ord = new Map(order.map((s, i) => [s, i])), oi = p => ord.has(slug(p.name)) ? ord.get(slug(p.name)) : 1e6;
  players.sort((a, b) => TI(a.tier) - TI(b.tier) || oi(a) - oi(b) || a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
  let flex = 0; players.forEach(p => { if (p.tier !== "QB") p.rank = ++flex; });
  const byName = Object.fromEntries(players.map(p => [p.name, p]));

  // ---- draft helpers, same as index.html / tb-cloud.js ----
  const n = L.order.length, snake = i => { const r = Math.floor(i / n), s = i % n; return L.order[r % 2 === 0 ? s : n - 1 - s]; };
  const owner = i => (L.owners || {})[String(i)] || snake(i);
  const label = i => `${Math.floor(i / n) + 1}.${String(i % n + 1).padStart(2, "0")}`;
  const teamName = cap => (teamInfo[cap] || {}).name || "Team " + split(cap).last;
  const PAL = ["#e9b949", "#ef6b5f", "#5fd68f", "#4b9ce8", "#c58af9", "#f28c38", "#2ec4b6", "#e8ecf4"];
  const teamColor = cap => (teamInfo[cap] || {}).color || PAL[L.order.indexOf(cap) % PAL.length];
  const img = name => { const s = slug(name); if (photos[s]) return photos[s]; for (const e of ["jpg", "png", "jpeg", "webp"]) if (fs.existsSync(path.join(TB, "images", `${s}.${e}`))) return `../../../images/${s}.${e}`; return ""; };

  const rounds = Math.ceil(L.pool.length / n);
  if (ROUND > rounds) throw new Error(`There are only ${rounds} rounds.`);
  const picks = [...L.picks], sample = new Set();
  const first = (ROUND - 1) * n, last = Math.min(ROUND * n, L.pool.length) - 1;
  for (let i = picks.length; i <= last; i++) { const nxt = L.pool.filter(x => !picks.includes(x)).sort((a, b) => (byName[a]?.rank ?? 1e6) - (byName[b]?.rank ?? 1e6))[0]; picks.push(nxt); sample.add(i); }

  const H = FD.history || {};
  const short = a => /most valuable|^mvp/i.test(a) ? "MVP" : /def/i.test(a) ? "DPOY" : /rookie/i.test(a) ? "ROTY" : /improved/i.test(a) ? "MIP" : a;
  const honors = name => [
    ...(H.champions || []).filter(ch => ch.captain === name || (ch.roster || []).includes(name)).map(ch => `🏆 ${ch.season} champion`),
    ...(H.awards || []).filter(a => a.winner === name).map(a => `🏅 ${a.season} ${short(a.award)}`),
    ...(H.awards || []).filter(a => (a.finalists || []).includes(name)).map(a => `${a.season} ${short(a.award)} finalist`),
  ];
  const tierScore = (p, i) => {
    const avail = L.pool.filter(x => !picks.slice(0, i).includes(x)).map(x => byName[x]).filter(Boolean);
    const best = avail.reduce((b, x) => TI(x.tier) < TI(b) ? x.tier : b, "NA");
    const better = avail.filter(x => TI(x.tier) < TI(p.tier));
    const slotP = players.find(x => x.rank === i + 1), slotTier = slotP ? slotP.tier : "D";
    const passed = Math.max(0, TI(p.tier) - TI(best)), slotGap = Math.max(0, TI(slotTier) - TI(p.tier));
    const v = p.rank ? (i + 1) - p.rank : 0;
    const rankPart = v < 0 ? -0.75 * Math.max(0, Math.min(8, -v) - 1) : 0.4 * Math.min(8, v);
    const score = 2 * slotGap - (passed ? 3 * passed + 0.5 * Math.min(better.length, 4) : 0) + rankPart;
    return { score, best, betterN: better.length, passed, slotGap, slotTier, v };
  };
  const grade = s => s >= 2.5 ? "A+" : s >= 0.6 ? "A" : s >= -0.5 ? "A-" : s >= -1.25 ? "B+" : s >= -2 ? "B" : s >= -3 ? "B-" : s >= -4.5 ? "C+" : s >= -6 ? "C" : s >= -8 ? "D" : "F";
  const verdict = (t, p, o) => t.passed ? `Tier reach: passed ${t.betterN} ${t.best}-tier player${t.betterN > 1 ? "s" : ""} for a ${p.tier} tier (board #${p.rank}).`
    : t.slotGap ? `Steal: a ${p.tier}-tier player at a ${t.slotTier}-tier slot (board #${p.rank}, taken #${o}).`
    : t.v >= 2 ? `Value: board #${p.rank} lasted to #${o}, right tier.`
    : t.v >= -1 ? `On the board: ${p.tier} tier, board #${p.rank} at pick #${o}.`
    : t.v >= -3 ? `A bit early (board #${p.rank}, taken #${o}), but the right tier.`
    : `Rank reach: board #${p.rank} went #${o}. Right tier, wrong spot.`;
  const moveTxt = p => p.prev === "NA" ? "New for " + SEASON : TI(p.prev) > TI(p.tier) ? `Up from ${p.prev} tier in '${String(SEASON - 1).slice(2)}` : TI(p.prev) < TI(p.tier) ? `Down from ${p.prev} tier in '${String(SEASON - 1).slice(2)}` : `${p.tier} tier in '${String(SEASON - 1).slice(2)} too`;
  const ht = h => h ? String(h).replace("-", "'") + '"' : null;

  const pickData = i => {
    const name = picks[i], p = byName[name] || { name, ...split(name), tier: "NA", prev: "NA", rank: null }, cp = prof[slug(name)] || {};
    const cap = owner(i), ts = tierScore(p, i), v = ts.v;
    const roster = picks.slice(0, i + 1).map((x, j) => ({ x, j })).filter(r => ((L.moved || {})[r.x] || owner(r.j)) === cap).map(r => r.x);
    const nextI = i + 1 < L.pool.length ? i + 1 : null;
    return {
      i, label: label(i), overall: i + 1, round: Math.floor(i / n) + 1, sample: sample.has(i),
      name, first: p.first, last: p.last, nick: cp.nickname || "", tier: p.tier, rank: p.rank, move: moveTxt(p), isNew: p.prev === "NA",
      img: img(name), college: cp.college || null, comp: cp.comp || null,
      bio: [cp.num ? "#" + cp.num : null, cp.age ? "Age " + cp.age : null, ht(cp.ht), cp.wt ? cp.wt + " lbs" : null].filter(Boolean),
      honors: honors(name), value: v, score: ts.score, bestLeft: ts.best, grade: p.rank ? grade(ts.score) : "—", verdict: p.rank ? verdict(ts, p, i + 1) : "",
      team: { cap, name: teamName(cap), color: teamColor(cap), logo: (teamInfo[cap] || {}).logo || "", img: img(cap), viaTrade: cap !== snake(i) ? teamName(snake(i)) : "" },
      roster, next: nextI == null ? null : { label: label(nextI), team: teamName(owner(nextI)), color: teamColor(owner(nextI)) },
    };
  };
  const round = []; for (let i = first; i <= last; i++) round.push(pickData(i));
  const steal = round.reduce((a, b) => b.score > a.score ? b : a), reach = round.reduce((a, b) => b.score < a.score ? b : a);
  const nextRound = last + 1 < L.pool.length ? { label: label(last + 1), team: teamName(owner(last + 1)), color: teamColor(owner(last + 1)) } : null;
  const DATA = { season: SEASON, round: ROUND, rounds, picks: round, steal: steal.name, reach: reach.score < -0.5 ? reach.name : null, nextRound };

  // ---- write pages, then screenshot each slide at 1080x1350 ----
  const tpl = fs.readFileSync(path.join(HERE, "template.html"), "utf8").replace("/*DATA*/null", () => JSON.stringify(DATA));
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
  fs.writeFileSync(path.join(OUT, "preview.html"), tpl);
  fs.readdirSync(PNG).filter(f => f.endsWith(".png")).forEach(f => fs.unlinkSync(path.join(PNG, f)));
  const browser = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(f => fs.existsSync(f));
  if (!browser) throw new Error("Chrome or Edge not found. Open out/preview.html to see the slides.");
  const names = [`01-round-${ROUND}-recap`, ...round.map((p, k) => `${String(k + 2).padStart(2, "0")}-pick-${p.label}${p.sample ? "-sample" : ""}`)];
  names.forEach((nm, k) => {
    const page = path.join(OUT, `slide_${k}.html`);
    fs.writeFileSync(page, tpl.replace("/*SINGLE*/null", String(k)));
    const r = spawnSync(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1080,1350",
      "--virtual-time-budget=8000", `--user-data-dir=${path.join(OUT, ".profile")}`, `--screenshot=${path.join(PNG, nm + ".png")}`, "file:///" + page.replace(/\\/g, "/")], { encoding: "utf8", timeout: 90000 });
    if (!fs.existsSync(path.join(PNG, nm + ".png"))) throw new Error("Couldn't render " + nm + ": " + (r.stderr || r.error || "").toString().slice(-300));
  });
  console.log(`Round ${ROUND}: ${names.length} images in ${path.relative(TB, PNG)}`);
  round.forEach(p => console.log(`  ${p.label} ${p.team.name}: ${p.name}  ${p.grade}${p.sample ? "  (SAMPLE: not picked yet)" : ""}`));
})().catch(e => { console.error("Error:", e.message); process.exit(1); });
