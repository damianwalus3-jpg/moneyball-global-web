#!/usr/bin/env python3
"""Leakage-safe historical comparison of goals-only and xG-blended Poisson models.

Uses only matches strictly earlier than each test match's calendar date.
Outputs calibration and scoring metrics; it does not tune or deploy model weights.
"""
from __future__ import annotations

import json
import math
from bisect import bisect_left
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openplay as op
import pandas as pd

OUT = Path("public-data/openplay-xg-backtest.json")
MAX_HISTORY = 10
MIN_HISTORY = 3


def mean(rows: list[dict], field: str) -> float:
    values = [float(row[field]) for row in rows if row.get(field) is not None]
    return sum(values) / len(values) if values else 0.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def poisson_vector(lam: float) -> list[float]:
    values = [math.exp(-lam) * lam**k / math.factorial(k) for k in range(9)]
    total = sum(values)
    return [value / total for value in values]


def probabilities(home_history: list[dict], away_history: list[dict], use_xg: bool) -> tuple[float, float, float]:
    if use_xg:
        home_attack = 0.65 * mean(home_history, "xg_for") + 0.35 * mean(home_history, "goals_for")
        home_defence = 0.65 * mean(home_history, "xg_against") + 0.35 * mean(home_history, "goals_against")
        away_attack = 0.65 * mean(away_history, "xg_for") + 0.35 * mean(away_history, "goals_for")
        away_defence = 0.65 * mean(away_history, "xg_against") + 0.35 * mean(away_history, "goals_against")
    else:
        home_attack = mean(home_history, "goals_for")
        home_defence = mean(home_history, "goals_against")
        away_attack = mean(away_history, "goals_for")
        away_defence = mean(away_history, "goals_against")

    lambda_home = clamp(((home_attack + away_defence) / 2) * 1.06, 0.15, 3.6)
    lambda_away = clamp(((away_attack + home_defence) / 2) * 0.94, 0.15, 3.6)
    home_goals, away_goals = poisson_vector(lambda_home), poisson_vector(lambda_away)

    p1 = px = p2 = 0.0
    for h, ph in enumerate(home_goals):
        for a, pa in enumerate(away_goals):
            probability = ph * pa
            if h > a:
                p1 += probability
            elif h == a:
                px += probability
            else:
                p2 += probability
    total = p1 + px + p2
    return p1 / total, px / total, p2 / total


def score_model(rows: list[dict], key: str) -> dict:
    if not rows:
        return {"matches": 0}
    brier_1x2 = logloss_1x2 = correct_1x2 = 0.0
    dc_brier = dc_logloss = dc_wins = 0.0
    dc_count = 0
    for row in rows:
        probs = row[key]
        actual = row["actual"]
        one_hot = [1.0 if actual == 0 else 0.0, 1.0 if actual == 1 else 0.0, 1.0 if actual == 2 else 0.0]
        brier_1x2 += sum((p - y) ** 2 for p, y in zip(probs, one_hot)) / 3
        logloss_1x2 += -math.log(max(probs[actual], 1e-15))
        correct_1x2 += float(max(range(3), key=lambda i: probs[i]) == actual)

        dc_probs = [probs[0] + probs[1], probs[1] + probs[2], probs[0] + probs[2]]
        dc_actual = [actual in (0, 1), actual in (1, 2), actual in (0, 2)]
        for probability, won in zip(dc_probs, dc_actual):
            y = float(won)
            dc_brier += (probability - y) ** 2
            dc_logloss += -(math.log(max(probability, 1e-15)) if won else math.log(max(1 - probability, 1e-15)))
            dc_wins += y
            dc_count += 1

    n = len(rows)
    return {
        "matches": n,
        "1x2_accuracy_pct": round(100 * correct_1x2 / n, 2),
        "1x2_multiclass_brier": round(brier_1x2 / n, 5),
        "1x2_log_loss": round(logloss_1x2 / n, 5),
        "double_chance_hit_pct": round(100 * dc_wins / dc_count, 2),
        "double_chance_brier": round(dc_brier / dc_count, 5),
        "double_chance_log_loss": round(dc_logloss / dc_count, 5),
    }


