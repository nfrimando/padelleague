import os
from pathlib import Path

import pandas as pd
from supabase import create_client


BASE_DIR = Path(__file__).resolve().parents[4]
INPUT_PATH = BASE_DIR / "data" / "inputs" / "dim_team.csv"
OUTPUT_DIR = BASE_DIR / "data" / "outputs"
OUTPUT_PATH = OUTPUT_DIR / "teams.csv"


def load_env_file(filepath: Path) -> None:
    if not filepath.exists():
        return

    with filepath.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def clean_text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    value_str = str(value).strip()
    return value_str or None


def clean_int(value: object) -> int | None:
    if value is None or pd.isna(value):
        return None
    value_str = str(value).strip()
    if not value_str:
        return None
    try:
        return int(float(value_str))
    except ValueError:
        return None


def build_player_lookup() -> dict[str, int]:
    load_env_file(BASE_DIR / ".env.local")

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        raise SystemExit(
            "Missing Supabase environment variables. "
            "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
        )

    supabase = create_client(supabase_url, supabase_key)
    players_res = supabase.table("players").select("player_id,name,nickname").execute()

    lookup: dict[str, int] = {}
    for player in players_res.data or []:
        player_id = clean_int(player.get("player_id"))
        if player_id is None:
            continue

        name = clean_text(player.get("name"))
        nickname = clean_text(player.get("nickname"))

        if name:
            lookup[name.lower()] = player_id
        if nickname:
            lookup[nickname.lower()] = player_id

    return lookup


def main() -> None:
    if not INPUT_PATH.exists():
        raise SystemExit(f"Missing input file: {INPUT_PATH}")

    print(f"[INFO] Reading input CSV: {INPUT_PATH}")
    df = pd.read_csv(INPUT_PATH)

    required_columns = [
        "season",
        "team",
        "icon",
        "captain",
        "rank",
        "co-captain",
        "team_id",
    ]

    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise SystemExit(f"Missing required columns in dim_team.csv: {missing_columns}")

    player_lookup = build_player_lookup()
    print(f"[INFO] Loaded {len(player_lookup)} player name/nickname keys from Supabase")

    def map_player_id(player_name: object) -> int | None:
        key = clean_text(player_name)
        if not key:
            return None
        return player_lookup.get(key.lower())

    output_df = pd.DataFrame(
        {
            "team_id": df["team_id"].apply(clean_int),
            "season_id": df["season"].apply(clean_int),
            "team_name": df["team"].apply(clean_text),
            "icon": df["icon"].apply(clean_text),
            "captain_player_id": df["captain"].apply(map_player_id),
            "co_captain_player_id": df["co-captain"].apply(map_player_id),
            "final_rank": df["rank"].apply(clean_int),
        }
    )

    unmatched_captains = sorted(
        {
            clean_text(name)
            for name in df["captain"].tolist()
            if clean_text(name) and map_player_id(name) is None
        }
    )
    unmatched_co_captains = sorted(
        {
            clean_text(name)
            for name in df["co-captain"].tolist()
            if clean_text(name) and map_player_id(name) is None
        }
    )

    if unmatched_captains:
        print(f"[WARN] Unmatched captain names: {unmatched_captains}")
    if unmatched_co_captains:
        print(f"[WARN] Unmatched co-captain names: {unmatched_co_captains}")

    output_df = output_df[
        output_df["season_id"].notna() & output_df["team_name"].notna()
    ].copy()

    output_df["team_id"] = output_df["team_id"].astype("Int64")
    output_df["season_id"] = output_df["season_id"].astype("Int64")
    output_df["captain_player_id"] = output_df["captain_player_id"].astype("Int64")
    output_df["co_captain_player_id"] = output_df["co_captain_player_id"].astype("Int64")
    output_df["final_rank"] = output_df["final_rank"].astype("Int64")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_df.to_csv(OUTPUT_PATH, index=False, na_rep="")

    print(f"[DONE] Saved {len(output_df)} rows to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
