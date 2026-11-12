#!/usr/bin/env python3
"""Build a compact, keyless historical xG index from the openplay CC-BY-4.0 release.

The source is a historical men's-football snapshot, not a live feed. It is kept
separate from the live fixture/history feeds so stale xG is never mistaken for
current-season data.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import openplay as op
import pandas as pd

OUT = Path("public-data/openplay-xg.json")
MAX_MATCHES_PER_TEAM = 20
REQUIRED = {
    "match_id", "comp", "season", "date", "team_id", "opponent_id",
    "goals_for", "goals_against", "xg", "npxg", "xg_against",
    "npxg_against", "shots", "shots_on_target", "shots_against",
    "shots_on_target_against", "side",
}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(c for c in value if not unicodedata.combining(c)).lower()
    value = re.sub(r"\b(fc|cf|sc|ac|afc|club)\b", " ", value)
    value = re.sub(r"\b(women|w)\b", " women ", value)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()


def clean_number(value, digits: int = 3):
    if pd.isna(value):
        return None
    number = float(value)
    return round(number, digits)


def main() -> None:
    stats = op.team_match_stats()
    teams_df = op.teams()

    missing = REQUIRED.difference(stats.columns)
    if missing:
        raise SystemExit("OpenPlay schema changed; missing columns: " + ", ".join(sorted(missing)))
    if not {"team_id", "team", "country", "team_type"}.issubset(teams_df.columns):
        raise SystemExit("OpenPlay teams table has an unexpected schema.")

    team_names = {
        int(row.team_id): str(row.team)
        for row in teams_df[["team_id", "team"]].dropna().itertuples(index=False)
    }
    team_meta = {
        int(row.team_id): {
            "country": None if pd.isna(row.country) else str(row.country),
            "team_type": None if pd.isna(row.team_type) else str(row.team_type),
        }
        for row in teams_df[["team_id", "country", "team_type"]].dropna(subset=["team_id"]).itertuples(index=False)
    }

    try:
        issues = op.data_issues()
        issue_ids = set(int(x) for x in issues["match_id"].dropna().unique()) if "match_id" in issues.columns else set()
    except Exception:
        issue_ids = set()

    frame = stats.copy()
    frame["match_id"] = pd.to_numeric(frame["match_id"], errors="coerce")
    frame["team_id"] = pd.to_numeric(frame["team_id"], errors="coerce")
    frame["opponent_id"] = pd.to_numeric(frame["opponent_id"], errors="coerce")
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce", utc=True)
    frame = frame.dropna(subset=["match_id", "team_id", "opponent_id", "date", "xg", "xg_against"])
    frame = frame[~frame["match_id"].astype("int64").isin(issue_ids)]
    frame = frame[frame["team_id"].isin(team_names) & frame["opponent_id"].isin(team_names)]
    source_match_count = int(frame["match_id"].nunique())
    source_team_rows = int(len(frame))
    source_dates = frame["date"]
    frame = frame.sort_values(["team_id", "date", "match_id"], ascending=[True, False, False])
    frame = frame.groupby("team_id", sort=False).head(MAX_MATCHES_PER_TEAM)

    teams: dict[str, dict] = {}
    for row in frame.itertuples(index=False):
        team_id = int(row.team_id)
        opponent_id = int(row.opponent_id)
        team_name = team_names[team_id]
        key = norm(team_name)
        if not key:
            continue
        meta = team_meta.get(team_id, {})
        entry = teams.setdefault(key, {
            "name": team_name,
            "country": meta.get("country"),
            "team_type": meta.get("team_type"),
            "team_ids": [],
            "matches": [],
        })
        if team_id not in entry["team_ids"]:
            entry["team_ids"].append(team_id)

        gf, ga = int(row.goals_for), int(row.goals_against)
        item = {
            "match_id": int(row.match_id),
            "date": row.date.strftime("%Y-%m-%d"),
            "opponent": team_names[opponent_id],
            "result": "W" if gf > ga else "L" if gf < ga else "D",
            "goals_for": gf,
            "goals_against": ga,
            "xg_for": clean_number(row.xg),
            "xg_against": clean_number(row.xg_against),
            "npxg_for": clean_number(row.npxg),
            "npxg_against": clean_number(row.npxg_against),
            "shots_for": int(row.shots),
            "shots_against": int(row.shots_against),
            "shots_on_target_for": int(row.shots_on_target),
            "shots_on_target_against": int(row.shots_on_target_against),
            "competition": str(row.comp),
            "season": str(row.season),
            "side": str(row.side),
            "source": "openplay",
        }
        entry["matches"].append(item)

    # Same team name can have more than one upstream ID. Merge and deduplicate safely.
    for entry in teams.values():
        unique = {}
        for item in entry["matches"]:
            unique.setdefault(item["match_id"], item)
        entry["matches"] = sorted(unique.values(), key=lambda x: (x["date"], x["match_id"]), reverse=True)[:MAX_MATCHES_PER_TEAM]

    if len(teams) < 100 or source_match_count < 10000:
        raise SystemExit(f"OpenPlay coverage validation failed: teams={len(teams)}, source_matches={source_match_count}")

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "openplay (Noah Bair)",
        "source_url": "https://github.com/nlbair/openplay",
        "data_release": "data-v0.1.0",
        "license": "CC-BY-4.0",
        "attribution": "openplay (Noah Bair), https://github.com/nlbair/openplay",
        "scope": "Historical men's football event-derived team statistics; not a live feed and not a complete global or women's dataset.",
        "coverage": {
            "team_names": len(teams),
            "source_team_match_rows": source_team_rows,
            "stored_team_match_rows": int(len(frame)),
            "unique_matches": source_match_count,
            "competitions": sorted(str(x) for x in frame["comp"].dropna().unique()),
            "seasons": sorted(str(x) for x in frame["season"].dropna().unique()),
            "first_match_date": source_dates.min().strftime("%Y-%m-%d"),
            "last_match_date": source_dates.max().strftime("%Y-%m-%d"),
            "known_issue_matches_excluded": len(issue_ids),
            "matches_per_team_max": MAX_MATCHES_PER_TEAM,
        },
        "teams": teams,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), **payload["coverage"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
