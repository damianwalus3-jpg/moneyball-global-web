#!/usr/bin/env python3
"""Build a keyless historical xG index from American Soccer Analysis.

ASA publishes match-level team xG for selected North American competitions.
The public API requires no key. Data is attributed and retained under the
provider's CC BY-SA 4.0 terms. This dataset supplements (never replaces)
OpenPlay and StatsBomb, and is not used for competitions it does not cover.
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = "https://app.americansocceranalysis.com/api/v1"
OUT = Path("public-data/asa-xg.json")
MAX_MATCHES_PER_TEAM = 30
LEAGUES = {
    "mls": ("men", "2013-01-01"),
    "nwsl": ("women", "2016-01-01"),
    "uslc": ("men", "2017-01-01"),
    "usl1": ("men", "2019-01-01"),
    "mlsnp": ("men", "2022-01-01"),
    "usls": ("women", "2024-01-01"),
    "nasl": ("men", "2016-01-01"),
}


def norm_team(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c)).lower()
    value = re.sub(r"\b(fc|cf|sc|ac|afc|club)\b", " ", value)
    value = re.sub(r"\b(wfc|women|w)\b", " women ", value)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()


def fetch_json(url: str):
    request = Request(url, headers={
        "User-Agent": "MONEYBALL-GLOBAL/2.0 (public football analytics; contact via GitHub)",
        "Accept": "application/json",
    })
    with urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def numeric(value):
    try:
        number = float(value)
        return number if number == number and abs(number) != float("inf") else None
    except (TypeError, ValueError):
        return None


def main() -> None:
    end_date = datetime.now(timezone.utc).date().isoformat()
    teams: dict[str, dict] = {}
    league_stats: dict[str, dict] = {}

    for league, (gender, start_date) in LEAGUES.items():
        try:
            team_rows = fetch_json(f"{BASE}/{league}/teams")
            team_by_id = {
                str(row.get("team_id")): str(row.get("team_name") or "").strip()
                for row in team_rows if row.get("team_id") and row.get("team_name")
            }
            params = urlencode({"start_date": start_date, "end_date": end_date})
            games = fetch_json(f"{BASE}/{league}/games/xgoals?{params}")
            if not isinstance(games, list):
                raise ValueError("ASA games/xgoals response is not a JSON array")

            seen_games = 0
            latest_date = ""
            for game in games:
                date_time = str(game.get("date_time_utc") or "")
                date = date_time[:10]
                home_goals, away_goals = numeric(game.get("home_goals")), numeric(game.get("away_goals"))
                home_xg = numeric(game.get("home_team_xgoals"))
                away_xg = numeric(game.get("away_team_xgoals"))
                home = team_by_id.get(str(game.get("home_team_id")), "")
                away = team_by_id.get(str(game.get("away_team_id")), "")
                if not date or not home or not away:
                    continue
                if None in (home_goals, away_goals, home_xg, away_xg):
                    continue
                if not float(home_goals).is_integer() or not float(away_goals).is_integer():
                    continue

                seen_games += 1
                latest_date = max(latest_date, date)
                match_id = f"asa:{league}:{game.get('game_id')}"
                for name, opponent, gf, ga, xgf, xga, is_home in (
                    (home, away, int(home_goals), int(away_goals), home_xg, away_xg, True),
                    (away, home, int(away_goals), int(home_goals), away_xg, home_xg, False),
                ):
                    key = norm_team(name)
                    if gender == "women" and "women" not in key.split():
                        key = (key + " women").strip()
                    if not key:
                        continue
                    entry = teams.setdefault(key, {
                        "name": name, "gender": gender, "leagues": [], "matches": [],
                    })
                    if league not in entry["leagues"]:
                        entry["leagues"].append(league)
                    entry["matches"].append({
                        "match_id": match_id,
                        "date": date,
                        "is_home": is_home,
                        "opponent": opponent,
                        "result": "W" if gf > ga else "L" if gf < ga else "D",
                        "goals_for": gf,
                        "goals_against": ga,
                        "xg_for": round(float(xgf), 4),
                        "xg_against": round(float(xga), 4),
                        "gender": gender,
                        "competition": league,
                        "source": "american_soccer_analysis",
                    })
            league_stats[league] = {
                "ok": True, "gender": gender, "matches": seen_games,
                "teams": len(team_by_id), "last_match_date": latest_date,
                "first_match_date": start_date,
            }
        except Exception as error:
            league_stats[league] = {
                "ok": False, "gender": gender, "error": str(error)[:240],
            }
        time.sleep(0.35)

    stored_rows = 0
    for entry in teams.values():
        unique = {}
        for match in entry["matches"]:
            unique.setdefault(match["match_id"], match)
        entry["matches"] = sorted(
            unique.values(), key=lambda x: (x["date"], x["match_id"]), reverse=True
        )[:MAX_MATCHES_PER_TEAM]
        stored_rows += len(entry["matches"])

    successful = {key: value for key, value in league_stats.items() if value.get("ok")}
    total_matches = sum(value["matches"] for value in successful.values())
    if not successful or total_matches < 100:
        raise SystemExit(f"ASA coverage validation failed: {league_stats}")

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "American Soccer Analysis public API",
        "source_url": "https://app.americansocceranalysis.com/api/v1/",
        "license": "CC BY-SA 4.0",
        "attribution": "American Soccer Analysis (ASA), https://www.americansocceranalysis.com/",
        "scope": "Historical and current match-level team xG for selected North American leagues; not a global xG feed.",
        "coverage": {
            "leagues": league_stats,
            "successful_leagues": len(successful),
            "team_names": len(teams),
            "source_matches": total_matches,
            "stored_team_match_rows": stored_rows,
            "matches_per_team_max": MAX_MATCHES_PER_TEAM,
        },
        "teams": teams,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), **payload["coverage"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
