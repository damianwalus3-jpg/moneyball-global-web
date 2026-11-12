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
FORM_OUT = Path("public-data/team-form.json")
UA = "MONEYBALL-GLOBAL/3.5 (public football research; keyless GitHub data builder)"
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

def infer_gender(*values: str) -> str:
    text = " ".join(str(value or "") for value in values).lower()
    if re.search(r"\\b(women|womens|woman|frauen|femenina|femenino|feminin|female|damallsvenskan|wsl|liga[- ]?f)\\b", text):
        return "women"
    return "men"


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

OPENFOOTBALL_TREE = "https://api.github.com/repos/openfootball/football.json/git/trees/master?recursive=1"
OPENFOOTBALL_SEASONS = ("2026-27", "2025-26", "2024-25")
OPENFOOTBALL_LEAGUES = {
    "at.1", "at.2", "be.1", "de.1", "de.2", "en.1", "en.2", "en.3", "en.4",
    "es.1", "es.2", "fr.1", "fr.2", "gr.1", "it.1", "it.2", "nl.1", "pt.1",
    "sco.1", "tr.1", "uefa.cl", "uefa.el", "uefa.ecl",
    # Additional public-domain competitions outside the European core.
    "au.1", "dz.1", "eg.1", "ma.1", "mx.1"
}

def load_openfootball_league_results():
    tree = json.loads(get(OPENFOOTBALL_TREE))
    paths = sorted(
        item["path"] for item in tree.get("tree", [])
        if item.get("type") == "blob"
        and item["path"].split("/", 1)[0] in OPENFOOTBALL_SEASONS
        and item["path"].rsplit("/", 1)[-1].removesuffix(".json") in OPENFOOTBALL_LEAGUES
        and item["path"].endswith(".json")
    )
    def fetch_one(path):
        url = "https://raw.githubusercontent.com/openfootball/football.json/master/" + path
        return path, json.loads(get(url))
    loaded, failed = [], []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_one, path) for path in paths]
        for future in as_completed(futures):
            try: loaded.append(future.result())
            except Exception as exc: failed.append(str(exc)[:180])
    rows = []
    for path, payload in loaded:
        competition = str(payload.get("name") or path.rsplit("/", 1)[-1])
        for match in payload.get("matches", []):
            date = str(match.get("date") or "")[:10]
            home, away = str(match.get("team1") or "").strip(), str(match.get("team2") or "").strip()
            score = match.get("score")
            ft = score.get("ft") if isinstance(score, dict) else None
            if not date or not home or not away or not isinstance(ft, list) or len(ft) != 2:
                continue
            try: hg, ag = int(ft[0]), int(ft[1])
            except (TypeError, ValueError): continue
            rows.append((date, home, away, hg, ag, competition, path))
    return rows, len(paths), len(loaded), failed[:20]

TEXT_REPOS = ("openfootball/europe", "openfootball/world", "openfootball/south-america")

def parse_football_txt(path: str, raw: str, repository: str):
    """Parse dated Football.TXT match rows; keep only played matches with a final score."""
    year_match = re.match(r"^(\d{4})", path.rsplit("/", 1)[-1])
    current_year = int(year_match.group(1)) if year_match else None
    current_month = None
    current_date = None
    competition = ""
    rows = []
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped.startswith("=") and not competition:
            competition = stripped.lstrip("= ").strip()
            continue
        heading = re.match(r"^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?$", stripped)
        if heading:
            month_name, day, explicit_year = heading.groups()
            try:
                month = datetime.strptime(month_name, "%b").month
                if explicit_year:
                    current_year = int(explicit_year)
                elif current_month is not None and month < current_month - 6:
                    current_year += 1
                if current_year is not None:
                    current_date = datetime.strptime(f"{current_year} {month_name} {day}", "%Y %b %d").date().isoformat()
                    current_month = month
            except ValueError:
                current_date = None
            continue
        if not current_date or " v " not in stripped:
            continue
        home_part, away_part = stripped.split(" v ", 1)
        score = re.search(r"\s+(\d+)-(\d+)(?:\s+\(\d+-\d+\))?(?:\s+(?:AET|PEN))?\s*$", away_part, re.I)
        if not score:
            continue
        home = re.sub(r"^\d{1,2}:\d{2}\s+", "", home_part).strip()
        away = away_part[:score.start()].strip()
        if not home or not away:
            continue
        rows.append((current_date, home, away, int(score.group(1)), int(score.group(2)),
                     competition or path.rsplit("/", 1)[-1], f"{repository}/{path}"))
    return rows


