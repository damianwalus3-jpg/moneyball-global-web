#!/usr/bin/env python3
"""Build a compact, keyless football-history index from OpenMatchday public CSVs.
Source attribution and non-commercial-use notice are embedded in the output.
"""
from __future__ import annotations
import csv, io, json, re, time, unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE = "https://raw.githubusercontent.com/oladeeayo/open-matchday/master"
OUT = Path("public-data/team-history.json")
UA = "MONEYBALL-GLOBAL/3.4 (public football research; keyless GitHub data builder)"
SEASONS = ("2627", "2026")

def get(url: str, attempts: int = 3) -> str:
    last = None
    for n in range(attempts):
        try:
            req = Request(url, headers={"User-Agent": UA, "Accept": "text/plain,*/*"})
            with urlopen(req, timeout=35) as res:
                return res.read().decode("utf-8-sig", errors="replace")
        except (HTTPError, URLError, TimeoutError) as exc:
            last = exc
            if isinstance(exc, HTTPError) and exc.code == 404:
                raise
            time.sleep(1.2 * (n + 1))
    raise RuntimeError(f"{url}: {last}")

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"\b(women|w)\b", " women ", s)
    s = re.sub(r"\b(fc|cf|sc|ac|afc|club)\b", " ", s)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()

def number(row, key):
    try:
        value = row.get(key, "")
        return int(float(value)) if value not in ("", None) else None
    except (TypeError, ValueError):
        return None

def load_folder(folder: str):
    last = None
    for season in SEASONS:
        url = f"{BASE}/data/{folder}/results_{season}.csv"
        try:
            raw = get(url)
            if raw.strip():
                return folder, list(csv.DictReader(io.StringIO(raw))), url, None
        except HTTPError as exc:
            if exc.code != 404:
                last = str(exc)
        except Exception as exc:
            last = str(exc)
    return folder, [], None, last


INTERNATIONAL_TREE = "https://api.github.com/repos/openfootball/internationals/git/trees/master?recursive=1"
TEAM_ALIASES = {
    "republic of ireland": "ireland", "ireland": "republic of ireland",
    "turkey": "turkiye", "turkiye": "turkey",
    "czech republic": "czechia", "czechia": "czech republic",
    "dr congo": "congo dr", "congo dr": "dr congo",
    "democratic republic of congo": "congo dr",
}

def load_international_results():
    tree = json.loads(get(INTERNATIONAL_TREE))
    paths = sorted(item["path"] for item in tree.get("tree", [])
        if item.get("type") == "blob" and re.search(r"/202[456]_[A-Za-z0-9_-]+\.txt$", item.get("path", "")))
    def fetch_one(path):
        return path, get("https://raw.githubusercontent.com/openfootball/internationals/master/" + path)
    loaded, failed = [], []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch_one, path) for path in paths]
        for future in as_completed(futures):
            try: loaded.append(future.result())
            except Exception as exc: failed.append(str(exc)[:180])
    rows = []
    for path, raw in loaded:
        try: year = int(path.rsplit("/", 1)[-1][:4])
        except ValueError: continue
        competition = path.rsplit("/", 1)[-1][5:-4].replace("_", " ")
        current_date = None
        for line in raw.splitlines():
            heading = re.match(r"^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{1,2})$", line.strip())
            if heading:
                try: current_date = datetime.strptime(f"{year} {heading.group(1)} {heading.group(2)}", "%Y %b %d").date().isoformat()
                except ValueError: current_date = None
                continue
            if not current_date or not line.startswith("  ") or line.startswith("   "): continue
            main = line[2:].split(" @ ", 1)[0].strip()
            main = re.sub(r"\s+\[[^]]+\]\s*$", "", main)
            parsed = re.match(r"^(.+?)\s+(\d+)-(\d+)\s+(.+?)\s*$", main)
            if not parsed: continue
            home, hg, ag, away = parsed.groups()
            if home.strip() and away.strip():
                rows.append((current_date, home.strip(), away.strip(), int(hg), int(ag), competition, path))
    return rows, len(paths), len(loaded), failed[:20]

