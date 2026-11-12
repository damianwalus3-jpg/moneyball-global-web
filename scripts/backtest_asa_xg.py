#!/usr/bin/env python3
"""Temporal holdout comparison: ASA xG team form vs goals-only form.

This is a diagnostic benchmark, not a production-weight change. It uses only
matches strictly before each prediction date, then tunes a temperature on a
chronological validation slice and reports the untouched final test slice.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

DATA = Path("public-data/asa-xg.json")
OUT = Path("public-data/asa-xg-benchmark.json")
LOOKBACK_DAYS = 540
FORM_MATCHES = 10
MIN_HISTORY = 3
MAX_GOALS = 10


def poisson_probs(lam: float) -> list[float]:
    lam = min(5.0, max(0.05, float(lam)))
    values = [math.exp(-lam)]
    for k in range(1, MAX_GOALS + 1):
        values.append(values[-1] * lam / k)
    total = sum(values)
    return [x / total for x in values]


def outcome_probs(home_lambda: float, away_lambda: float) -> list[float]:
    home = poisson_probs(home_lambda)
    away = poisson_probs(away_lambda)
    p_home = p_draw = p_away = 0.0
    for h, ph in enumerate(home):
        for a, pa in enumerate(away):
            probability = ph * pa
            if h > a:
                p_home += probability
            elif h == a:
                p_draw += probability
            else:
                p_away += probability
    total = p_home + p_draw + p_away
    return [p_home / total, p_draw / total, p_away / total]


def recent_form(history: list[dict], target_date: str, field_for: str, field_against: str):
    rows = [
        row for row in history
        if row["date"] < target_date
        and (datetime.fromisoformat(target_date) - datetime.fromisoformat(row["date"])).days <= LOOKBACK_DAYS
        and row.get(field_for) is not None and row.get(field_against) is not None
    ]
    rows = sorted(rows, key=lambda row: row["date"], reverse=True)[:FORM_MATCHES]
    if len(rows) < MIN_HISTORY:
        return None
    return (
        sum(float(row[field_for]) for row in rows) / len(rows),
        sum(float(row[field_against]) for row in rows) / len(rows),
        len(rows),
    )


def calibrate(probabilities: list[list[float]], labels: list[int]) -> float:
    best_t, best_loss = 1.0, float("inf")
    for step in range(50, 201):
        temperature = step / 100.0
        loss = 0.0
        for probs, label in zip(probabilities, labels):
            logits = [math.log(max(p, 1e-12)) / temperature for p in probs]
            peak = max(logits)
            exps = [math.exp(x - peak) for x in logits]
            scaled = [x / sum(exps) for x in exps]
            loss -= math.log(max(scaled[label], 1e-12))
        loss /= max(1, len(labels))
        if loss < best_loss:
            best_t, best_loss = temperature, loss
    return best_t


def apply_temperature(probs: list[float], temperature: float) -> list[float]:
    logits = [math.log(max(p, 1e-12)) / temperature for p in probs]
    peak = max(logits)
    exps = [math.exp(x - peak) for x in logits]
    total = sum(exps)
    return [x / total for x in exps]


def metrics(rows: list[dict], field: str, temperature: float = 1.0) -> dict:
    if not rows:
        return {}
    correct = 0
    brier = logloss = 0.0
    confidence_rows = []
    for row in rows:
        probs = apply_temperature(row[field], temperature)
        label = row["label"]
        prediction = max(range(3), key=lambda i: probs[i])
        correct += int(prediction == label)
        brier += sum((probs[i] - int(i == label)) ** 2 for i in range(3))
        logloss -= math.log(max(probs[label], 1e-12))
        confidence_rows.append((max(probs), int(prediction == label)))
    ece = 0.0
    for bucket in range(10):
        low, high = bucket / 10, (bucket + 1) / 10
        group = [(conf, hit) for conf, hit in confidence_rows if low <= conf < high or (bucket == 9 and conf == 1)]
        if group:
            avg_conf = sum(x[0] for x in group) / len(group)
            avg_hit = sum(x[1] for x in group) / len(group)
            ece += len(group) / len(rows) * abs(avg_conf - avg_hit)
    n = len(rows)
    return {
        "accuracy": round(correct / n, 6),
        "brier": round(brier / n, 6),
        "log_loss": round(logloss / n, 6),
        "ece_top_class": round(ece, 6),
    }


def double_chance_metrics(rows: list[dict], field: str, temperature: float = 1.0) -> dict:
    markets = {
        "1X": ((0, 1), lambda label: label in (0, 1)),
        "X2": ((1, 2), lambda label: label in (1, 2)),
        "12": ((0, 2), lambda label: label in (0, 2)),
    }
    output = {}
    for market, (indices, wins) in markets.items():
        values = []
        for row in rows:
            probs = apply_temperature(row[field], temperature)
            probability = sum(probs[index] for index in indices)
            outcome = int(wins(row["label"]))
            values.append((probability, outcome))
        n = len(values)
        if not n:
            output[market] = {}
            continue
        accuracy = sum(int((p >= 0.5) == bool(y)) for p, y in values) / n
        brier = sum((p - y) ** 2 for p, y in values) / n
        logloss = -sum(math.log(max(min(p if y else 1-p, 1-1e-12), 1e-12)) for p, y in values) / n
        ece = 0.0
        for bucket in range(10):
            low, high = bucket / 10, (bucket + 1) / 10
            group = [(p, y) for p, y in values if low <= p < high or (bucket == 9 and p == 1)]
            if group:
                avg_p = sum(p for p, _ in group) / len(group)
                avg_y = sum(y for _, y in group) / len(group)
                ece += len(group) / n * abs(avg_p - avg_y)
        output[market] = {
            "accuracy_at_0_5": round(accuracy, 6),
            "brier": round(brier, 6),
            "log_loss": round(logloss, 6),
            "ece": round(ece, 6),
        }
    return output


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("teams"), dict):
        raise SystemExit("ASA xG dataset schema validation failed")

    matches: dict[str, dict] = {}
    for team_key, entry in data["teams"].items():
        for row in entry.get("matches", []):
            match_id = row.get("match_id")
            if not match_id or row.get("is_home") is None:
                continue
            match = matches.setdefault(match_id, {"date": row["date"], "competition": row.get("competition")})
            side = "home" if row["is_home"] else "away"
            match[side] = {
                "team": team_key,
                "goals_for": row.get("goals_for"),
                "goals_against": row.get("goals_against"),
                "xg_for": row.get("xg_for"),
                "xg_against": row.get("xg_against"),
            }

    complete = [
        (match_id, row) for match_id, row in matches.items()
        if row.get("home") and row.get("away")
        and row["home"]["goals_for"] is not None and row["away"]["goals_for"] is not None
        and row["home"]["xg_for"] is not None and row["away"]["xg_for"] is not None
    ]
    complete.sort(key=lambda item: (item[1]["date"], item[0]))
    histories: dict[str, list[dict]] = {}
    predictions: list[dict] = []

    for match_id, match in complete:
        date, home, away = match["date"], match["home"], match["away"]
        home_hist = histories.get(home["team"], [])
        away_hist = histories.get(away["team"], [])
        goals_home = recent_form(home_hist, date, "goals_for", "goals_against")
        goals_away = recent_form(away_hist, date, "goals_for", "goals_against")
        xg_home = recent_form(home_hist, date, "xg_for", "xg_against")
        xg_away = recent_form(away_hist, date, "xg_for", "xg_against")

        if goals_home and goals_away and xg_home and xg_away:
            goal_lambda_home = (goals_home[0] + goals_away[1]) / 2 * 1.05
            goal_lambda_away = (goals_away[0] + goals_home[1]) / 2
            xg_lambda_home = (xg_home[0] + xg_away[1]) / 2 * 1.05
            xg_lambda_away = (xg_away[0] + xg_home[1]) / 2
            label = 0 if home["goals_for"] > away["goals_for"] else 1 if home["goals_for"] == away["goals_for"] else 2
            predictions.append({
                "date": date, "label": label,
                "goals": outcome_probs(goal_lambda_home, goal_lambda_away),
                "xg": outcome_probs(xg_lambda_home, xg_lambda_away),
            })

        histories.setdefault(home["team"], []).append({
            "date": date, "goals_for": home["goals_for"], "goals_against": home["goals_against"],
            "xg_for": home["xg_for"], "xg_against": home["xg_against"],
        })
        histories.setdefault(away["team"], []).append({
            "date": date, "goals_for": away["goals_for"], "goals_against": away["goals_against"],
            "xg_for": away["xg_for"], "xg_against": away["xg_against"],
        })

    n = len(predictions)
    if n < 300:
        raise SystemExit(f"Not enough leak-free benchmark predictions: {n}")
    train_end, validation_end = int(n * 0.60), int(n * 0.80)
    validation = predictions[train_end:validation_end]
    test = predictions[validation_end:]
    if len(test) < 50:
        raise SystemExit(f"Not enough temporal holdout predictions: {len(test)}")

    goals_t = calibrate([x["goals"] for x in validation], [x["label"] for x in validation])
    xg_t = calibrate([x["xg"] for x in validation], [x["label"] for x in validation])
    goals_raw = metrics(test, "goals")
    xg_raw = metrics(test, "xg")
    goals_cal = metrics(test, "goals", goals_t)
    xg_cal = metrics(test, "xg", xg_t)

    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "American Soccer Analysis public API",
        "license": "CC BY-SA 4.0",
        "attribution": data.get("attribution"),
        "method": "Chronological rolling last-10 team form, 540-day lookback, independent Poisson 1X2; xG and goals models use the same matches; temperature fitted only on validation.",
        "matches_reconstructed": len(complete),
        "predictions_with_both_team_histories": n,
        "split": {"train": train_end, "validation": len(validation), "test": len(test)},
        "temperature": {"goals_only": goals_t, "xg": xg_t},
        "test": {
            "goals_only_raw": goals_raw,
            "xg_raw": xg_raw,
            "goals_only_calibrated": goals_cal,
            "xg_calibrated": xg_cal,
            "calibrated_delta_xg_minus_goals": {
                "accuracy": round(xg_cal["accuracy"] - goals_cal["accuracy"], 6),
                "brier": round(xg_cal["brier"] - goals_cal["brier"], 6),
                "log_loss": round(xg_cal["log_loss"] - goals_cal["log_loss"], 6),
                "ece_top_class": round(xg_cal["ece_top_class"] - goals_cal["ece_top_class"], 6),
            },
        },
        "double_chance": {
            "goals_only_raw": double_chance_metrics(test, "goals"),
            "xg_raw": double_chance_metrics(test, "xg"),
            "goals_only_calibrated": double_chance_metrics(test, "goals", goals_t),
            "xg_calibrated": double_chance_metrics(test, "xg", xg_t),
        },
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
