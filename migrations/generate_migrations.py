#!/usr/bin/env python3
"""Generate MongoDB migration JSONs for The Sounds Project Vol.9 (Kawan Ngonser).

Sources:
- rundown/IMG_1495-1501.png (official set times, 7 stages x 3 days)
- http://thesoundsproject.com/ (event metadata, logo)
- mongodb.mermaid (collection field names, snake_case)
- artist_images.json (real artist photos, built by fetch_artist_images.py;
  artists missing from it get a ui-avatars placeholder)

Assumptions:
- Every performance lasts exactly 1 hour (per user instruction).
- All times are venue-local Asia/Jakarta (UTC+07:00), stored as Extended JSON $date.
"""
import json
import re
import os
from datetime import datetime, timedelta
from urllib.parse import quote

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_FILE = os.path.join(OUT_DIR, "artist_images.json")  # built by fetch_artist_images.py
TZ = "+07:00"
NOW = "2026-08-04T00:00:00" + TZ  # generation date, used for created_at/updated_at

DAY_DATES = {1: "2026-08-07", 2: "2026-08-08", 3: "2026-08-09"}

STAGES = [
    ("tsp",        "The Sounds Project Stage", "#F28C28"),
    ("musicverse", "Musicverse Stage",         "#D64550"),
    ("mg",         "MG Stage",                 "#35A7DB"),
    ("garden",     "Garden Stage",             "#3FA34D"),
    ("tspco",      "TSP&CO Stage",             "#2D6CDF"),
    ("joged",      "Joged Stage",              "#B5446E"),
    ("tspsquad",   "TSPSQUAD Stage",           "#D9A514"),
]

