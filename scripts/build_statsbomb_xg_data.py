#!/usr/bin/env python3
"""Build a compact, keyless StatsBomb Open Data xG index.

StatsBomb publishes selected event-level competitions for research and football
analytics. This index aggregates shot-level StatsBomb xG to team-match xG. It includes all published women's competition-seasons and all available men's seasons from 2020 onward, plus selected older international tournaments and 2018/19 Champions League.
Attribution is required; see the source terms in the output metadata.
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://raw.githubusercontent.com/hudl/open-data/master/data"
OUT = Path("public-data/statsbomb-xg.json")
SUMMARY = Path("public-data/statsbomb-xg-summary.json")
MAX_MATCHES_PER_TEAM = 20
WORKERS = 8
SELECTED_MEN = {
    ("FIFA World Cup", "2018"),
    ("FIFA World Cup", "2022"),
    ("UEFA Euro", "2020"),
    ("UEFA Euro", "2024"),
    ("African Cup of Nations", "2023"),
    ("Copa America", "2024"),
}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c)).lower()
    value = re.sub(r"\b(wfc|women|w)\b", " women ", value)
    value = re.sub(r"\b(fc|cf|sc|ac|afc|club|ladies)\b", " ", value)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()


def fetch_json(path: str, retries: int = 3):
    url = f"{BASE}/{path}"
    for attempt in range(retries):
        try:
            request = Request(url, headers={"User-Agent": "MONEYBALL-GLOBAL/1.0", "Accept": "application/json"})
            with urlopen(request, timeout=35) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code == 404:
                return None
            if attempt == retries - 1:
                raise
        except (URLError, TimeoutError):
            if attempt == retries - 1:
                raise
        time.sleep(1.5 * (attempt + 1))
    return None


def selected_competitions():
    competitions = fetch_json("competitions.json")
    selected = {}
    for comp in competitions:
        gender = str(comp.get("competition_gender", "")).lower()
        name = str(comp.get("competition_name", ""))
        season = str(comp.get("season_name", ""))
        season_start = re.match(r"^(\\d{4})", season)
        is_recent_men_season = bool(season_start and int(season_start.group(1)) >= 2020)
        # Keep all available women's event seasons, and expand men's coverage
        # to every published 2020+ competition-season. Retain selected historic
        # international tournaments and the 2018/19 Champions League archive.
        include = gender == "female" or (
            gender == "male" and (
                is_recent_men_season
                or (name, season) in SELECTED_MEN
                or (name, season) == ("Champions League", "2018/2019")
            )
        )
        if include:
            key = (int(comp["competition_id"]), int(comp["season_id"]))
            selected[key] = comp
    return list(selected.values())


def parse_match(match: dict):
    match_id = int(match["match_id"])
    home = str(match.get("home_team", {}).get("home_team_name") or "")
    away = str(match.get("away_team", {}).get("away_team_name") or "")
    if not home or not away or match.get("home_score") is None or match.get("away_score") is None:
        return None
    events = fetch_json(f"events/{match_id}.json")
    if not isinstance(events, list):
        return None
    home_xg = away_xg = 0.0
    home_shots = away_shots = 0
    for event in events:
        if (event.get("type") or {}).get("name") != "Shot":
            continue
        shot = event.get("shot") or {}
        value = shot.get("statsbomb_xg")
        if value is None:
            continue
        try:
            xg = float(value)
        except (TypeError, ValueError):
            continue
        if not (0 <= xg <= 1):
            continue
        team = str((event.get("team") or {}).get("name") or "")
        if norm(team) == norm(home):
            home_xg += xg
            home_shots += 1
        elif norm(team) == norm(away):
            away_xg += xg
            away_shots += 1
    if home_shots + away_shots == 0:
        return None
    date = str(match.get("match_date") or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return None
    competition = (match.get("competition") or {}).get("competition_name", "")
    season = (match.get("season") or {}).get("season_name", "")
    gender = str((match.get("home_team") or {}).get("home_team_gender") or "unknown").lower()
    return {
        "match_id": match_id,
        "date": date,
        "home": home,
        "away": away,
        "home_goals": int(match["home_score"]),
        "away_goals": int(match["away_score"]),
        "home_xg": round(home_xg, 3),
        "away_xg": round(away_xg, 3),
        "home_shots": home_shots,
        "away_shots": away_shots,
        "competition": str(competition),
        "season": str(season),
        "gender": "women" if gender == "female" else "men" if gender == "male" else "unknown",
    }


def main():
    competitions = selected_competitions()
    match_rows = []
    for comp in competitions:
        matches = fetch_json(f"matches/{int(comp['competition_id'])}/{int(comp['season_id'])}.json") or []
        match_rows.extend(matches)

    parsed = []
    errors = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(parse_match, match) for match in match_rows]
        for future in as_completed(futures):
            try:
                row = future.result()
                if row:
                    parsed.append(row)
            except Exception as exc:
                errors += 1
                print(f"Skipped one StatsBomb match after fetch/parse error: {exc}")

    teams = {}
    for row in parsed:
        for side in ("home", "away"):
            is_home = side == "home"
            name = row[side]
            key = norm(name)
            if row["gender"] == "women" and "women" not in key.split():
                key = (key + " women").strip()
            if not key:
                continue
            opponent = row["away" if is_home else "home"]
            entry = teams.setdefault(key, {"name": name, "gender": row["gender"], "matches": []})
            entry["matches"].append({
                "match_id": row["match_id"],
                "date": row["date"],
                "opponent": opponent,
                "result": "W" if row["home_goals" if is_home else "away_goals"] > row["away_goals" if is_home else "home_goals"] else "L" if row["home_goals" if is_home else "away_goals"] < row["away_goals" if is_home else "home_goals"] else "D",
                "goals_for": row["home_goals" if is_home else "away_goals"],
                "goals_against": row["away_goals" if is_home else "home_goals"],
                "xg_for": row["home_xg" if is_home else "away_xg"],
                "xg_against": row["away_xg" if is_home else "home_xg"],
                "shots_for": row["home_shots" if is_home else "away_shots"],
                "shots_against": row["away_shots" if is_home else "home_shots"],
                "competition": row["competition"],
                "season": row["season"],
                "gender": row["gender"],
                "source": "StatsBomb Open Data",
            })

    stored = 0
    for entry in teams.values():
        unique = {}
        for match in entry["matches"]:
            unique.setdefault(match["match_id"], match)
        entry["matches"] = sorted(unique.values(), key=lambda x: (x["date"], x["match_id"]), reverse=True)[:MAX_MATCHES_PER_TEAM]
        stored += len(entry["matches"])

    genders = sorted({row["gender"] for row in parsed})
    competitions_used = sorted({row["competition"] for row in parsed})
    if len(parsed) < 500 or len(teams) < 80:
        raise SystemExit(f"StatsBomb coverage validation failed: matches={len(parsed)}, teams={len(teams)}")

    generated = datetime.now(timezone.utc).isoformat()
    coverage = {
        "selected_competition_seasons": len(competitions),
        "source_matches": len(match_rows),
        "matches_with_shot_xg": len(parsed),
        "team_names": len(teams),
        "stored_team_match_rows": stored,
        "genders": genders,
        "competitions": competitions_used,
        "first_match_date": min(row["date"] for row in parsed),
        "last_match_date": max(row["date"] for row in parsed),
        "match_fetch_errors": errors,
        "matches_per_team_max": MAX_MATCHES_PER_TEAM,
    }
    payload = {
        "schema_version": 1,
        "generated_at": generated,
        "source": "StatsBomb Open Data",
        "source_url": "https://github.com/hudl/open-data",
        "attribution": "StatsBomb; use the StatsBomb logo from https://statsbomb.com/media-pack/ when publishing analysis based on this data.",
        "terms": "Free selected competitions for research and genuine interest in football analytics; attribution required. Review StatsBomb terms before redistribution or commercial use.",
        "scope": "Historical selected competitions only; not a live feed and not complete global coverage.",
        "coverage": coverage,
        "teams": teams,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    SUMMARY.write_text(json.dumps({"schema_version": 1, "generated_at": generated, "source": payload["source"], "coverage": coverage}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), **coverage}, ensure_ascii=False))


if __name__ == "__main__":
    main()
