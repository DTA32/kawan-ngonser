#!/usr/bin/env python3
"""Look up real artist photos on the Deezer API (free, no API key).

Writes artist_images.json: {artist_name: {image, deezer_name, deezer_id, link,
nb_fan, query}} for every rundown artist with a confident match. Run
generate_migrations.py afterwards to bake the photos into the migration JSONs.

Matching is strict: a Deezer result is accepted only when its name equals the
query after normalization (lowercase, alphanumerics only), and only when the
artist actually has a photo (Deezer serves an empty-md5 placeholder otherwise).
Unmatched artists keep the ui-avatars placeholder — review the printed report
and add manual entries to artist_images.json if needed.
"""
import json
import re
import time
import urllib.request
import urllib.parse

from generate_migrations import IMAGES_FILE, all_artist_names

API = "https://api.deezer.com/search/artist?limit=5&q="
SKIP = {"Secret Guest"}  # intentionally anonymous
# Poster name -> stylized/representative names to also try
ALIASES = {
    "Smash": ["SM*SH"],       # Indonesian boyband, stylized on Deezer
    "Sore Ze Band": ["Sore"],  # extended name of the band Sore
}
# Poster name -> Deezer ids that exact-match the name but are a DIFFERENT artist
# (verified by eyeballing the returned photos)
WRONG_MATCHES = {
    "Tribute to Oasis by Magicpie ft. Aldi Taher": {1008857},  # Norwegian prog band "Magic Pie"
    "Smash": {79351, 712924},  # European solo singer / Polish disco-polo group
    "Sore Ze Band": {92236},   # Romanian pop singer "Sore", not the Indonesian band
    "Tulus": {7082173},        # Norwegian black metal band, not the Indonesian singer
    "Float": {303261271},      # western band, not the Indonesian duo
}
# Curated photos for artists Deezer has no usable image for (headliners deserve
# better than an initials placeholder). Wikimedia Commons thumbnails, CC-licensed.
MANUAL_OVERRIDES = {
    "Tulus": {
        "image": ("https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/"
                  "Tulus_Performs_at_Jakarta_International_Jazz_Java_Festival_2020_"
                  "%28cropped%29.jpg/330px-Tulus_Performs_at_Jakarta_International_"
                  "Jazz_Java_Festival_2020_%28cropped%29.jpg"),
        "source": "wikipedia",
        "link": "https://en.wikipedia.org/wiki/Tulus_(singer)",
    },
    "Smash": {
        "image": ("https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/"
                  "Sm%2Ash_crop.jpg/330px-Sm%2Ash_crop.jpg"),
        "source": "wikipedia",
        "link": "https://en.wikipedia.org/wiki/Smash_(Indonesian_band)",
    },
}
# Deezer serves grey-silhouette placeholders from regular md5 image URLs; the
# only reliable tell is size (placeholders compress to <3 KB, photos are 8 KB+).
MIN_PHOTO_BYTES = 5000


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def candidates(name):
    out = list(ALIASES.get(name, []))  # curated aliases beat the ambiguous poster name
    out.append(name)
    out.append(re.sub(r"\s*\([^)]*\)", "", name))          # drop "(UK)" etc.
    m = re.match(r"(?i)tribute to .+? by (.+)$", name)     # performers of a tribute set
    if m:
        out += re.split(r"(?i)\s+ft\.?\s+", m.group(1))
    if ":" in name:
        before, after = name.split(":", 1)
        out.append(before)                                 # "Suara Wijaya 80: ..."
        out += [p.strip() for p in after.split(",")]       # ...listed performers
    for paren in re.findall(r"\(([^)]+)\)", name):         # "(Payung Teduh x Pusakata)"
        out.append(paren)
        out.append(re.split(r"\s+[xX]\s+", paren)[0])
    out.append(re.split(r"\s+[xX]\s+", name)[0])           # first act of a collab
    out.append(re.split(r"\s+&\s+", name)[0])              # "Jason Ranti & Dongker"
    out.append(re.split(r"(?i)\s+(?:ft\.?|feat\.?)\s+", name)[0])
    out.append(name.lstrip(".!*"))                         # ".Feast" -> "Feast"
    seen, uniq = set(), []
    for c in out:
        c = c.strip()
        if c and norm(c) and norm(c) not in seen:
            seen.add(norm(c))
            uniq.append(c)
    return uniq


def search(query):
    url = API + urllib.parse.quote(query)
    for attempt in (1, 2):
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
        if "error" not in data:
            return data.get("data", [])
        time.sleep(5)  # rate-limited; one retry
    return []


def has_real_photo(url):
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return len(resp.read()) >= MIN_PHOTO_BYTES
    except OSError:
        return False


def lookup(name):
    blocked = WRONG_MATCHES.get(name, set())
    for query in candidates(name):
        # Deezer hosts duplicate profiles (e.g. three "Tulus"); try exact
        # matches from most-followed down until one has an actual photo.
        exact = [hit for hit in search(query)
                 if norm(hit["name"]) == norm(query)
                 and hit["id"] not in blocked
                 and hit.get("picture_medium") and "/artist//" not in hit["picture_medium"]]
        for hit in sorted(exact, key=lambda h: h.get("nb_fan", 0), reverse=True):
            if has_real_photo(hit["picture_medium"]):
                return {
                    "image": hit["picture_medium"],
                    "source": "deezer",
                    "deezer_name": hit["name"],
                    "deezer_id": hit["id"],
                    "link": hit["link"],
                    "nb_fan": hit.get("nb_fan", 0),
                    "query": query,
                }
        time.sleep(0.15)
    return None


def main():
    names = [n for n in all_artist_names() if n not in SKIP]
    matched, missed = {}, []
    for i, name in enumerate(names, 1):
        if name in MANUAL_OVERRIDES:
            matched[name] = MANUAL_OVERRIDES[name]
            print(f"[{i}/{len(names)}] {name} -> manual override ({matched[name]['source']})")
            continue
        info = lookup(name)
        if info:
            matched[name] = info
            exact = "" if norm(info["query"]) == norm(name) else f"  (via \"{info['query']}\")"
            print(f"[{i}/{len(names)}] {name} -> {info['deezer_name']}"
                  f" ({info['nb_fan']} fans){exact}")
        else:
            missed.append(name)
            print(f"[{i}/{len(names)}] {name} -> NO MATCH (placeholder)")

    with open(IMAGES_FILE, "w", encoding="utf-8") as f:
        json.dump(matched, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"\nmatched {len(matched)}/{len(names)} artists -> {IMAGES_FILE}")
    if missed:
        print("no match (will use placeholder):")
        for name in missed:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