def main() -> None:
    stats = op.team_match_stats()
    required = {"match_id", "comp", "season", "date", "team_id", "goals_for", "goals_against", "xg", "xg_against", "side"}
    missing = required.difference(stats.columns)
    if missing:
        raise SystemExit("OpenPlay schema changed; missing columns: " + ", ".join(sorted(missing)))

    try:
        issues = op.data_issues()
        issue_ids = set(int(x) for x in issues["match_id"].dropna().unique()) if "match_id" in issues.columns else set()
    except Exception:
        issue_ids = set()

    frame = stats.copy()
    frame["match_id"] = pd.to_numeric(frame["match_id"], errors="coerce")
    frame["team_id"] = pd.to_numeric(frame["team_id"], errors="coerce")
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce", utc=True).dt.strftime("%Y-%m-%d")
    frame = frame.dropna(subset=["match_id", "team_id", "date", "goals_for", "goals_against", "xg", "xg_against"])
    frame = frame[~frame["match_id"].astype("int64").isin(issue_ids)]
    frame["match_id"] = frame["match_id"].astype("int64")
    frame["team_id"] = frame["team_id"].astype("int64")

    histories: dict[int, list[dict]] = defaultdict(list)
    for row in frame.itertuples(index=False):
        histories[int(row.team_id)].append({
            "date": str(row.date),
            "match_id": int(row.match_id),
            "goals_for": float(row.goals_for),
            "goals_against": float(row.goals_against),
            "xg_for": float(row.xg),
            "xg_against": float(row.xg_against),
        })
    history_dates = {}
    for team_id, rows in histories.items():
        rows.sort(key=lambda x: (x["date"], x["match_id"]))
        history_dates[team_id] = [row["date"] for row in rows]

    test_rows: list[dict] = []
    by_match = frame.groupby("match_id", sort=False)
    for match_id, group in by_match:
        home_rows = group[group["side"].astype(str).str.lower() == "home"]
        away_rows = group[group["side"].astype(str).str.lower() == "away"]
        if home_rows.empty or away_rows.empty:
            continue
        home = home_rows.iloc[0]
        away = away_rows.iloc[0]
        home_id, away_id = int(home["team_id"]), int(away["team_id"])
        date = str(home["date"])
        h_all, a_all = histories.get(home_id, []), histories.get(away_id, [])
        hi = bisect_left(history_dates.get(home_id, []), date)
        ai = bisect_left(history_dates.get(away_id, []), date)
        h_history = h_all[max(0, hi - MAX_HISTORY):hi]
        a_history = a_all[max(0, ai - MAX_HISTORY):ai]
        if len(h_history) < MIN_HISTORY or len(a_history) < MIN_HISTORY:
            continue
        actual_home, actual_away = int(home["goals_for"]), int(away["goals_for"])
        actual = 0 if actual_home > actual_away else 1 if actual_home == actual_away else 2
        xg_rows = min(
            sum(row.get("xg_for") is not None and row.get("xg_against") is not None for row in h_history),
            sum(row.get("xg_for") is not None and row.get("xg_against") is not None for row in a_history),
        )
        if xg_rows < MIN_HISTORY:
            continue
        test_rows.append({
            "match_id": int(match_id),
            "date": date,
            "competition": str(home["comp"]),
            "season": str(home["season"]),
            "actual": actual,
            "goals_only": probabilities(h_history, a_history, False),
            "xg_blended": probabilities(h_history, a_history, True),
        })

    if len(test_rows) < 1000:
        raise SystemExit(f"Backtest coverage validation failed: only {len(test_rows)} matches with sufficient prior form.")

    results = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "openplay (Noah Bair), CC-BY-4.0",
        "method": "Leakage-safe rolling last-10 history; only matches strictly before the test match date; minimum 3 prior matches per team; 65% xG + 35% goals compared with goals-only Poisson baseline.",
        "known_issue_matches_excluded": len(issue_ids),
        "test_matches": len(test_rows),
        "goals_only": score_model(test_rows, "goals_only"),
        "xg_blended": score_model(test_rows, "xg_blended"),
        "note": "Historical backtest on OpenPlay-covered men's competitions only. This is not evidence of performance on all leagues, women, youth, or the 2026/27 season.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
