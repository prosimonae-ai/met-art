"""Add detail fields (nationality, medium, Wikidata/Wikipedia description) to cached artworks.

The Met's public API has no label text and metmuseum.org pages sit behind a bot checkpoint,
so the description comes from the English Wikipedia article linked via the Met's own Wikidata ID
when there is one. Everything else comes from the Met API.
"""
import json, os, time, glob, urllib.request, urllib.parse, http.cookiejar

API = "https://collectionapi.metmuseum.org/public/collection/v1"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"}
WUA = {"User-Agent": "met-sketch-prototype/0.1 (educational demo)"}
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
PACE = float(os.environ.get("PACE", "1.0"))

def get(url, headers=UA, tries=5, pace=0.0):
    for i in range(tries):
        time.sleep(pace)
        try:
            with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            print("http", e.code, url[:80], "- backing off", flush=True); time.sleep(60 * (i + 1))
        except Exception:
            time.sleep(3 * (i + 1))
    return None

ids = [os.path.basename(p)[:-5] for p in glob.glob("build/cache/*.json") if not p.endswith(".ext.json")]
KEEP = ["artistDisplayName", "artistNationality", "artistDisplayBio", "medium", "dimensions", "culture",
        "period", "classification", "creditLine", "department", "objectWikidata_URL"]

# 1. Met API details
for n, oid in enumerate(ids):
    out = f"build/cache/{oid}.ext.json"
    if os.path.exists(out): continue
    o = get(f"{API}/objects/{oid}", pace=PACE)
    if o is None: continue
    json.dump({k: o.get(k, "") for k in KEEP}, open(out, "w"))
    if n % 50 == 0: print("met", n, len(ids), flush=True)

# 2. Wikidata -> English Wikipedia summary
exts = {oid: json.load(open(f"build/cache/{oid}.ext.json")) for oid in ids if os.path.exists(f"build/cache/{oid}.ext.json")}
qids = {oid: e["objectWikidata_URL"].rsplit("/", 1)[-1] for oid, e in exts.items() if e.get("objectWikidata_URL")}
titles = {}
ql = sorted(set(qids.values()))
for i in range(0, len(ql), 50):
    r = get("https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks|descriptions&sitefilter=enwiki&languages=en&format=json&ids="
            + "|".join(ql[i:i + 50]), WUA, pace=0.3)
    for q, ent in (r or {}).get("entities", {}).items():
        titles[q] = ((ent.get("sitelinks") or {}).get("enwiki") or {}).get("title")
print("wikidata", len(qids), "with enwiki:", sum(1 for t in titles.values() if t), flush=True)

for oid, q in qids.items():
    e = exts[oid]
    if "desc" in e: continue
    t = titles.get(q)
    e["desc"] = ""
    if t:
        s = get("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_"), safe=""), WUA, pace=0.2)
        if s and s.get("type") == "standard":
            e["desc"], e["descSrc"] = s.get("extract", ""), (s.get("content_urls") or {}).get("desktop", {}).get("page", "")
    json.dump(e, open(f"build/cache/{oid}.ext.json", "w"))
print("done; descriptions:", sum(1 for e in exts.values() if e.get("desc")), "/", len(exts), flush=True)
