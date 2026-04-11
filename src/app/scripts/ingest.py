"""
Full ETL pipeline. Runs all scripts in order:

    1. extract.py                 — run all Google Sheets extracts
    2. transform_players.py       — produce data/outputs/players.csv
    3. load_players_to_supabase_full_refresh.py — insert players (generates player_id values in Supabase)
    4. transform_matches.py       — produce matches.csv and match_teams.csv (needs player_ids)
    5. transform_sets.py          — produce match_sets.csv
    6. transform_ratings.py       — produce match_player_ratings.csv (needs player_ids)
    7. load_all_to_supabase_full_refresh.py — insert matches, match_teams, match_sets, ratings
"""

import subprocess
import sys
from datetime import datetime
from pathlib import Path
from time import perf_counter

SCRIPTS_DIR = Path(__file__).resolve().parent

PIPELINE = [
    ("Extract: all sheets",                             "extract.py"),
    ("Transform: players",                              "transform_players.py"),
    ("Load: players → Supabase",                        "load_players_to_supabase_full_refresh.py"),
    ("Transform: matches + match_teams",                "transform_matches.py"),
    ("Transform: match_sets",                           "transform_sets.py"),
    ("Transform: match_player_ratings",                 "transform_ratings.py"),
    ("Load: matches / match_teams / match_sets / ratings → Supabase", "load_all_to_supabase_full_refresh.py"),
]


def log(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)


def run_step(label: str, script: str) -> None:
    script_path = SCRIPTS_DIR / script
    log(f"--- {label} ---")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=SCRIPTS_DIR.parents[2],  # repo root
    )
    if result.returncode != 0:
        raise SystemExit(f"Step failed (exit {result.returncode}): {script}")
    log(f"Done: {script}")


def main() -> None:
    started_at = perf_counter()
    log("Starting full ingest pipeline")
    for label, script in PIPELINE:
        run_step(label, script)
    elapsed = perf_counter() - started_at
    if elapsed >= 60:
        log(f"Total elapsed time: {elapsed / 60:.2f} minutes")
    else:
        log(f"Total elapsed time: {elapsed:.2f} seconds")
    log("Ingest pipeline complete")


if __name__ == "__main__":
    main()
