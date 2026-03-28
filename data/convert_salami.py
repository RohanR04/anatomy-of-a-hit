#!/usr/bin/env python3
"""
Convert SALAMI dataset v2.0 annotations into the songs.csv format
used by the Anatomy of a Hit visualization.

Output columns: title,artist,year,decade,genre,duration_sec,sections
where sections is a JSON array of {type, start, end} objects.
"""

import csv
import json
import os
import re

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE     = os.path.dirname(os.path.abspath(__file__))
SALAMI   = os.path.join(BASE, 'salami-data-public')
META     = os.path.join(SALAMI, 'metadata', 'metadata.csv')
ITUNES   = os.path.join(SALAMI, 'metadata', 'SALAMI_iTunes_library.csv')
ISO      = os.path.join(SALAMI, 'metadata', 'id_index_isophonics.csv')
ANNOT    = os.path.join(SALAMI, 'annotations')
OUT      = os.path.join(BASE, 'songs.csv')

# ── Label mapping ──────────────────────────────────────────────────────────────
# Maps lowercase SALAMI labels → 9 site section types (None = drop)
LABEL_MAP = {
    'intro':          'intro',
    'introduction':   'intro',
    'opening':        'intro',
    'pre-verse':      'intro',

    'verse':          'verse',
    'verses':         'verse',
    'strophe':        'verse',
    'verse/chorus':   'verse',

    'pre-chorus':     'pre-chorus',
    'prechorus':      'pre-chorus',
    'pre chorus':     'pre-chorus',
    'build':          'pre-chorus',
    'pre_chorus':     'pre-chorus',

    'chorus':         'chorus',
    'refrain':        'chorus',
    'post-chorus':    'chorus',

    'hook':           'hook',
    'rap':            'hook',

    'bridge':         'bridge',
    'middle 8':       'bridge',
    'middle8':        'bridge',
    'transition':     'bridge',

    'instrumental':   'instrumental',
    'solo':           'instrumental',
    'break':          'instrumental',
    'interlude':      'instrumental',
    'theme':          'instrumental',
    'main_theme':     'instrumental',
    'secondary_theme':'instrumental',
    'guitar':         'instrumental',
    'guitars':        'instrumental',
    'slide guitar':   'instrumental',
    'piano':          'instrumental',
    'keyboard':       'instrumental',
    'keys':           'instrumental',
    'synthesizer':    'instrumental',
    'synth':          'instrumental',
    'organ':          'instrumental',
    'strings':        'instrumental',
    'violin':         'instrumental',
    'fiddle':         'instrumental',
    'brass':          'instrumental',
    'horns':          'instrumental',
    'horn':           'instrumental',
    'trumpet':        'instrumental',
    'trumpets':       'instrumental',
    'harmonica':      'instrumental',
    'percussion':     'instrumental',
    'drums':          'instrumental',
    'bass':           'instrumental',
    'flute':          'instrumental',
    'sitar':          'instrumental',
    'marimba':        'instrumental',
    'accordion':      'instrumental',
    'head':           'instrumental',

    'breakdown':      'breakdown',
    'drop':           'breakdown',

    'outro':          'outro',
    'coda':           'outro',
    'ending':         'outro',
    'fade-out':       'outro',
    'fade out':       'outro',
    'fade':           'outro',
    'end':            None,        # "End" marker, not a real section
    'silence':        None,
    'voice':          None,        # descriptor, not a section type
    'vocal':          None,
    'spoken':         None,
}

# Accepted CLASS values (popular music only)
POPULAR_CLASSES = {'popular'}

# Genres to exclude even within popular class
EXCLUDE_GENRES = {'humour', 'spoken', 'comedy'}

# ── Load year lookup from iTunes library (Codaich tracks) ──────────────────────
year_by_id = {}

