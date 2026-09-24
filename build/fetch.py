"""Fetch Met highlights with public-domain images, save metadata + 96x96 letterboxed grayscale."""
import json, random, io, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import numpy as np

API = "https://collectionapi.metmuseum.org/public/collection/v1"
S = 96
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 900
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"}
import os
os.makedirs("build/cache", exist_ok=True)

import http.cookiejar, threading
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
lock = threading.Lock(); last = [0.0]
PACE = float(os.environ.get("PACE", "0.9"))  # seconds between API calls (Imperva throttles bursts)

def get(url, tries=6):
    for i in range(tries):
        if "collectionapi" in url:
            with lock:
                wait = last[0] + PACE - time.time()
                if wait > 0: time.sleep(wait)
                last[0] = time.time()
        try:
            with opener.open(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            print("http", e.code, "- backing off", flush=True); time.sleep(60 * (i + 1))
        except Exception:
            time.sleep(3 * (i + 1))
    return None

ids = json.loads(get(f"{API}/search?hasImages=true&isHighlight=true&q=*"))["objectIDs"]
random.seed(7)
random.shuffle(ids)

def process(oid):
    c = f"build/cache/{oid}"
    if os.path.exists(c + ".none"): return None
    if os.path.exists(c + ".json"):
        b = open(c + ".bin", "rb").read()
        return json.load(open(c + ".json")), np.frombuffer(b[:S*S], np.uint8), np.frombuffer(b[S*S:], np.uint8)
    res = process_net(oid)
    if res == "skip": open(c + ".none", "w").close(); return None
    if res is not None:
        json.dump(res[0], open(c + ".json", "w")); open(c + ".bin", "wb").write(res[1].tobytes() + res[2].tobytes())
    return res

def process_net(oid):
    raw = get(f"{API}/objects/{oid}")
    if not raw: return None
    o = json.loads(raw)
    url = o.get("primaryImageSmall")
    if not url or not o.get("isPublicDomain"): return "skip"
    img = get(url)
    if not img: return None
    try:
        im = Image.open(io.BytesIO(img)); im.draft("L", (S * 2, S * 2)); im = im.convert("L")
    except Exception:
        return None
    w, h = im.size
    k = S / max(w, h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    small = im.resize((nw, nh), Image.LANCZOS)
    gray = np.zeros((S, S), np.uint8); mask = np.zeros((S, S), np.uint8)
    x0, y0 = (S - nw) // 2, (S - nh) // 2
    gray[y0:y0 + nh, x0:x0 + nw] = np.asarray(small); mask[y0:y0 + nh, x0:x0 + nw] = 1
    meta = dict(id=oid, t=o.get("title", ""), a=o.get("artistDisplayName", ""), d=o.get("objectDate", ""),
                dep=o.get("department", ""), img=url, url=o.get("objectURL", ""), w=w, h=h)
    return meta, gray, mask

metas, grays, masks = [], [], []
with ThreadPoolExecutor(3) as ex:
    for i, res in enumerate(ex.map(process, ids[: int(TARGET * 1.6)])):
        if res and len(metas) < TARGET:
            metas.append(res[0]); grays.append(res[1]); masks.append(res[2])
        if i % 25 == 0: print(i, len(metas), flush=True)

json.dump(metas, open("build/meta.json", "w"), ensure_ascii=False)
with open("build/pixels.bin", "wb") as f:
    for g, m in zip(grays, masks): f.write(g.tobytes()); f.write(m.tobytes())
print("done", len(metas))