def main():
    index = get(BASE + "/LEAGUE_INDEX.md")
    folders = sorted(set(re.findall(r"`([A-Z]{3}_[A-Za-z0-9_-]+)`", index)))
    if not folders:
        raise SystemExit("No league folders found in OpenMatchday LEAGUE_INDEX.md")
    team_rows = {}
    successful, failed, total_rows = 0, [], 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(load_folder, folder) for folder in folders]
        for future in as_completed(futures):
            folder, rows, url, error = future.result()
            if not rows:
                if error:
                    failed.append({"folder": folder, "error": error[:180]})
                continue
            successful += 1
            total_rows += len(rows)
            country = folder.split("_", 1)[0]
            for row in rows:
                date = (row.get("date") or "").strip()
                home, away = (row.get("home") or "").strip(), (row.get("away") or "").strip()
                hg, ag = number(row, "ft_home"), number(row, "ft_away")
                if not date or not home or not away or hg is None or ag is None:
                    continue
                for is_home, team, opponent, gf, ga in (
                    (True, home, away, hg, ag), (False, away, home, ag, hg)
                ):
                    key = norm(team)
                    if not key:
                        continue
                    result = "W" if gf > ga else "L" if gf < ga else "D"
                    prefix = "home_" if is_home else "away_"
                    suffix = "away_" if is_home else "home_"
                    item = {
                        "date": date, "opponent": opponent, "result": result,
                        "goals_for": gf, "goals_against": ga,
                        "shots_for": number(row, prefix + "shots"),
                        "shots_against": number(row, suffix + "shots"),
                        "shots_on_target_for": number(row, prefix + "target"),
                        "shots_on_target_against": number(row, suffix + "target"),
                        "corners_for": number(row, prefix + "corners"),
                        "corners_against": number(row, suffix + "corners"),
                        "fouls_for": number(row, prefix + "fouls"),
                        "fouls_against": number(row, suffix + "fouls"),
                        "yellow_for": number(row, prefix + "yellow"),
                        "yellow_against": number(row, suffix + "yellow"),
                        "red_for": number(row, prefix + "red"),
                        "red_against": number(row, suffix + "red"),
                        "competition": folder, "country": country,
                        "source": "OpenMatchday"
                    }
                    team_rows.setdefault(key, {"name": team, "matches": []})["matches"].append(item)

    international_rows, international_files, international_loaded, international_failed = load_international_results()
    for date, home, away, hg, ag, competition, source_path in international_rows:
        for team, opponent, gf, ga in ((home, away, hg, ag), (away, home, ag, hg)):
            key = norm(team)
            if not key: continue
            result = "W" if gf > ga else "L" if gf < ga else "D"
            item = {"date":date,"opponent":opponent,"result":result,"goals_for":gf,"goals_against":ga,
                "shots_for":None,"shots_against":None,"shots_on_target_for":None,"shots_on_target_against":None,
                "corners_for":None,"corners_against":None,"fouls_for":None,"fouls_against":None,
                "yellow_for":None,"yellow_against":None,"red_for":None,"red_against":None,
                "competition":competition,"country":"INT","source":"OpenFootball Internationals","source_path":source_path}
            team_rows.setdefault(key, {"name":team,"matches":[]})["matches"].append(item)
            alias = TEAM_ALIASES.get(key)
            if alias: team_rows.setdefault(alias, {"name":team,"matches":[]})["matches"].append(item)

    teams = {}
    for key, entry in team_rows.items():
        # A club may appear in a league and a cup; deduplicate exact same fixture rows.
        seen, unique = set(), []
        for item in sorted(entry["matches"], key=lambda x: x["date"], reverse=True):
            dedupe = (item["date"], norm(item["opponent"]), item["goals_for"], item["goals_against"])
            if dedupe in seen:
                continue
            seen.add(dedupe)
            unique.append(item)
        teams[key] = {"name": entry["name"], "matches": unique[:5]}
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenMatchday public CSV + OpenFootball Internationals",
        "source_url": "https://github.com/oladeeayo/open-matchday and https://github.com/openfootball/internationals",
        "licences": ["OpenMatchday: non-commercial informational use with attribution; upstream provider terms apply.", "OpenFootball Internationals: CC0 1.0"],
        "source_url": "https://github.com/oladeeayo/open-matchday",
        "attribution": "OpenMatchday contributors; informational non-commercial use; upstream provider rights apply.",
        "coverage": {
            "competitions_indexed": len(folders),
            "competitions_with_results": successful,
            "team_names": len(teams),
            "result_rows_read": total_rows,\n            "international_files_indexed": international_files,\n            "international_files_loaded": international_loaded,\n            "international_matches_read": len(international_rows),\n            "international_fetch_errors": international_failed,
            "failed_competitions": failed[:30]
        },
        "teams": teams
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), **payload["coverage"]}, ensure_ascii=False))
    if successful < 15 or len(teams) < 100:
        raise SystemExit("Coverage validation failed; refusing to publish an incomplete dataset.")

if __name__ == "__main__":
    main()
