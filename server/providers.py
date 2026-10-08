"""Fictional hospital/clinic master list (demo). Production reads the HMS Provider module."""
import random

from . import meta

_PROVIDERS = None
PREFIX = ["St.", "Our Lady of", "Holy", "Metro", "Providence", "Mercy", "Good Samaritan", "Sacred", "Unity", "Bayview",
          "Riverside", "Hillcrest", "Sunrise", "Northpoint", "Southgate", "Pacific", "Medical Arts", "Family", "Lakeside", "Greenfield"]
NOUN = ["Luke's", "Grace", "Hope", "Cross", "Heart", "Peace", "Care", "Life", "Health", "Wellness", "Healing", "Mission"]


def providers():
    global _PROVIDERS
    if _PROVIDERS is not None:
        return _PROVIDERS
    rnd = random.Random(42)
    out = []
    cities = [(p, c, g["region"]) for p, g in meta.GEO.items() for c in g["cities"]]
    hi = ci = 0
    for i in range(1500):
        prov, city, region = cities[i % len(cities)]
        is_h = i % 3 != 2
        name = f"{rnd.choice(PREFIX)} {rnd.choice(NOUN)} {'Hospital' if is_h else 'Clinic'} - {city}"
        if is_h:
            hi += 1
            code = f"H{hi:05d}"
        else:
            ci += 1
            code = f"C{ci:05d}"
        out.append({"code": code, "name": name, "type": "H" if is_h else "C", "city": city, "province": prov,
                    "region": region, "tier": rnd.choice(["Tier 1", "Tier 2", "Tier 3"]),
                    "accreditation": "Accredited" if rnd.random() > 0.06 else "Suspended"})
    _PROVIDERS = out
    return out


def by_code():
    return {p["code"]: p for p in providers()}


def search(q="", ptype=None, city=None, region=None, tier=None, limit=50):
    q = (q or "").strip().lower()
    res = []
    for p in providers():
        if ptype and p["type"] != ptype:
            continue
        if city and p["city"] != city:
            continue
        if region and p["region"] != region:
            continue
        if tier and p["tier"] != tier:
            continue
        if q and q not in p["name"].lower() and q not in p["code"].lower():
            continue
        res.append(p)
    return {"total": len(res), "items": res[:limit]}