def load_openfootball_text_results():
    tasks = []
    failures = []
    for repository in TEXT_REPOS:
        tree_url = f"https://api.github.com/repos/{repository}/git/trees/master?recursive=1"
        try:
            tree = json.loads(get(tree_url))
            for item in tree.get("tree", []):
                path = item.get("path", "")
                if item.get("type") != "blob" or not path.endswith(".txt"):
                    continue
                year_match = re.search(r"/(20\d{2})(?:-|_)", path)
                if year_match and int(year_match.group(1)) >= 2025:
                    tasks.append((repository, path))
        except Exception as exc:
            failures.append(f"{repository}: {str(exc)[:160]}")

    def fetch_one(args):
        repository, path = args
        url = f"https://raw.githubusercontent.com/{repository}/master/{path}"
        return repository, path, get(url)

    rows, loaded = [], 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch_one, task) for task in tasks]
        for future in as_completed(futures):
            try:
                repository, path, raw = future.result()
                parsed = parse_football_txt(path, raw, repository)
                rows.extend(parsed)
                loaded += 1
            except Exception as exc:
                failures.append(str(exc)[:180])
    return rows, len(tasks), loaded, failures[:30]


def validate_football_txt_parser():
    sample = """= Parser Test League
  Fri Dec 30 2026
    20:45 Home FC                 v Away FC                 2-1 (1-0)
  Sun Jan 2
           Third FC               v Fourth FC               0-0
"""
    rows = parse_football_txt("2026-27_test.txt", sample, "test/repo")
    if len(rows) != 2 or rows[0][0] != "2026-12-30" or rows[0][3:5] != (2, 1):
        raise SystemExit(f"Football.TXT parser regression: {rows}")
    if rows[1][0] != "2027-01-02" or rows[1][3:5] != (0, 0):
        raise SystemExit(f"Football.TXT year rollover regression: {rows}")
    if infer_gender("ENG_1_womens-super-league") != "women" or infer_gender("BUL_1_premier-league") != "men":
        raise SystemExit("Competition gender classification regression")


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
    validate_football_txt_parser()
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
                        "source": "OpenMatchday", "gender": infer_gender(folder, home, away)
                    }
                    team_rows.setdefault(key, {"name": team, "matches": []})["matches"].append(item)

    openfootball_rows, openfootball_files, openfootball_loaded, openfootball_failed = load_openfootball_league_results()
    for date, home, away, hg, ag, competition, source_path in openfootball_rows:
        for team, opponent, gf, ga in ((home, away, hg, ag), (away, home, ag, hg)):
            key = norm(team)
            if not key: continue
            result = "W" if gf > ga else "L" if gf < ga else "D"
            league_code = source_path.rsplit("/", 1)[-1].removesuffix(".json").replace("-full", "")
            country_by_code = {
                "at": "Austria", "au": "Australia", "be": "Belgium", "de": "Germany",
                "dz": "Algeria", "eg": "Egypt", "en": "England", "es": "Spain",
                "fr": "France", "gr": "Greece", "it": "Italy", "ma": "Morocco",
                "mx": "Mexico", "nl": "Netherlands", "pt": "Portugal", "sco": "Scotland",
                "tr": "Turkey", "uefa": "UEFA"
            }
            country = country_by_code.get(league_code.split(".", 1)[0], "unknown")
            item = {"date":date,"opponent":opponent,"result":result,"goals_for":gf,"goals_against":ga,
                "shots_for":None,"shots_against":None,"shots_on_target_for":None,"shots_on_target_against":None,
                "corners_for":None,"corners_against":None,"fouls_for":None,"fouls_against":None,
                "yellow_for":None,"yellow_against":None,"red_for":None,"red_against":None,
                "competition":competition,"country":country,"source":"OpenFootball Leagues","source_path":source_path,"gender":infer_gender(competition,source_path,home,away)}
            team_rows.setdefault(key, {"name":team,"matches":[]})["matches"].append(item)

    text_rows, text_files, text_loaded, text_failed = load_openfootball_text_results()
    for date, home, away, hg, ag, competition, source_path in text_rows:
        for team, opponent, gf, ga in ((home, away, hg, ag), (away, home, ag, hg)):
            key = norm(team)
            if not key:
                continue
            result = "W" if gf > ga else "L" if gf < ga else "D"
            item = {"date":date,"opponent":opponent,"result":result,"goals_for":gf,"goals_against":ga,
                "shots_for":None,"shots_against":None,"shots_on_target_for":None,"shots_on_target_against":None,
                "corners_for":None,"corners_against":None,"fouls_for":None,"fouls_against":None,
                "yellow_for":None,"yellow_against":None,"red_for":None,"red_against":None,
                "competition":competition,"country":"INT","source":"OpenFootball Text","source_path":source_path,"gender":infer_gender(competition,source_path,home,away)}
            team_rows.setdefault(key, {"name":team,"matches":[]})["matches"].append(item)

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
                "competition":competition,"country":"INT","source":"OpenFootball Internationals","source_path":source_path,"gender":"men"}
            team_rows.setdefault(key, {"name":team,"matches":[]})["matches"].append(item)
            alias = TEAM_ALIASES.get(key)
            if alias: team_rows.setdefault(alias, {"name":team,"matches":[]})["matches"].append(item)

    teams = {}
    for key, entry in team_rows.items():
        # A club may appear in a league and a cup; deduplicate exact same fixture rows.
        seen, unique = set(), []
        for item in sorted(entry["matches"], key=lambda x: x["date"], reverse=True):
            dedupe = (item["date"], norm(item["opponent"]), item["goals_for"], item["goals_against"], item.get("gender", "unknown"))
            if dedupe in seen:
                continue
            seen.add(dedupe)
            unique.append(item)
        teams[key] = {"name": entry["name"], "matches": unique[:20]}
    compact_teams = {
        key: {
            "name": entry["name"],
            "matches": [
                {field: item.get(field) for field in ("date","opponent","result","goals_for","goals_against","shots_for","shots_against","shots_on_target_for","shots_on_target_against","corners_for","corners_against","fouls_for","fouls_against","yellow_for","yellow_against","red_for","red_against","competition","country","source","source_path","gender")}
                for item in entry["matches"][:10]
            ]
        }
        for key, entry in teams.items()
    }
    form_payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenMatchday + OpenFootball JSON/text leagues + internationals",
        "attribution": "OpenMatchday contributors (non-commercial informational use with attribution); OpenFootball football.json, Europe, World, South America and Internationals (CC0 1.0).",
        "coverage": {
            "team_names": len(compact_teams),
            "openmatchday_competitions_with_results": successful,
            "openmatchday_result_rows_read": total_rows,
            "openfootball_league_files_loaded": openfootball_loaded,
            "openfootball_league_matches_read": len(openfootball_rows),
            "openfootball_text_files_indexed": text_files,
            "openfootball_text_files_loaded": text_loaded,
            "openfootball_text_matches_read": len(text_rows),
            "international_files_loaded": international_loaded,
            "international_matches_read": len(international_rows)
        },
        "teams": compact_teams
    }
    FORM_OUT.parent.mkdir(parents=True, exist_ok=True)
    FORM_OUT.write_text(json.dumps(form_payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenMatchday public CSV + OpenFootball global JSON/text leagues + OpenFootball Internationals",
        "source_url": "https://github.com/oladeeayo/open-matchday and https://github.com/openfootball/internationals",
        "licences": ["OpenMatchday: non-commercial informational use with attribution; upstream provider terms apply.", "OpenFootball football.json, Europe, World, South America and Internationals: CC0 1.0"],
        "source_url": "https://github.com/oladeeayo/open-matchday",
        "attribution": "OpenMatchday contributors; OpenFootball contributors (CC0 1.0); informational non-commercial use for OpenMatchday; upstream provider rights apply.",
        "coverage": {
            "competitions_indexed": len(folders),
            "competitions_with_results": successful,
            "team_names": len(teams),
            "result_rows_read": total_rows,
            "international_files_indexed": international_files,
            "international_files_loaded": international_loaded,
            "openfootball_league_files_indexed": openfootball_files,
            "openfootball_league_files_loaded": openfootball_loaded,
            "openfootball_league_matches_read": len(openfootball_rows),
            "openfootball_text_files_indexed": text_files,
            "openfootball_text_files_loaded": text_loaded,
            "openfootball_text_matches_read": len(text_rows),
            "openfootball_text_fetch_errors": text_failed,
            "openfootball_league_fetch_errors": openfootball_failed,
            "international_matches_read": len(international_rows),
            "international_fetch_errors": international_failed,
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
