import csv
import os
from pathlib import Path
from datetime import datetime
from time import perf_counter

try:
    import psycopg
except ImportError as exc:
    raise SystemExit(
        "psycopg is required. Install it with: pip install psycopg[binary]"
    ) from exc


BASE_DIR = Path(__file__).resolve().parents[3]
OUTPUT_DIR = BASE_DIR / "data" / "outputs"

PLAYERS_CSV = OUTPUT_DIR / "dim_players_fixed.csv"
MATCHES_CSV = OUTPUT_DIR / "matches_fixed.csv"
MATCH_TEAMS_CSV = OUTPUT_DIR / "match_teams_fixed.csv"
MATCH_SETS_CSV = OUTPUT_DIR / "match_sets_fixed.csv"


def log(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def load_env_file(filepath: Path) -> None:
    if not filepath.exists():
        return

    with filepath.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def get_database_url() -> str:
    log("Loading environment from .env.local")
    load_env_file(BASE_DIR / ".env.local")

    for env_var in (
        "SUPABASE_DB_URL",
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_PRISMA_URL",
    ):
        value = os.getenv(env_var)
        if value:
            log(f"Using database URL from {env_var}")
            return value

    raise SystemExit(
        "Missing database connection string. Set SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL in .env.local"
    )


def ensure_files_exist() -> None:
    log("Checking required output CSV files")
    missing = [
        str(path)
        for path in (PLAYERS_CSV, MATCHES_CSV, MATCH_TEAMS_CSV, MATCH_SETS_CSV)
        if not path.exists()
    ]
    if missing:
        raise SystemExit(f"Missing required CSV files: {', '.join(missing)}")
    log("All required CSV files found")


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def clean_int(value: str | None) -> int | None:
    value = clean_text(value)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        # Some CSV exports encode ints as float strings (e.g. "1.0").
        float_value = float(value)
        if not float_value.is_integer():
            raise ValueError(f"Expected integer-compatible value, got: {value}")
        return int(float_value)


def clean_bool(value: str | None) -> bool:
    value = clean_text(value)
    if value is None:
        return False
    return value.lower() in {"true", "t", "1", "yes", "y"}


def read_players() -> list[tuple[str, str, str | None]]:
    log(f"Reading players CSV: {PLAYERS_CSV}")
    rows: list[tuple[str, str, str | None]] = []
    with PLAYERS_CSV.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            name = clean_text(row.get("name"))
            nickname = clean_text(row.get("nickname"))
            image_link = clean_text(row.get("image_link"))

            if not name or not nickname:
                continue

            rows.append((name, nickname, image_link))
            log(f"Prepared {len(rows)} player rows")
    return rows


def read_matches() -> list[tuple[int, int | None, str | None, str | None, str | None, str | None, int | None, bool]]:
    log(f"Reading matches CSV: {MATCHES_CSV}")
    rows: list[tuple[int, int | None, str | None, str | None, str | None, str | None, int | None, bool]] = []
    with MATCHES_CSV.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            match_id = clean_int(row.get("match_id"))
            if match_id is None:
                continue

            rows.append(
                (
                    match_id,
                    clean_int(row.get("season")),
                    clean_text(row.get("date_local")),
                    clean_text(row.get("time_local")),
                    clean_text(row.get("venue")),
                    clean_text(row.get("type")),
                    clean_int(row.get("winner_team")),
                    clean_bool(row.get("is_forfeit")),
                )
            )
    log(f"Prepared {len(rows)} match rows")
    return rows


def read_match_teams() -> list[tuple[int, int, int | None, int | None, int | None]]:
    log(f"Reading match teams CSV: {MATCH_TEAMS_CSV}")
    rows: list[tuple[int, int, int | None, int | None, int | None]] = []
    with MATCH_TEAMS_CSV.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            match_id = clean_int(row.get("match_id"))
            team_number = clean_int(row.get("team_number"))
            if match_id is None or team_number is None:
                continue

            rows.append(
                (
                    match_id,
                    team_number,
                    clean_int(row.get("player_1_id")),
                    clean_int(row.get("player_2_id")),
                    clean_int(row.get("sets_won")),
                )
            )
    log(f"Prepared {len(rows)} match_team rows")
    return rows


def read_match_sets() -> list[tuple[int, int, int, int]]:
    log(f"Reading match sets CSV: {MATCH_SETS_CSV}")
    rows: list[tuple[int, int, int, int]] = []
    with MATCH_SETS_CSV.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            match_id = clean_int(row.get("match_id"))
            set_number = clean_int(row.get("set_number"))
            team_1_games = clean_int(row.get("team_1_games"))
            team_2_games = clean_int(row.get("team_2_games"))

            if (
                match_id is None
                or set_number is None
                or team_1_games is None
                or team_2_games is None
            ):
                continue

            rows.append((match_id, set_number, team_1_games, team_2_games))

    log(f"Prepared {len(rows)} match_set rows")
    return rows


def reset_sequences(cursor) -> None:
    log("Resetting sequences for players.player_id and matches.match_id")
    cursor.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('players', 'player_id'),
            COALESCE((SELECT MAX(player_id) FROM players), 1),
            COALESCE((SELECT MAX(player_id) FROM players), 0) > 0
        )
        """
    )
    cursor.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('matches', 'match_id'),
            COALESCE((SELECT MAX(match_id) FROM matches), 1),
            COALESCE((SELECT MAX(match_id) FROM matches), 0) > 0
        )
        """
    )


def main() -> None:
    log("Starting full refresh from CSV outputs")
    ensure_files_exist()

    players = read_players()
    matches = read_matches()
    match_teams = read_match_teams()
    match_sets = read_match_sets()

    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Truncating tables: match_sets, match_teams, matches, players")
            cursor.execute(
                "TRUNCATE TABLE match_sets, match_teams, matches, players RESTART IDENTITY CASCADE"
            )

            log("Inserting players rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO players (name, nickname, image_link)
                VALUES (%s, %s, %s)
                """,
                players,
            )
            log(f"Inserted players rows in {perf_counter() - insert_started:.2f}s")

            log("Inserting matches rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO matches (
                    match_id,
                    season,
                    date_local,
                    time_local,
                    venue,
                    type,
                    winner_team,
                    is_forfeit
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                matches,
            )
            log(f"Inserted matches rows in {perf_counter() - insert_started:.2f}s")

            log("Inserting match_teams rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO match_teams (
                    match_id,
                    team_number,
                    player_1_id,
                    player_2_id,
                    sets_won
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                match_teams,
            )
            log(f"Inserted match_teams rows in {perf_counter() - insert_started:.2f}s")

            log("Inserting match_sets rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO match_sets (
                    match_id,
                    set_number,
                    team_1_games,
                    team_2_games
                )
                VALUES (%s, %s, %s, %s)
                """,
                match_sets,
            )
            log(f"Inserted match_sets rows in {perf_counter() - insert_started:.2f}s")

            reset_sequences(cursor)

        log("Committing transaction")
        conn.commit()

    log("Full refresh complete")
    log(f"Players loaded: {len(players)}")
    log(f"Matches loaded: {len(matches)}")
    log(f"Match teams loaded: {len(match_teams)}")
    log(f"Match sets loaded: {len(match_sets)}")


if __name__ == "__main__":
    main()