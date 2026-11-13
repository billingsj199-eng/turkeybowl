r"""Rebuild colleges.js (the school list behind the College tag search).

Sources:
  1. ESPN college football + men's basketball team lists (all football divisions, D-I basketball). id = ESPN team id,
     logo a.espncdn.com/i/teamlogos/ncaa/500-dark/<id>.png.
  2. NCAA.com schools index (every NCAA school, D-I to D-III). Added only when ESPN doesn't already have the school.
     id = "n-<ncaa slug>", logo ncaa.com/sites/default/files/images/logos/schools/bgd/<slug>.svg.
Run from E:\TurkeyBowl:  python tools/build_colleges.py
"""
import html, json, re, urllib.request

UA = {"User-Agent": "Mozilla/5.0"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode("utf-8")

def key(s):
    s = html.unescape(s).lower().replace("&", " and ")
    s = re.sub(r"\bst\.?(?=\s|$)", "state", s) if not s.startswith("st") else re.sub(r"\bst\.?(?=\s|$)", "saint", s, count=1)
    s = re.sub(r"\b(university|college|of|the|at|suny)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)

rows, seen = [], set()
for sport in ["football/college-football", "basketball/mens-college-basketball"]:
    d = json.loads(get(f"https://site.api.espn.com/apis/site/v2/sports/{sport}/teams?limit=2000"))
    for x in d["sports"][0]["leagues"][0]["teams"]:
        t = x["team"]; tid = str(t["id"])
        if not tid.isdigit() or tid in {r[3] for r in rows}: continue
        name = t.get("location") or t.get("shortDisplayName")
        rows.append([name, t["displayName"], t.get("abbreviation", ""), tid])
        seen.update({key(name), key(t["displayName"].rsplit(" ", 1)[0])})

added = 0
for i in range(60):
    try: page = get(f"https://www.ncaa.com/schools-index/{i}")
    except Exception: break
    found = []   # one school per table row, so a row with missing cells can't borrow the next row's slug
    for tr in re.findall(r"<tr>(.*?)</tr>", page, re.S):
        m = re.search(r'<td><a href="/schools/([^"]+)">([^<]+)</a></td>\s*<td>([^<]*)</td>', tr)
        if m: found.append(m.groups())
    if not found: break
    for slug, short, full in found:
        short, full = html.unescape(short).strip(), html.unescape(full).strip()
        if key(short) in seen or key(full) in seen: continue
        name = re.sub(r"\bSt\.$", "State", short.replace("-", " ") if "-" in short and " " not in short else short)
        rows.append([name, full, "", "n-" + slug]); seen.update({key(short), key(full)}); added += 1

rows.sort(key=lambda r: r[0].lower())
open("colleges.js", "w", encoding="utf-8").write(
    "// College list for the College tag. [school, full name, abbreviation, id]\n"
    "// id = ESPN team id (logo a.espncdn.com/i/teamlogos/ncaa/500-dark/<id>.png) or \"n-<slug>\" for an NCAA.com school\n"
    "// (logo ncaa.com/sites/default/files/images/logos/schools/bgd/<slug>.svg). Rebuild: python tools/build_colleges.py\n"
    "window.TB_COLLEGES = " + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(rows), "schools,", added, "added from NCAA.com")