# stage_id -> {day_index: [(HH.MM, artist name), ...]}
RUNDOWN = {
    "tsp": {
        1: [("15.30", "Juicy Luicy"), ("16.45", "Lomba Sihir"),
            ("18.15", "The Changcuters x Vierratale x Nidji"), ("19.30", "Naykilla"),
            ("20.45", "Bernadya"), ("22.00", "Mahalini"), ("23.15", "The Adams")],
        2: [("15.30", "510"), ("16.45", "Kangen Band"), ("19.00", "Barasuara"),
            ("20.30", "Neck Deep (UK)"), ("22.00", "Wali"), ("23.15", "King Nassar")],
        3: [("15.30", "For Revenge"), ("16.45", "Tulus"), ("18.15", "Efek Rumah Kaca"),
            ("19.30", "Perunggu"), ("20.45", "Jet (AUS)"), ("22.00", ".Feast"),
            ("23.15", "Hindia")],
    },
    "musicverse": {
        1: [("16.45", "HIVI!"), ("18.15", "Raisa"), ("19.30", "Nusantara Beat (NED)"),
            ("20.45", "Pamungkas"), ("22.00", "Idgitaf"), ("23.15", "Tipe-X")],
        2: [("15.30", "Sal Priadi"), ("16.45", "Elephant Kind"), ("18.15", "Moluccan Soul"),
            ("19.30", "D'MASIV"), ("20.45", "Reality Club"), ("22.00", "Float"),
            ("23.15", "Biru Baru")],
        3: [("15.30", "NPD"), ("16.45", "Kunto Aji"), ("18.15", "Yura Yunita"),
            ("19.30", "Isyana Sarasvati"),
            ("20.45", "Tribute to The Beatles by G-Pluck ft. Bilal Indrajaya"),
            ("22.00", "Tribute to L'Arc-en-Ciel by J-Rocks")],
    },
    "mg": {
        1: [("15.45", "Rizky Febian"),
            ("17.00", "Suara Wijaya 80: Ardhito Pramono, Erikson Jayanto, Hezky Joe"),
            ("18.45", "Pee Wee Gaskins x Rocket Rockers"), ("20.00", "Alkateri"),
            ("21.15", "K3BI"), ("22.30", "NDX AKA")],
        2: [("15.45", "The SIGIT"), ("17.00", "Eleventwelfth"), ("18.45", "Monkey Boots"),
            ("20.00", "Poris"), ("21.15", "Murphy Radio"), ("22.30", "Grind Boys")],
        3: [("15.45", "Souljah"), ("17.00", "Haddad Alwi"), ("18.45", "FSTVLST"),
            ("20.00", "Parade Hujan (Payung Teduh x Pusakata)"),
            ("21.15", "Tribute to Oasis by Magicpie ft. Aldi Taher"),
            ("23.15", "DNA ft. MC Parkz")],
    },
    "garden": {
        1: [("15.15", "Kelompok Penerbang Roket"), ("16.30", "Adrian Khalif"),
            ("19.00", "Rumahsakit"), ("20.15", "Pelteras"), ("21.30", "The Jeblogs"),
            ("22.45", "Tenxi")],
        2: [("15.15", "Gledeg"), ("16.30", "Ghea Indrawari"), ("18.15", "Teenage Death Star"),
            ("19.30", "The Milo"), ("20.45", "Jason Ranti & Dongker"), ("22.00", "Ali"),
            ("23.15", "White Chorus")],
        3: [("15.15", "Sukses Lancar Rejeki"), ("16.30", "Nadhif Basalamah"),
            ("18.30", "Kotak"), ("19.45", "Smash"), ("21.00", "Ten2Five"),
            ("22.00", "Juan Reza"), ("23.15", "Robokop ft. Mikkizia")],
    },
    "tspco": {
        1: [("15.45", "Black Horses"), ("17.00", "Kale"), ("18.30", "Marbles"),
            ("19.45", "Fresly Nikijuluw"), ("21.00", "OM Lorenza"), ("22.15", "Sore Ze Band")],
        2: [("15.45", "Geisha"), ("17.00", "Societeit de Harmonie"), ("19.00", "The Cottons"),
            ("20.15", "Strangers"), ("21.30", "Beijing Connection"), ("22.45", "The Paps")],
        3: [("15.45", "The Panturas"), ("17.00", "Skandal"), ("19.00", "Fiersa Besari"),
            ("20.15", "Marcello Tahitoe"), ("21.30", "Polkawars ft. Alahad")],
    },
    "joged": {
        1: [("15.45", "Pendarra"), ("17.00", "Endah N Rhesa"),
            ("18.15", "Syikat Musik Service"), ("19.30", "Alter JKT"),
            ("20.45", "Boyband Hits: Forever Young People"), ("22.00", "Jemsii x Suisei")],
        2: [("15.45", "Banda Neira"), ("17.00", "Adhitia Sofyan"), ("18.45", "Silampukau"),
            ("20.00", "Inis"), ("21.15", "Crowdsurfers ft. Faizal Permana 510")],
        3: [("15.45", "Enau"), ("17.00", "Radit Echoman x Steppa Gyal"),
            ("19.15", "Orutaku Club"), ("20.30", "Weekenders Service Crew"),
            ("21.45", "Blowjams"), ("23.00", "Namoy Budaya")],
    },
    "tspsquad": {
        1: [("15.15", "Stand Up Indo Jakarta Timur"), ("16.30", "Voxy"),
            ("19.15", "Upleaf"), ("20.30", "Olsam"), ("21.30", "Secret Guest"),
            ("23.15", "DJ Tama")],
        2: [("16.30", "Jen"), ("18.15", "All Acc3ss"), ("19.45", "Verryans"),
            ("21.00", "Tiga Dara"), ("22.15", "Secret Guest")],
        3: [("15.15", "Oldies But Goodies"), ("16.30", "Inoya House"),
            ("18.15", "Secret Guest"), ("19.45", "Pemuda Malam Senin"),
            ("21.00", "Awcek Sound Fun"), ("22.15", "TSP Squad")],
    },
}


def all_artist_names():
    return sorted({artist for stage in RUNDOWN.values() for day in stage.values()
                   for _, artist in day}, key=str.lower)


def slugify(name):
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


IMAGE_MAP = {}
if os.path.exists(IMAGES_FILE):
    with open(IMAGES_FILE, encoding="utf-8") as f:
        IMAGE_MAP = {name: info["image"] for name, info in json.load(f).items()}


def placeholder_image(name):
    return ("https://ui-avatars.com/api/?name=" + quote(name)
            + "&size=256&background=181A24&color=F5F6FA&bold=true&format=png")


def artist_image(name):
    return IMAGE_MAP.get(name) or placeholder_image(name)


def dt(day_index, hhmm):
    h, m = hhmm.split(".")
    return datetime.strptime(DAY_DATES[day_index] + f"T{h}:{m}:00", "%Y-%m-%dT%H:%M:%S")


def ejson_date(d):
    return {"$date": d.strftime("%Y-%m-%dT%H:%M:%S") + TZ}


