"""
Full ETL pipeline. Runs all scripts in order:

    1. extract/extract.py                 — run all Google Sheets extracts
    2. transform/transform_players.py     — produce data/outputs/players.csv
    3. load/load_players_to_supabase_full_refresh.py — insert players (generates player_id values in Supabase)
    4. transform/transform_teams.py       — produce data/outputs/teams.csv (needs player_ids)
    5. load/load_teams_to_supabase_full_refresh.py — insert teams
    6. transform/transform_matches.py     — produce matches.csv and match_teams.csv (needs player_ids)
    7. transform/transform_sets.py        — produce match_sets.csv
    8. transform/transform_ratings.py     — produce match_player_ratings.csv (needs player_ids)
    9. load/load_matches_to_supabase_full_refresh.py — truncate dependent tables and insert matches
   10. load/load_match_teams_to_supabase_full_refresh.py — insert match_teams
   11. load/load_match_sets_to_supabase_full_refresh.py — insert match_sets
   12. load/load_match_player_ratings_to_supabase_full_refresh.py — insert match_player_ratings if CSV exists
   13. load/load_reset_matches_sequence.py — reset matches sequence to max(match_id)
"""

import subprocess
import sys
from datetime import datetime
from pathlib import Path
from time import perf_counter

SCRIPTS_DIR = Path(__file__).resolve().parent

PIPELINE = [
    ("Extract: all sheets",                             "extract/extract.py"),
    ("Transform: players",                              "transform/transform_players.py"),
    ("Load: players → Supabase",                        "load/load_players_to_supabase_full_refresh.py"),
    ("Transform: teams",                                "transform/transform_teams.py"),
    ("Load: teams → Supabase",                          "load/load_teams_to_supabase_full_refresh.py"),
    ("Transform: matches + match_teams",                "transform/transform_matches.py"),
    ("Transform: match_sets",                           "transform/transform_sets.py"),
    ("Transform: match_player_ratings",                 "transform/transform_ratings.py"),
    ("Load: matches (truncate + insert)",               "load/load_matches_to_supabase_full_refresh.py"),
    ("Load: match_teams",                                "load/load_match_teams_to_supabase_full_refresh.py"),
    ("Load: match_sets",                                 "load/load_match_sets_to_supabase_full_refresh.py"),
    ("Load: match_player_ratings",                       "load/load_match_player_ratings_to_supabase_full_refresh.py"),
    ("Load: reset matches sequence",                     "load/load_reset_matches_sequence.py"),
]


def log(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)


def run_step(label: str, script: str) -> None:
    script_path = SCRIPTS_DIR / script
    log(f"--- {label} ---")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=SCRIPTS_DIR.parents[3],  # repo root
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
