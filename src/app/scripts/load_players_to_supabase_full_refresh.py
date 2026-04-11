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

PLAYERS_CSV = OUTPUT_DIR / "players.csv"


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


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


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


def main() -> None:
    if not PLAYERS_CSV.exists():
        raise SystemExit(f"Missing required CSV: {PLAYERS_CSV}")

    players = read_players()
    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Truncating players table (cascades to all FK-dependent tables)")
            cursor.execute(
                "TRUNCATE TABLE players RESTART IDENTITY CASCADE"
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

        log("Committing transaction")
        conn.commit()

    log("Players load complete")
    log(f"Players loaded: {len(players)}")


if __name__ == "__main__":
    main()
