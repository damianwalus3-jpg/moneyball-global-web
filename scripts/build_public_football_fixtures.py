#!/usr/bin/env python3
"""Build upcoming fixtures from Open-Matchday's public CSV fixture spine (pipeline v4).

The source timestamps are venue-local strings; this file deliberately does not
invent a timezone or a match status. Source coverage and freshness are explicit.
"""
from __future__ import annotations
import csv, io, json, re, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE = "https://raw.githubusercontent.com/oladeeayo/open-matchday/master"
INDEX_URL = BASE + "/LEAGUE_INDEX.md"
TREE_URL = "https://api.github.com/repos/oladeeayo/open-matchday/git/trees/master?recursive=1"
OUT = Path("public-data/fixtures.json")
UA = "MONEYBALL-GLOBAL/4.0 (public football fixture index; attribution included)"
SEASONS = ("2627", "2026")

def get(url: str, attempts: int = 3) -> str:
    last = None
    for attempt in range(attempts):
        try:
            req = Request(url, headers={"User-Agent": UA, "Accept": "text/plain,*/*"})
            with urlopen(req, timeout=35) as response:
                return response.read().decode("utf-8-sig", errors="replace")
        except (HTTPError, URLError, TimeoutError) as exc:
            last = exc
            if isinstance(exc, HTTPError) and exc.code == 404:
                raise
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")

def label(folder: str) -> str:
    parts = folder.split("_", 2)
    return parts[2].replace("-", " ").replace("_", " ").title() if len(parts) > 2 else folder

def read_competition(args):
    folder, season = args
    url = f"{BASE}/data/{folder}/fixtures_{season}.csv"
    try:
        raw = get(url)
        rows = list(csv.DictReader(io.StringIO(raw)))
        return folder, season, rows, url, None
    except HTTPError as exc:
        if exc.code == 404:
            return folder, season, [], None, None
        return folder, season, [], None, str(exc)
    except Exception as exc:
        return folder, season, [], None, str(exc)

def main():
    index = get(INDEX_URL)
    folders = sorted(set(re.findall(r"`([A-Z]{3}_[A-Za-z0-9_-]+)`", index)))
    if not folders:
        raise SystemExit("No competitions found in source league index")
    tasks = [(folder, season) for folder in folders for season in SEASONS]
    fixtures, failures, successful = [], [], set()
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(read_competition, task) for task in tasks]
        for future in as_completed(futures):
            folder, season, rows, url, error = future.result()
            if error:
                failures.append({"competition_id": folder, "season": season, "error": error[:180]})
            if rows:
                successful.add(folder)
            for row in rows:
                date = (row.get("date") or "").strip()
                home = (row.get("home") or "").strip()
                away = (row.get("away") or "").strip()
                if not date or not home or not away:
                    continue
                try:
                    datetime.strptime(date, "%Y-%m-%d")
                except ValueError:
                    continue
                kickoff_time = (row.get("time") or "").strip()
                if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", kickoff_time):
                    kickoff_time = None
                fixtures.append({
                    "fixture_id": f"{folder}:{season}:{date}:{home.casefold()}:{away.casefold()}",
                    "date": date,
                    "time_local": kickoff_time,
                    "timezone": None,
                    "kickoff_at": f"{date}T{kickoff_time}:00" if kickoff_time else None,
                    "home_team": home,
                    "away_team": away,
                    "competition": label(folder),
                    "competition_id": folder,
                    "country_code": folder.split("_", 1)[0],
                    "gender": "women" if re.search(r"women|womens|frauen|femenina|feminin|female|damallsvenskan|wsl", folder, re.I) else "men",
                    "status": "scheduled",
                    "round": (row.get("gw") or "").strip() or None,
                    "source": "OpenMatchday",
                    "source_url": url,
                    "season": season
                })
    # Keep the newest source version for an identical competition/date/team fixture.
    deduped = {}
    for fixture in fixtures:
        key = (fixture["competition_id"], fixture["date"], fixture["home_team"].casefold(), fixture["away_team"].casefold())
        previous = deduped.get(key)
        if previous is None or (fixture["season"] > previous["season"]):
            deduped[key] = fixture
    ordered = sorted(deduped.values(), key=lambda x: (x["date"], x["time_local"] or "", x["competition_id"], x["home_team"]))
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Open-Matchday public fixture CSV",
        "source_url": "https://github.com/oladeeayo/open-matchday",
        "attribution": "OpenMatchday contributors. Informational non-commercial use with attribution; upstream provider terms apply.",
        "licence_notice": "Do not use commercially unless permitted by the source terms. Kickoff times remain source-local in this file and are converted using country timezones by the app. Gender is inferred only from explicit competition labels; otherwise it remains unknown.",
        "coverage": {
            "competitions_in_index": len(folders),
            "competitions_with_fixtures": len(successful),
            "fixture_count": len(ordered),
            "source_files_checked": len(tasks),
            "fetch_errors": failures[:40]
        },
        "fixtures": ordered
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), **payload["coverage"]}, ensure_ascii=False))
    if len(successful) < 10 or not ordered:
        raise SystemExit("Fixture coverage validation failed; refusing to publish incomplete fixture index.")

if __name__ == "__main__":
    main()