def build():
    performances = []
    artists_seen = {}
    for stage_id, _, _ in STAGES:
        for day_index in (1, 2, 3):
            prev_start = None
            for hhmm, artist in RUNDOWN[stage_id][day_index]:
                start = dt(day_index, hhmm)
                if prev_start is not None:
                    assert start > prev_start, f"out of order: {stage_id} d{day_index} {artist}"
                prev_start = start
                end = start + timedelta(hours=1)  # 1-hour sets per user instruction
                performances.append({
                    "performance_id": f"{stage_id}-d{day_index}-{slugify(artist)}",
                    "artist_name": artist,
                    "artist_image": artist_image(artist),
                    "day_index": day_index,
                    "stage_id": stage_id,
                    "start_time": ejson_date(start),
                    "end_time": ejson_date(end),
                })
                if artist not in artists_seen:
                    artists_seen[artist] = {
                        "name": artist,
                        "photo_url": artist_image(artist),
                        "created_at": {"$date": NOW},
                        "updated_at": {"$date": NOW},
                    }

    ids = [p["performance_id"] for p in performances]
    assert len(ids) == len(set(ids)), "duplicate performance_id"

    concert = {
        "event_id": "sounds-project-2026",
        "visible": True,
        "version": 1,
        "name": "The Sounds Project Vol.9",
        "logo": "https://thesoundsproject.com/storage/files/1/logo/LOGO%20TSP9.webp",
        "place": "Ecovention & Ecopark Ancol, Jakarta",
        "description": ("The Sounds Project Vol.9 — Beyond Memories. Where the dreamers go, "
                        "live concert matters: 3 days, 7 stages, and 100+ performances at "
                        "Ecovention & Ecopark Ancol, Jakarta, on 7-9 August 2026."),
        "timezone": "Asia/Jakarta",
        "days": [{"day_index": i, "date": DAY_DATES[i]} for i in (1, 2, 3)],
        "stages": [{"stage_id": sid, "name": name, "color": color}
                   for sid, name, color in STAGES],
        "performances": performances,
        "created_at": {"$date": NOW},
        "updated_at": {"$date": NOW},
    }

    app_config = {
        "default_lead_time_min": 15,
        "battery_low_threshold_pct": 20,
        "notification_templates": [
            {"type": "performance", "title": "{artist} in {x} mins",
             "body": "Head to {stage} and grab your spot \U0001F64C"},
            {"type": "performance", "title": "{artist} is performing in {x} mins",
             "body": "Head to {stage} and prepare to enjoy"},
            {"type": "performance", "title": "{artist} is up next!",
             "body": "{stage}, {x} minutes — time to start moving."},
            {"type": "performance", "title": "{x} mins till {artist}",
             "body": "Front row won't wait — head to {stage}."},
            {"type": "performance", "title": "Incoming: {artist} \U0001F3A4",
             "body": "Hitting {stage} in {x} mins. You know what to do."},
            {"type": "custom_event", "title": "{event} in {x} mins",
             "body": "You planned this — don't bail on yourself."},
            {"type": "custom_event", "title": "Time for {event}",
             "body": "{x} minutes to go — squeeze it in before the next set."},
            {"type": "custom_event", "title": "{event} — {x} mins away",
             "body": "Future you says thanks."},
        ],
        "copy_strings": {
            "sync_banner": {
                "text": "Fresh concert data just dropped. Sync it?",
                "confirm": "Yes please",
                "dismiss": "I'll handle it myself",
            },
            "sync_overwrite_confirm": {
                "text": ("Heads up — you've edited this concert's data. Syncing replaces those "
                         "edits with the server version (your picks and custom events are safe). "
                         "Replace them?"),
                "confirm": "Replace my edits",
                "dismiss": "Keep my edits",
            },
            "day_complete_banner": ("That's a wrap for today. See you on Day {x} — "
                                    "rest up! \U0001F319"),
            "concert_complete_banner": ("That's a wrap. What a ride — get home safe, "
                                        "and keep the songs with you. \U0001F3B6"),
        },
        "updated_at": {"$date": NOW},
    }

    artists = sorted(artists_seen.values(), key=lambda a: a["name"].lower())
    for fname, data in [("concerts.json", [concert]),
                        ("artists.json", artists),
                        ("app_configs.json", [app_config])]:
        with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")

    per_stage = {}
    for p in performances:
        per_stage.setdefault(p["stage_id"], [0, 0, 0])[p["day_index"] - 1] += 1
    print(f"performances: {len(performances)}")
    for sid, counts in per_stage.items():
        print(f"  {sid}: d1={counts[0]} d2={counts[1]} d3={counts[2]} total={sum(counts)}")
    real = sum(1 for a in artists if a["photo_url"] in IMAGE_MAP.values())
    print(f"unique artists: {len(artists)} ({real} with real photos, "
          f"{len(artists) - real} placeholders)")


if __name__ == "__main__":
    build()