with open(ITUNES, newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        sid  = row.get('salami_id', '').strip()
        year = row.get('Year', '').strip()
        if sid and year and year != '0':
            try:
                y = int(year)
                if 1950 <= y <= 2030:
                    year_by_id[sid] = y
            except ValueError:
                pass

# Load isophonics songs — album names often encode year (e.g. "Abbey Road (1969)")
with open(ISO, newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        sid   = row.get('SONG_ID', '').strip()
        album = row.get('ALBUM', '').strip()
        # Try to find a 4-digit year in the album name
        m = re.search(r'\b(19[5-9]\d|200\d|201\d)\b', album)
        if m and sid and sid not in year_by_id:
            year_by_id[sid] = int(m.group(1))

print(f"Year lookup loaded: {len(year_by_id)} songs have year data")

# ── Parse a single annotation textfile ────────────────────────────────────────
def parse_annotation(path, duration):
    """
    Returns list of {type, start, end} dicts, or None if unparseable.
    Skips segments with no mappable label.
    """
    entries = []  # (timestamp, raw_label)

    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split('\t')
                if len(parts) < 2:
                    continue
                try:
                    ts = float(parts[0])
                except ValueError:
                    continue
                label = parts[1].strip()
                entries.append((ts, label))
    except OSError:
        return None

    if not entries:
        return None

    # Sort by timestamp
    entries.sort(key=lambda x: x[0])

    # Extract best semantic label from each entry's comma-separated parts
    def extract_label(label_str):
        for part in label_str.split(','):
            part = part.strip().rstrip(')').strip()
            # Skip single letters (A,B,C structural markers or a,b,c fine markers)
            if re.match(r"^[A-Za-z]['']?$", part):
                continue
            # Skip pattern like a', b'', ae, ab etc.
            if re.match(r"^[a-z]['\"]{0,2}$", part):
                continue
            if re.match(r"^[a-z]{2,3}$", part):
                continue
            # Skip opening parens
            if part.startswith('('):
                continue
            if not part:
                continue
            mapped = LABEL_MAP.get(part.lower())
            if mapped is not None or part.lower() in LABEL_MAP:
                return part.lower(), mapped
        return None, None

    # Build segments
    segments = []
    for i, (ts, label_str) in enumerate(entries):
        raw_label, mapped = extract_label(label_str)
        if mapped is None:
            continue
        start = round(ts, 2)
        # End = next entry's timestamp, or song duration for the last
        end = round(entries[i + 1][0], 2) if i + 1 < len(entries) else round(duration, 2)
        if end <= start:
            continue
        segments.append({'type': mapped, 'start': start, 'end': end})

    return segments if len(segments) >= 3 else None

# ── Main conversion ────────────────────────────────────────────────────────────
songs = []

with open(META, newline='', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

print(f"Total SALAMI tracks: {len(rows)}")

skipped_class   = 0
skipped_year    = 0
skipped_annot   = 0
skipped_segs    = 0
included        = 0

genre_map = {
    'alternative_pop___rock': 'Rock',
    'country':                'Country',
    'dance_pop':              'Pop',
    'electronica':            'Electronic',
    'hip_hop___rap':          'Hip-Hop',
    'instrumental_pop':       'Pop',
    'modern_folk_-_alternative_folk': 'Folk',
    'modern_folk_-_singer___songwriter': 'Folk',
    'reggae':                 'Reggae',
    'rock_-_alternative_metal___punk': 'Rock',
    'rock_-_classic_rock':    'Rock',
    'rock_-_metal':           'Metal',
    'rock_-_roots_rock':      'Rock',
    'r&b___soul':             'R&B',
    'soul':                   'R&B',
    'pop':                    'Pop',
    'rock':                   'Rock',
}

for row in rows:
    cls   = row['CLASS'].strip().lower()
    genre = row['GENRE'].strip()
    sid   = row['SONG_ID'].strip()
    title = row['SONG_TITLE'].strip().replace('_', ' ')
    artist= row['ARTIST'].strip().replace('_', ' ')

    # Filter: popular class only
    if cls not in POPULAR_CLASSES:
        skipped_class += 1
        continue

    # Filter: exclude humour/spoken
    if any(x in genre.lower() for x in EXCLUDE_GENRES):
        skipped_class += 1
        continue

    # Require year
    if sid not in year_by_id:
        skipped_year += 1
        continue
    year = year_by_id[sid]
    decade = f"{(year // 10) * 10}s"

    # Only 1960s–2020s
    if decade not in ('1960s','1970s','1980s','1990s','2000s','2010s','2020s'):
        skipped_year += 1
        continue

    duration = float(row['SONG_DURATION'].strip() or 0)
    if duration <= 0 or duration > 360:
        skipped_annot += 1
        continue

    # Try annotation file
    tf = os.path.join(ANNOT, sid, 'textfile1.txt')
    if not os.path.exists(tf):
        skipped_annot += 1
        continue

    segments = parse_annotation(tf, duration)
    if not segments:
        skipped_segs += 1
        continue

    # Map genre string
    genre_key = genre.lower().replace(' ', '_')
    display_genre = genre_map.get(genre_key, 'Pop')

    songs.append({
        'title':        title,
        'artist':       artist,
        'year':         year,
        'decade':       decade,
        'genre':        display_genre,
        'duration_sec': round(duration),
        'sections':     json.dumps(segments, separators=(',', ':')),
    })
    included += 1

print(f"\nResults:")
print(f"  Skipped (not popular class): {skipped_class}")
print(f"  Skipped (no year):           {skipped_year}")
print(f"  Skipped (no annotation):     {skipped_annot}")
print(f"  Skipped (too few segments):  {skipped_segs}")
print(f"  Included:                    {included}")

# Show decade distribution
decade_counts = {}
for s in songs:
    d = s['decade']
    decade_counts[d] = decade_counts.get(d, 0) + 1
print(f"\nDecade distribution: {dict(sorted(decade_counts.items()))}")

# Write output
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['title','artist','year','decade','genre','duration_sec','sections'])
    writer.writeheader()
    writer.writerows(songs)

print(f"\nWrote {len(songs)} songs to {OUT}")
